import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Box3, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Euler, Group, Mesh, MeshBasicMaterial,
  NearestFilter, SRGBColorSpace, Vector3,
} from 'three'
import { HALL_OF_FAME_BG_ATLAS, loadHallOfFameBg } from '../data/gameData'
import { atlasUrl } from '../data/providers/atlas'
import { createRig, updateLocomotion, type Rig } from '../engine/actor/locomotion'
import { RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { useHallOfFameStageStore } from '../state/hallOfFameStageStore'
import { play } from './battle/monModel'
import { useMonBody } from './monBody'
import {
  HOF_CAMERA_DIST, HOF_CONFETTI_HALF, HOF_FRAME_MS, HOF_HALF_FOV, HOF_MON_Y, HOF_PARTY_Y, HOF_PLAYER_X,
  HOF_SPOT_ALPHA, hofConfetti, hofConfettiAt, hofConfettiColor, hofConfettiStep, hofMonShown, hofMonX, hofPartyX,
  hofPlayerY, hofScreenToWorld, hofSpotlights, hofSpotQuad, hofSpotStep, type HofBeat,
} from './hallOfFameChoreo'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { hallFitScale } from './cinematicMotion'
import { playerModelPath } from './playerModelPath'
import { usePersonModel } from './personModel'


// ─── PC 다시보기 (`PCHallOfFameScreen`) — 원작은 2D 그림 판이라 우리 3D 단상으로 선다 ──────────────────

const PARTY_POSITIONS = [
  [0, 0, -1.45],
  [-1.75, 0, -0.35],
  [1.75, 0, -0.35],
  [-2.65, 0, 1.25],
  [0, 0, 1.25],
  [2.65, 0, 1.25],
] as const

function FallbackMon({ species }: { species: number }) {
  const hue = (species * 47) % 360
  const color = `hsl(${String(hue)} 48% 58%)`
  return (
    <group position={[0, 0.75, 0]}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <capsuleGeometry args={[0.46, 0.72, 8, 18]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.4, 18, 12]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
    </group>
  )
}

interface MonLook {
  species: number
  form: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
}

function ArchiveMon({ species, form, gender, shiny, position, selected }: MonLook & {
  position: readonly [number, number, number]
  selected: boolean
}) {
  const group = useRef<Group>(null)
  // 몸이 안 오면 절차형 몸을 쓴다
  const body = useMonBody(species, { form, gender, shiny })
  const shown = useRef(0)
  /** 몸의 가로 폭(몸 단위) — 길고 넓은 몸이 옆 단상까지 덮지 않게 자를 때 쓴다 (`hallFitScale`) */
  const wide = useMemo(() => {
    if (!body) return 0
    const size = new Box3().setFromObject(body.root).getSize(new Vector3())
    return Math.max(size.x, size.z)
  }, [body])

  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    shown.current += (1 - shown.current) * Math.min(1, delta * 5.5)
    const appear = shown.current
    node.visible = appear > 0.01
    const base = body ? hallFitScale(body.tall, wide) : 1
    node.scale.setScalar(base * appear * (selected ? 1.06 : 0.9))
    node.position.set(
      position[0],
      position[1] + Math.sin(state.clock.elapsedTime * 1.7 + species) * 0.025,
      position[2],
    )
  })

  return (
    <group ref={group} visible={false} position={position}>
      {body ? <primitive object={body.root} /> : <FallbackMon species={species} />}
      {selected && (
        <>
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.72, 0.83, 48]} />
            <meshBasicMaterial color="#ffe68a" transparent opacity={0.82} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 1.5, 1]} color="#fff0a8" intensity={0.9} distance={4.5} />
        </>
      )}
    </group>
  )
}

function SpotBeams() {
  return (
    <group>
      {[-3.8, -2.25, -0.75, 0.75, 2.25, 3.8].map((x, index) => (
        <group key={x} position={[x, 4.2, 0]} rotation={[0, 0, (x / 3.8) * 0.12]}>
          <mesh position={[0, -2.1, 0]}>
            <coneGeometry args={[1.05, 4.2, 20, 1, true]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? '#8fc5ff' : '#c5a8ff'}
              transparent
              opacity={0.055}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <pointLight
            position={[0, -1.9, 0.5]}
            color={index % 2 === 0 ? '#8fc5ff' : '#c5a8ff'}
            intensity={0.32}
            distance={4.5}
          />
        </group>
      ))}
    </group>
  )
}

function ArchiveRoom({ mons, selected }: { mons: readonly MonLook[], selected: number }) {
  return (
    <>
      <mesh position={[0, 3.4, -5.2]} scale={[19, 10, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#030712" fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 72]} />
        <meshStandardMaterial color="#101a32" roughness={0.88} metalness={0.08} fog={false} />
      </mesh>
      <SpotBeams />
      {PARTY_POSITIONS.map(([x, , z], index) => (
        <mesh key={index} position={[x, 0.035, z]} receiveShadow>
          <cylinderGeometry args={[0.78, 0.9, 0.12, 40]} />
          <meshStandardMaterial
            color={index === selected ? '#436a9c' : '#202f4c'}
            roughness={0.55}
            metalness={0.22}
          />
        </mesh>
      ))}
      {mons.slice(0, 6).map((mon, index) => (
        <ArchiveMon
          key={`${String(index)}-${String(mon.species)}-${String(mon.form)}`}
          {...mon}
          position={PARTY_POSITIONS[index]!}
          selected={index === selected}
        />
      ))}
    </>
  )
}

// ─── 등록 장면 — 원작 좌표 그대로 (`hallOfFameChoreo`) ─────────────────────────────────────────

/**
 * 몸들이 서는 거리 (카메라에서). 원작의 3D(조명 · 색종이)는 거리 5에 있고 **OBJ보다 위다** — 몸은 그 뒤에 세운다.
 * 겹칠 때 위에 오는 차례가 주인공(`priority 0`) · 0번(`1 + i`) · 1번 …이라 그 차례로 가깝다
 */
const PLAYER_DEPTH = 6.5
const monDepth = (i: number): number => 7 + i * 0.6
/** 원작 그림 한 칸이 80×80이다 — 몸을 그 안에 세운다 (키 72 · 폭 80) */
const FIT_TALL = 72
const FIT_WIDE = 80

/** 파티가 서 있는 걸음 (`HallOfFame_ShowPartySprites` 뒤) */
const PARTY_BEATS: ReadonlySet<HofBeat> = new Set<HofBeat>([
  'partyIn', 'partyHold', 'confetti', 'wipe', 'fadeOut', 'saving', 'saved',
])
/** 주인공이 서 있는 걸음 (`HallOfFame_ShowPlayerSprite` 뒤) */
const PLAYER_BEATS: ReadonlySet<HofBeat> = new Set<HofBeat>([
  'playerIn', 'playerHold', 'expand', 'playerText', ...PARTY_BEATS,
])
/** 색종이가 도는 걸음 (`HallOfFame_SetConfettiActive` 뒤 — 끄는 곳이 없다) */
const CONFETTI_BEATS: ReadonlySet<HofBeat> = new Set<HofBeat>(['confetti', 'wipe', 'fadeOut', 'saving', 'saved'])

/** 지금 걸음과 그 걸음에 들어선 뒤의 원작 프레임 */
function cueNow(): { beat: HofBeat, frame: number, selected: number } {
  const { beat, since, selected } = useHallOfFameStageStore.getState()
  return { beat, frame: (performance.now() - since) / HOF_FRAME_MS, selected }
}

/** 원작 5비트 색 → three 색 */
function dsColor(c: readonly [number, number, number], into = new Color()): Color {
  const ch = (v: number): number => ((Math.round(v) << 3) | (Math.round(v) >> 2)) / 255
  return into.setRGB(ch(c[0]), ch(c[1]), ch(c[2]), SRGBColorSpace)
}

/**
 * 몸 하나를 원작 그림 자리에 세운다 — 화면 픽셀 `(x, y)`가 몸의 **가운데**다 (`Sprite_SetPosition`은 그림 가운데를 옮긴다)
 */
function placeAt(
  node: Group, x: number, y: number, depth: number, fit: { tall: number, wide: number, cx: number, cy: number },
): void {
  const w = hofScreenToWorld(x, y, depth)
  const scale = Math.min((FIT_TALL * w.unit) / fit.tall, (FIT_WIDE * w.unit) / fit.wide)
  node.scale.setScalar(scale)
  node.position.set(w.x - fit.cx * scale, w.y - fit.cy * scale, HOF_CAMERA_DIST - depth)
}

/** 절차형 몸의 크기 (`FallbackMon`) */
const FALLBACK_FIT = { tall: 2.2, wide: 0.92, cx: 0, cy: 1.1 }

function CeremonyMon({ index, species, form, gender, shiny }: MonLook & { index: number }) {
  const group = useRef<Group>(null)
  const body = useMonBody(species, { form, gender, shiny })
  const fit = useMemo(() => {
    if (!body) return FALLBACK_FIT
    const box = new Box3().setFromObject(body.root)
    const size = box.getSize(new Vector3()), center = box.getCenter(new Vector3())
    return { tall: Math.max(size.y, 1e-3), wide: Math.max(size.x, 1e-3), cx: center.x, cy: center.y }
  }, [body])
  const cried = useRef(-1)

  // 울고 나면 대기로 돌아온다
  useEffect(() => {
    if (!body) return
    const back = (): void => { play(body, 'wait') }
    body.mixer.addEventListener('finished', back as never)
    return () => { body.mixer.removeEventListener('finished', back as never) }
  }, [body])

  useFrame(() => {
    const node = group.current
    if (!node) return
    const { beat, frame, selected } = cueNow()
    const solo = index === selected && hofMonShown(beat)
    const party = PARTY_BEATS.has(beat)
    node.visible = solo || party
    if (solo) placeAt(node, hofMonX(index & 1, beat, frame), HOF_MON_Y, monDepth(index), fit)
    else if (party) placeAt(node, hofPartyX(index, beat, frame), HOF_PARTY_Y[index]!, monDepth(index), fit)
    // 글이 뜨는 순간 한 번 운다 (`HallOfFame_InitPokemonAnimation(…, playCry: TRUE)`)
    const since = useHallOfFameStageStore.getState().since
    if (solo && beat === 'monText1' && body && cried.current !== since) {
      cried.current = since
      play(body, 'cry')
    }
  })

  return (
    <group ref={group} visible={false}>
      {body ? <primitive object={body.root} /> : <FallbackMon species={species} />}
    </group>
  )
}

function CeremonyPlayer({ gender }: { gender: 'boy' | 'girl' }) {
  const group = useRef<Group>(null)
  const wrapper = useRef<Group>(null)
  // 받는 것은 오프닝과 같다. 안 오면 플레이어만 없는 채로 포켓몬 장면은 계속 돈다
  const model = usePersonModel(playerModelPath(gender))
  /** 서 있는 자세 — 안 돌리면 바인드 자세(T)로 선다. 오프닝과 같은 절차형이다 (`IntroStage`) */
  const rig = useRef<Rig | null>(null)

  useLayoutEffect(() => {
    if (!wrapper.current || !model) return
    normalizeModel(wrapper.current, model, PLAYER_HEIGHT)
    rig.current = createRig(model, wrapper.current)
    return () => { rig.current = null }
  }, [model])

  useFrame((_, delta) => {
    if (rig.current) updateLocomotion(rig.current, delta, 0, WALK_SPEED, RUN_SPEED)
    const node = group.current
    if (!node) return
    const { beat, frame } = cueNow()
    node.visible = PLAYER_BEATS.has(beat)
    if (node.visible) {
      placeAt(node, HOF_PLAYER_X, hofPlayerY(beat, frame), PLAYER_DEPTH,
        { tall: PLAYER_HEIGHT, wide: PLAYER_HEIGHT * 0.6, cx: 0, cy: PLAYER_HEIGHT / 2 })
    }
  })

  return (
    <group ref={group} visible={false}>
      <group ref={wrapper}>{model && <primitive object={model} />}</group>
    </group>
  )
}

/** 한 번에 따라잡는 프레임의 끝 — 탭을 오래 비웠다 돌아오면 그 사이는 건너뛴다 */
const CATCH_UP = 120

/**
 * 조명 여섯 (`HallOfFame_InitSpotlightsTask` · `ov86_0223CB74`). 장면이 뜨는 순간부터 끝까지 돈다 — 창 밖은 BG2가 덮는다.
 * 바닥이 좁고(±80) 끝이 넓은(±576) 판이 10°~170°를 오간다. 불투명도 16/31, 빛을 안 받는다(`GX_LIGHTMASK_NONE`)
 */
function RomSpotlights() {
  const spots = useMemo(() => hofSpotlights(), [])
  const geoms = useMemo(() => spots.map(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(12), 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    return g
  }), [spots])
  const mats = useMemo(() => spots.map((s) => new MeshBasicMaterial({
    color: dsColor(s.color), transparent: true, opacity: HOF_SPOT_ALPHA, depthWrite: false,
    side: DoubleSide, toneMapped: false, fog: false,
  })), [spots])
  const start = useRef(performance.now())
  const done = useRef(0)

  useEffect(() => () => {
    for (const g of geoms) g.dispose()
    for (const m of mats) m.dispose()
  }, [geoms, mats])

  useFrame(() => {
    const target = Math.floor((performance.now() - start.current) / HOF_FRAME_MS)
    if (target - done.current > CATCH_UP) done.current = target - CATCH_UP
    for (; done.current < target; done.current++) for (const s of spots) hofSpotStep(s)
    spots.forEach((s, i) => {
      const at = geoms[i]!.getAttribute('position') as BufferAttribute
      hofSpotQuad(s).forEach(([x, y], k) => { at.setXYZ(k, x, y, 0) })
      at.needsUpdate = true
    })
  })

  return (
    <>
      {spots.map((_, i) => (
        <mesh key={i} geometry={geoms[i]} material={mats[i]} frustumCulled={false} renderOrder={10} />
      ))}
    </>
  )
}

/**
 * 색종이 마흔여덟 (`HallOfFame_InitConfettiTask` · `HallOfFame_DoConfettiAnimation`). 씨앗 13716으로 깔아 두고,
 * 파티가 다 선 뒤 켜지면 한 프레임에 85씩 떨어지며 세 축으로 돈다. 색은 원작 정점 조명을 프레임마다 다시 잰다
 */
function RomConfetti() {
  const bits = useMemo(() => hofConfetti(), [])
  const refs = useRef<(Mesh | null)[]>([])
  const mats = useMemo(() => bits.map(() => new MeshBasicMaterial({ side: DoubleSide, toneMapped: false, fog: false })), [bits])
  const began = useRef<number | null>(null)
  const done = useRef(0)
  const euler = useMemo(() => new Euler(0, 0, 0, 'XYZ'), [])
  const normal = useMemo(() => new Vector3(), [])

  useEffect(() => () => { for (const m of mats) m.dispose() }, [mats])

  useFrame(() => {
    const { beat } = cueNow()
    const active = CONFETTI_BEATS.has(beat)
    if (active && began.current === null) began.current = performance.now()
    if (!active) {
      for (const m of refs.current) if (m) m.visible = false
      return
    }
    const target = Math.floor((performance.now() - began.current!) / HOF_FRAME_MS)
    if (target - done.current > CATCH_UP) done.current = target - CATCH_UP
    for (; done.current < target; done.current++) for (const c of bits) hofConfettiStep(c)
    bits.forEach((c, i) => {
      const mesh = refs.current[i]
      if (!mesh) return
      mesh.visible = true
      const [x, y, z] = hofConfettiAt(c)
      mesh.position.set(x, y, z)
      const turn = (v: number): number => (v * Math.PI * 2) / 65536
      euler.set(turn(c.rot[0]), turn(c.rot[1]), turn(c.rot[2]))
      mesh.rotation.copy(euler)
      normal.set(0, 0, -1).applyEuler(euler)
      dsColor(hofConfettiColor([normal.x, normal.y, normal.z], c.color), mats[i]!.color)
    })
  })

  return (
    <>
      {bits.map((_, i) => (
        <mesh
          key={i}
          ref={(node) => { refs.current[i] = node }}
          material={mats[i]}
          visible={false}
          frustumCulled={false}
          renderOrder={9}
        >
          <planeGeometry args={[HOF_CONFETTI_HALF[0] * 2, HOF_CONFETTI_HALF[1] * 2]} />
        </mesh>
      ))}
    </>
  )
}

/** 원작 배경 판 하나의 크기 */
const BG_W = 256
const BG_H = 192
/** 뒤판을 세우는 거리 — 모델보다 멀고 카메라 먼 끝보다 가깝다 */
const BG_DIST = 60

/**
 * 원작 배경 (`dendou_demo` BG3 — `data/hallOfFameBg.png` 위 두 판). 한 마리씩일 때는 판 0(초록),
 * 파티와 주인공일 때는 판 1(빨강)이다 (`HallOfFame_State_ShowPartyAndPlayer`가 판을 갈아 끼운다).
 *
 * 카메라 앞에 세우고 **화면의 4:3 무대 상자와 같은 크기**로 맞춘다 — DOM 쪽 창과 한 픽셀도 안 어긋나야
 * 창 안에 원작 배경이 비친다. 창 밖은 DOM이 BG2(검정)로 덮는다 (`ui/menu/HallOfFameScreen`)
 */
function HallBackdrop({ party }: { party: boolean }) {
  const camera = useThree((s) => s.camera)
  const mesh = useRef<Mesh>(null)
  const [maps, setMaps] = useState<[CanvasTexture, CanvasTexture] | null>(null)
  const ahead = useMemo(() => new Vector3(), [])

  useEffect(() => {
    let alive = true
    const made: CanvasTexture[] = []
    void loadHallOfFameBg().then(() => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => { resolve(img) }
      img.onerror = () => { reject(new Error('전당 배경을 못 읽었다')) }
      img.src = atlasUrl(HALL_OF_FAME_BG_ATLAS)
    })).then((img) => {
      if (!alive) return
      const slice = (at: number): CanvasTexture => {
        const c = document.createElement('canvas')
        c.width = BG_W; c.height = BG_H
        c.getContext('2d')?.drawImage(img, 0, at * BG_H, BG_W, BG_H, 0, 0, BG_W, BG_H)
        const t = new CanvasTexture(c)
        t.colorSpace = SRGBColorSpace
        t.magFilter = NearestFilter
        t.minFilter = NearestFilter
        t.generateMipmaps = false
        made.push(t)
        return t
      }
      setMaps([slice(0), slice(1)])
    }).catch(() => { /* 옛 설치본에는 없다 — 뒤가 어두운 채로 선다 */ })
    return () => { alive = false; for (const t of made) t.dispose() }
  }, [])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const cam = camera as typeof camera & { fov?: number, aspect?: number }
    const fov = ((cam.fov ?? 38) * Math.PI) / 180
    const aspect = cam.aspect ?? BG_W / BG_H
    const tall = 2 * BG_DIST * Math.tan(fov / 2)
    // 무대 상자의 높이 비 — `min(100vh, 100vw · 3/4)` ÷ 100vh
    const frac = Math.min(1, (aspect * BG_H) / BG_W)
    camera.getWorldDirection(ahead)
    // ⚠️ **무대 원점 기준이다** — 이 판은 `CINEMATIC_ORIGIN`에 선 모둠 안에 있다. 월드 좌표를 그대로 넣으면 1000 아래로 떨어진다
    m.position.copy(camera.position).addScaledVector(ahead, BG_DIST).sub(CINEMATIC_ORIGIN)
    m.quaternion.copy(camera.quaternion)
    m.scale.set(tall * frac * (BG_W / BG_H), tall * frac, 1)
  })

  if (!maps) return null
  return (
    <mesh ref={mesh} renderOrder={-1000} frustumCulled={false}>
      <planeGeometry />
      <meshBasicMaterial map={maps[party ? 1 : 0]} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  )
}

/** 등록 장면과 PC 재생 화면이 공유하는 실제 3D 명예의 전당 무대. */
export function HallOfFameStage() {
  const mode = useHallOfFameStageStore((state) => state.mode)
  const mons = useHallOfFameStageStore((state) => state.mons)
  const selected = useHallOfFameStageStore((state) => state.selected)
  const gender = useHallOfFameStageStore((state) => state.gender)
  const phase = useHallOfFameStageStore((state) => state.phase)
  const ceremony = mode === 'ceremony'
  const size = useThree((s) => s.size)

  useEffect(() => {
    cinematicStage.active = true
    if (ceremony) {
      // 원작 카메라 — 원점을 정면에서 거리 5로 본다 (`HallOfFame_InitCamera`)
      cinematicStage.position.set(CINEMATIC_ORIGIN.x, CINEMATIC_ORIGIN.y, CINEMATIC_ORIGIN.z + HOF_CAMERA_DIST)
      cinematicStage.target.copy(CINEMATIC_ORIGIN)
    } else {
      cinematicStage.position.set(CINEMATIC_ORIGIN.x, CINEMATIC_ORIGIN.y + 4.1, CINEMATIC_ORIGIN.z + 10.5)
      cinematicStage.target.set(CINEMATIC_ORIGIN.x, CINEMATIC_ORIGIN.y + 1.15, CINEMATIC_ORIGIN.z)
      cinematicStage.fov = 38
    }
    return () => {
      cinematicStage.active = false
    }
  }, [ceremony])

  // 화각은 **4:3 무대 상자의 높이**가 원작의 44°(반각 22°)가 되게 잡는다 — 창이 4:3보다 좁으면 상자가 화면보다 낮아진다
  useEffect(() => {
    if (!ceremony) return
    const frac = Math.min(1, (size.width / Math.max(1, size.height)) * (192 / 256))
    const half = Math.atan(Math.tan((HOF_HALF_FOV * Math.PI) / 180) / frac)
    cinematicStage.fov = (2 * half * 180) / Math.PI
  }, [ceremony, size.width, size.height])

  return (
    <group position={CINEMATIC_ORIGIN}>
      <hemisphereLight args={['#a9cfff', '#161022', 1.25]} />
      <directionalLight position={[-5, 8, 6]} intensity={1.5} color="#e2eeff" castShadow />
      {ceremony ? (
        <>
          <HallBackdrop party={phase !== 'solo' && phase !== 'hidden'} />
          {mons.slice(0, 6).map((mon, index) => (
            <CeremonyMon key={`${String(index)}-${String(mon.species)}-${String(mon.form)}`} index={index} {...mon} />
          ))}
          <CeremonyPlayer gender={gender} />
          <RomSpotlights />
          <RomConfetti />
        </>
      ) : (
        <ArchiveRoom mons={mons} selected={selected} />
      )}
    </group>
  )
}
