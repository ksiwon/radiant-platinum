// 상태 이상·능력 변화 연출 (원작 「부분 연출」 · `engine/battle/vfx`의 `STATUS_ANIMS`)
//
// 뷰가 `lastEffect`를 내밀면 그 자리 몸에서 한 번 돈다. 원작 대본 한 벌이 하는 일이
// 셋이고 셋 다 여기서 옮긴다:
//
//   입자     `CreateEmitter 0, res, EMITTER_CB_SET_POS_TO_ATTACKER` — 원작 `.spa` 그대로
//            (`waza` 묶음 27 `status_effect` · 114 `thunder_shock`). 그리는 것은 `SplParticles`다
//   몸 물들임 `Func_FadeBattlerSprite` — 몸이 보라·빨강·검정으로 물들었다 돌아온다
//   무늬     `Func_StatChangeUp`·`Down` — 화살 무늬가 **몸 실루엣 안에서만** 흐른다
//
// ⚠️ **몸에 거는 둘은 몸을 한 벌 더 그려서 건다.** 원작은 몸 그림의 팔레트를 섞거나
// (`BlendPalette`) 몸을 OBJ 창으로 써서 그 안에만 배경 무늬를 비춘다
// (`GX_WNDMASK_OW` · `GX_OAM_MODE_OBJWND`). 3D에서 그 둘과 같은 것이 「같은 뼈 · 같은 정점으로
// 몸을 한 겹 더 그리고 그 겹만 물들이는」 것이다 — 겹은 깊이를 `LessEqual`로 보므로 몸에서
// 보이는 면에만 앉고, 무늬는 **화면 좌표**로 찍어 원작처럼 몸이 움직여도 무늬는 화면에 붙어 흐른다.
//
// ⚠️ **몸을 무대 트리에서 찾는다.** 몸은 `BattleStage`의 `Slot`이 들고 있고 그 자리를 밖으로
// 내놓는 다리가 없다. `Slot`의 바깥 그룹이 발판 자리 `(x, 0, z)`에 서 있으므로 같은 부모 아래
// 그 자리에 선 그룹에서 **그림자를 드리우는 메시**(몸 · 도트 · 대체 캡슐)를 고른다.
// 대타 인형도 그림자를 드리우지만 대타 뒤에는 이 연출이 안 선다(`view`의 `withEffect`).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color, DataTexture, LessEqualDepth, Mesh, NearestFilter, RepeatWrapping, RGBAFormat,
  SkinnedMesh, SRGBColorSpace, type Group, type Material, type Object3D,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { ALWAYS_ASYNC } from '../asyncPipelines'
import { float, screenCoordinate, screenSize, step, texture, uniform, uv, vec2, vec3 } from 'three/tsl'
import { loadParticles } from '../../data/gameData'
import { music } from '../../engine/audio/music'
import { battleClock } from '../../engine/battle/presentationClock'
import {
  STATUS_ANIMS, spriteFadeTrack, statChangeAt, statusAnimFrames, statusPan, statusSoundFrames,
  type StatusAnimKey,
} from '../../engine/battle/vfx'
import type { SlotId } from '../../engine/battle/events'
import { color as bgr555 } from '../../import/platinum/nitrotex'
import {
  STAT_CHANGE_BG, STAT_CHANGE_H, STAT_CHANGE_W, statChangePattern, type StatChangeRow,
} from '../../import/platinum/particles'
import { useBattleStore } from '../../state/battleStore'
import { torsoY } from './moveAnchor'
import { SplParticles } from './SplParticles'
import type { SplCue } from './splDraw'
import { splFileFor, preloadSplPack, SPL_WAZA } from './splPack'
import { splMetre, type SplBasis, type Vec3 } from './splPlace'
import { tallOf } from './stageRefs'

/** DS 화면 높이(픽셀). 무늬 한 칸이 화면에서 차지하는 몫을 원작과 같게 맞춘다 */
const DS_SCREEN_H = 192

/** 무늬 줄마다 한 장. 배틀마다 다시 풀 까닭이 없다 — 두 장 합쳐 1MB다 */
const patterns = new Map<StatChangeRow, Promise<DataTexture>>()

function patternTexture(row: StatChangeRow): Promise<DataTexture> {
  let got = patterns.get(row)
  if (!got) {
    got = loadParticles(STAT_CHANGE_BG.name).then((pack) => {
      const tex = new DataTexture(
        statChangePattern(pack.bytes, pack, row), STAT_CHANGE_W, STAT_CHANGE_H, RGBAFormat,
      )
      // 도트 무늬다 — 거르면 화살 테두리가 번진다. 화면 폭이 DS보다 넓은 만큼은 되풀이가 메운다
      tex.magFilter = NearestFilter
      tex.minFilter = NearestFilter
      tex.wrapS = RepeatWrapping
      tex.wrapT = RepeatWrapping
      tex.colorSpace = SRGBColorSpace
      tex.needsUpdate = true
      return tex
    })
    got.catch(() => { patterns.delete(row) })
    patterns.set(row, got)
  }
  return got
}

/** 0으로 시작하는 float 유니폼 하나 */
const floatUniform = () => uniform(0)
type FloatUniform = ReturnType<typeof floatUniform>

/** 한 번 도는 연출 */
interface Shot {
  key: StatusAnimKey
  slot: SlotId
  seq: number
  /** 연출 시계에서 시작한 시각(초) */
  startedAt: number
  /** 그 자리 발판 (x, z) */
  floor: [number, number]
  /** 화살 무늬. 아직 못 풀었으면 그 한 번은 무늬 없이 간다 */
  pattern: DataTexture | null
}

/**
 * 몸 위에 한 겹 더 그릴 재질.
 *
 * 원작 섞기가 「겹 a/16 + 몸 (16−a)/16」이므로 겹의 불투명도가 곧 a/16이다. 몸 재질이 그림의
 * 알파로 오려 내는 것(도트 · 머리털 같은 판)이면 겹도 그 알파로 오린다 — 안 그러면 판 전체가 물든다
 */
function overlayMaterial(
  source: Material, colour: Color | null, pattern: DataTexture | null,
  alpha: FloatUniform, offset: FloatUniform,
): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  // 처음 그리는 프레임에 몸 조각 일곱 개를 동기로 굽지 않는다 (`asyncPipelines`의 `ALWAYS_ASYNC`)
  mat.userData[ALWAYS_ASYNC] = true
  mat.depthFunc = LessEqualDepth
  // 같은 정점을 같은 뼈로 두 번 그린다 — 깊이가 같아도 겹이 이기게 한 칸 당긴다
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -1
  mat.polygonOffsetUnits = -1
  if (pattern !== null) {
    // 화면 좌표 → DS 픽셀. 무늬는 몸이 아니라 **화면**에 붙어 있고(BG), `offset`만큼 세로로 흐른다
    const ds = screenCoordinate.mul(float(DS_SCREEN_H).div(screenSize.y))
    mat.colorNode = texture(pattern, vec2(ds.x.div(STAT_CHANGE_W), ds.y.add(offset).div(STAT_CHANGE_H))).rgb
  } else {
    const c = colour ?? new Color(0, 0, 0)
    mat.colorNode = vec3(c.r, c.g, c.b)
  }
  const src = source as Material & { map?: DataTexture | null; alphaTest: number }
  if (src.map && (src.alphaTest > 0 || src.transparent)) {
    const a = texture(src.map, uv()).a
    mat.opacityNode = src.alphaTest > 0 ? alpha.mul(step(src.alphaTest, a)) : alpha.mul(a)
  } else {
    mat.opacityNode = alpha
  }
  return mat
}

/** 다 쓴 겹 재질 — 유니폼까지 제 것을 든다 */
interface Overlay { mat: MeshBasicNodeMaterial; alpha: FloatUniform; offset: FloatUniform }

/**
 * 겹 재질을 **버리지 않고** 몸 재질 · 색 · 무늬별 통에 넣어 다음 연출이 꺼내 쓴다.
 *
 * ⚠️ **버리면 파이프라인도 같이 버려진다.** three(WebGPU)는 파이프라인을 쓰는 렌더 물체 수로 세고, 재질의 `dispose`가
 * 그 물체를 지운다. 능력치가 바뀔 때마다 몸 조각 일곱 개의 파이프라인을 GPU 프로세스가 다시 지어서 그 프레임이
 * 0.5초 넘게 멎었다(`.audit/reels/lag-after3.log` · `createRenderPipeline` 감시 실측 2026-10-05). 몸 재질이 그대로인 한
 * 같은 키가 다시 오므로 통은 판에 나온 마리 수만큼만 큰다
 */
const overlayPool = new Map<string, Overlay[]>()

function overlayKey(source: Material, colour: Color | null, pattern: DataTexture | null): string {
  return `${source.uuid}|${colour?.getHexString() ?? '-'}|${pattern?.uuid ?? '-'}`
}

function takeOverlay(source: Material, colour: Color | null, pattern: DataTexture | null): Overlay {
  const got = overlayPool.get(overlayKey(source, colour, pattern))?.pop()
  if (got) return got
  const alpha = floatUniform()
  const offset = floatUniform()
  return { mat: overlayMaterial(source, colour, pattern, alpha, offset), alpha, offset }
}

function giveBackOverlay(source: Material, colour: Color | null, pattern: DataTexture | null, o: Overlay): void {
  o.alpha.value = 0
  const key = overlayKey(source, colour, pattern)
  const pool = overlayPool.get(key) ?? []
  pool.push(o)
  overlayPool.set(key, pool)
}

/** 그 메시와 같은 뼈 · 같은 정점으로 한 겹 */
function overlayMesh(src: Mesh, material: MeshBasicNodeMaterial | MeshBasicNodeMaterial[]): Mesh {
  let o: Mesh
  if ((src as SkinnedMesh).isSkinnedMesh) {
    const s = src as SkinnedMesh
    const k = new SkinnedMesh(s.geometry, material)
    k.bindMode = s.bindMode
    k.bind(s.skeleton, s.bindMatrix)
    o = k
  } else {
    o = new Mesh(src.geometry, material)
  }
  o.position.copy(src.position)
  o.quaternion.copy(src.quaternion)
  o.scale.copy(src.scale)
  // 표정 섞기도 몸과 같은 값을 본다 — 배열을 같이 쥔다
  if (src.morphTargetInfluences) o.morphTargetInfluences = src.morphTargetInfluences
  if (src.morphTargetDictionary) o.morphTargetDictionary = src.morphTargetDictionary
  o.frustumCulled = false
  o.castShadow = false
  o.receiveShadow = false
  o.renderOrder = src.renderOrder + 1
  o.userData.statusOverlay = true
  return o
}

/**
 * 그 발판에 선 몸의 메시들.
 *
 * `Slot`의 바깥 그룹이 `(x, 0, z)`에 서 있고 그 안의 몸이 그림자를 드리운다.
 *
 * ⚠️ **몸 그룹이 지금 숨어 있어도 고른다.** `Slot`이 맞을 때 몸 그룹을 깜빡이는데
 * (`visible`을 껐다 켠다) 그 한 프레임에 연출이 서면 겹이 통째로 빠진다. 겹은 몸과 같은
 * 부모 아래에 붙으므로 몸이 숨으면 같이 숨는다 — 그래서 바깥 두 층은 `visible`을 안 보고,
 * 모델 안쪽에서 일부러 숨긴 조각만 거른다
 */
function bodyMeshes(stage: Object3D, floor: [number, number], self: Object3D): Mesh[] {
  const out: Mesh[] = []
  const walk = (o: Object3D, depth: number): void => {
    if (depth > 1 && !o.visible) return
    const m = o as Mesh
    if (m.isMesh && m.castShadow && m.userData.statusOverlay !== true) out.push(m)
    for (const c of o.children) walk(c, depth + 1)
  }
  for (const child of stage.children) {
    if (child === self) continue
    const p = child.position
    if (Math.abs(p.x - floor[0]) > 1e-4 || Math.abs(p.z - floor[1]) > 1e-4 || p.y !== 0) continue
    walk(child, 0)
  }
  return out
}

function StatusShot({ shot, stage, done }: {
  shot: Shot
  stage: () => { parent: Object3D | null; self: Object3D | null }
  done: (seq: number) => void
}) {
  const anim = STATUS_ANIMS[shot.key]
  const camera = useThree((s) => s.camera)
  const total = useMemo(() => statusAnimFrames(shot.key), [shot.key])
  const fade = useMemo(() => (anim.fade === null ? null : spriteFadeTrack(anim.fade).alpha), [anim])
  // 이 연출이 지금 쥔 겹들 — 값은 여기서 한 번 셈해 그 겹들의 유니폼에 나눠 넣는다
  const alpha = useMemo(() => ({ value: 0 }), [])
  const offset = useMemo(() => ({ value: 0 }), [])
  const taken = useRef<Overlay[]>([])
  const sounds = useMemo(() => statusSoundFrames(anim.sound), [anim])
  const played = useRef(0)
  const ended = useRef(false)

  // 몸에 거는 겹. 무늬도 물들임도 없는 연출(잠·얼음·혼란)은 몸에 아무것도 안 건다
  useEffect(() => {
    if (anim.fade === null && (anim.statChange === null || shot.pattern === null)) return undefined
    const { parent, self } = stage()
    if (parent === null || self === null) return undefined
    const colour = anim.fade === null ? null : new Color().setRGB(
      ...(bgr555(anim.fade.color).map((v) => v / 255) as [number, number, number]), SRGBColorSpace,
    )
    const pattern = anim.statChange === null ? null : shot.pattern
    const made: { mesh: Mesh; sources: Material[]; overlays: Overlay[] }[] = []
    for (const src of bodyMeshes(parent, shot.floor, self)) {
      if (src.parent === null) continue
      const sources = Array.isArray(src.material) ? src.material : [src.material]
      const overlays = sources.map((m) => takeOverlay(m, colour, pattern))
      const mats = overlays.map((o) => o.mat)
      const mesh = overlayMesh(src, Array.isArray(src.material) ? mats : mats[0]!)
      src.parent.add(mesh)
      made.push({ mesh, sources, overlays })
    }
    taken.current = made.flatMap((m) => m.overlays)
    return () => {
      taken.current = []
      for (const { mesh, sources, overlays } of made) {
        mesh.removeFromParent()
        // 정점·뼈는 몸의 것이라 안 버린다 — 재질은 통에 돌려준다 (`overlayPool`)
        overlays.forEach((o, i) => { giveBackOverlay(sources[i]!, colour, pattern, o) })
      }
    }
  }, [anim, shot, stage])

  // 입자. 그 자리 몸통에 붙인다 (`EMITTER_CB_SET_POS_TO_ATTACKER` — 원작 `WORLD_POS_TYPE_NORMAL`이
  // 스프라이트 한가운데다). 혼란만 오프셋만큼 올린다
  const particles = useMemo(() => {
    const p = anim.particle
    if (p === null) return null
    const file = splFileFor(SPL_WAZA, p.member)
    if (file === null) return null
    const metre = splMetre(tallOf(shot.slot))
    const at: Vec3 = [shot.floor[0], torsoY(shot.slot) + p.lift * metre, shot.floor[1]]
    const cues: SplCue[] = [{ file, res: p.res, at: 'attacker', frame: 0 }]
    // ⚠️ **축은 카메라에서 세운다.** 쓴 쪽과 맞는 쪽이 같은 마리라 두 자리로는 「앞」이 안 선다
    // (`splBasis(by, by)`는 축을 지어낸다). 원작 입자 공간이 「+X 화면 오른쪽 · +Y 위 ·
    // +Z 화면 앞」이므로 그대로 카메라의 오른쪽 · 위 · 앞이다
    camera.updateMatrixWorld()
    const e = camera.matrixWorld.elements
    const flat = Math.hypot(e[0]!, e[2]!)
    const ex: Vec3 = flat > 1e-6 ? [e[0]! / flat, 0, e[2]! / flat] : [1, 0, 0]
    const basis: SplBasis = { ex, ey: [0, 1, 0], ez: [-ex[2], 0, ex[0]] }
    return { cues, at, metre, basis }
  }, [anim, shot, camera])

  useFrame(() => {
    if (ended.current) return
    const f = Math.floor((battleClock.now() - shot.startedAt) * 60)
    if (f < 0) return
    // 소리 — 정한 프레임이 지나면 한 번씩 (`BattleAnimSoundFunc_Repeat`)
    while (played.current < sounds.length && f >= sounds[played.current]!) {
      played.current += 1
      void music.playEffect(anim.sound.seq, 1, { pan: statusPan(anim.sound.pan, shot.slot.startsWith('p1')) })
    }
    if (anim.statChange !== null) {
      const at = statChangeAt(f, anim.statChange.step)
      alpha.value = at.alpha / 16
      offset.value = at.offset
    } else if (fade !== null) {
      alpha.value = (fade[f] ?? 0) / 16
    }
    if (f >= total) {
      ended.current = true
      alpha.value = 0
      done(shot.seq)
    }
    for (const o of taken.current) { o.alpha.value = alpha.value; o.offset.value = offset.value }
  })

  if (particles === null) return null
  return (
    <SplParticles
      cues={particles.cues}
      by={particles.at}
      foe={particles.at}
      metre={particles.metre}
      basis={particles.basis}
      seed={shot.seq}
    />
  )
}

/**
 * 뷰가 부분 연출을 내밀면 그 자리에서 한 번 돈다. 더블에서 위협이 두 마리에게 걸리듯
 * 앞엣것이 끝나기 전에 다음 것이 올 수 있어서 **여럿을 같이** 든다
 */
export function StatusVfx({ spotAt }: { spotAt: (slot: SlotId) => [number, number] }) {
  const effect = useBattleStore((s) => s.view?.lastEffect ?? null)
  const [shots, setShots] = useState<readonly Shot[]>([])
  const [ready, setReady] = useState<Partial<Record<StatChangeRow, DataTexture>>>({})
  const host = useRef<Group>(null)
  const last = useRef<number | null>(null)

  // ⚠️ **여기서 미리 받는다.** 연출이 서는 그 프레임에는 기다릴 수 없다
  useEffect(() => {
    let alive = true
    void preloadSplPack(SPL_WAZA)
    for (const row of [STATUS_ANIMS.statBoost.statChange!.row, STATUS_ANIMS.statDrop.statChange!.row]) {
      patternTexture(row)
        .then((tex) => {
          if (alive) setReady((was) => ({ ...was, [row]: tex }))
        })
        .catch(() => {
          /* 무늬 없이 간다 — 소리는 그대로 난다 */
        })
    }
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    // 새 판은 순번이 1부터 다시 선다 — 앞 판의 마지막 순번을 들고 있으면 첫 연출이 막힌다
    if (effect === null) {
      last.current = null
      return
    }
    if (last.current === effect.seq) return
    last.current = effect.seq
    const row = STATUS_ANIMS[effect.key].statChange?.row
    setShots((was) => [...was, {
      key: effect.key,
      slot: effect.slot,
      seq: effect.seq,
      startedAt: battleClock.now(),
      floor: spotAt(effect.slot),
      pattern: row === undefined ? null : ready[row] ?? null,
    }])
  }, [effect, spotAt, ready])

  const stage = useMemo(() => () => ({
    parent: host.current?.parent ?? null,
    self: host.current,
  }), [])

  return (
    <group ref={host}>
      {shots.map((shot) => (
        <StatusShot
          // ⚠️ **연출마다 새 컴포넌트다** — 앞 연출의 소리 · 진행이 이어지지 않는다
          key={shot.seq}
          shot={shot}
          stage={stage}
          done={(seq) => {
            setShots((was) => was.filter((s) => s.seq !== seq))
          }}
        />
      ))}
    </group>
  )
}
