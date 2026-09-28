// 깨어진 세계의 소품 (PARITY §6.10)
//
// 이 세계의 「블록」은 지형이 아니라 소품이다. 걷는 판정은 `tw_arc_attr`와 맵
// 격자가 주지만, **눈에 보이는 발판·바위·덩굴·승강판은 여기서 선다.**
//
// ⚠️ **세 갈래를 다 세워야 한다.** 원작은 관리자를 셋으로 나눠 든다 —
// 밟으면 나타나는 유령 소품, 층을 오르내리는 승강 발판, 늘 서 있는 문·폭포·
// 덩굴이다. 한동안 첫째만 그렸는데, 그러면 **타야 할 승강 발판이 통째로
// 안 보인다** — 1F에서 아래로 내려가는 그 판이 그것이다.
//
// ⚠️ **자리 보정을 빼먹으면 한 칸 위에 뜬다.** 원작이 칸 한가운데(+0.5)에
// `sPropInitialPosOffsetByKind`를 더해 세운다. 작은 발판은 y가 −1.5625라,
// 모델 윗면(제 원점에서 +1)이 「선 높이 − 1/16」에 정확히 온다.
//
// ⚠️ **보임새는 프레임마다 본다.** 유령 소품은 무리 비트, 승강 발판은 자리
// 비트, 늘 서 있는 것은 진행도 조건을 본다 — 마지막 하나가 스토어에 없어서
// (스크립트 변수다) React 구독으로는 늦는다
//
// ⚠️ **소품이 스스로 움직인다** (`engine/world/distortionPropAnim`). 떠 있는 발판은 둥실거리고 한 틱에
// 알파 1씩 나타나고 스러진다. 덩굴꽃 · 바위는 BCA0를 2씩 돌리며 자라고 오므라든다. 폭포는 물이 흐르고(BTA0)
// 문은 돈다(BCA0). 한동안 전부 제자리에 서서 켜지고 꺼지기만 했다
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { BufferGeometry, Group, Material, Mesh, Texture } from 'three'
import {
  isObstacle, isSimpleAnimated, obstacleAnimInit, obstacleAnimTick, obstacleSound, platformAnimInit,
  platformAnimTick, GHOST_PROP_OPACITY_MAX, type ObstacleAnim, type PlatformAnim,
} from '../engine/world/distortionPropAnim'
import { music } from '../engine/audio/music'
import { SFX } from '../engine/audio/sfx'
import { worldState } from '../state/worldState'
import { loadDistortionPropAnims, type DistortionPropAnims } from './chunkMesh'
import { nodeMatrixAt, splitByNode, uvOffsetAt } from './propAnim'
import {
  distortionFloor, distortionPropOpacity, distortionPropPlaces, distortionPropShown, distortionRideAt,
  distortionShadowAt,
  distortionSlideAt, GIRATINA_SHADOW_KIND, isDistortionFloor,
  type DistortionPropPlace,
} from './distortion'
import { useSaveStore } from '../state/saveStore'
import { useLoadedProps } from './propMeshes'

/** 발판 종류의 끝 — 0~19가 `sPlatformPropAnimFuncs`다 */
const LAST_PLATFORM_KIND = 19
/** 둥실거림을 반으로 줄이는 발판 — 작은 발판 하나뿐이다 (`PROP_KIND_SMALL_PLATFORM`) */
const SMALL_PLATFORM = 0

type Anim = { kind: 'platform', a: PlatformAnim, y: number } | { kind: 'obstacle', a: ObstacleAnim } | null

/** 그 소리가 이미 울리고 있으면 안 겹친다 (`PlaySoundIfNotActive`) */
function playOnce(seq: number): void {
  if (!music.isEffectPlaying(seq)) void music.playEffect(seq)
}

/** 그림을 가진 재질만 골라 본다 */
type Mapped = Material & { map: Texture | null }
const mapped = (m: Material | undefined): Mapped | null =>
  m !== undefined && 'map' in m ? (m as Mapped) : null

/** 진단이 읽는 자리 — 지금 층의 소품과 그 한 벌 (`distortionPropAnimState`) */
let live: { places: readonly DistortionPropPlace[], states: readonly Anim[], ticks: number } | null = null

/** 지금 층 소품이 어디까지 움직였나 — 진단용. 발판은 높이(칸), 덩굴꽃 · 바위는 알파와 프레임 */
export function distortionPropAnimState(): {
  ticks: number
  platforms: { kind: number, opacity: number, y: number }[]
  obstacles: { kind: number, opacity: number, frame: number }[]
} | null {
  if (live === null) return null
  const platforms: { kind: number, opacity: number, y: number }[] = []
  const obstacles: { kind: number, opacity: number, frame: number }[] = []
  for (const [i, st] of live.states.entries()) {
    const kind = live.places[i]?.kind ?? -1
    if (st?.kind === 'platform') platforms.push({ kind, opacity: st.a.opacity, y: st.y })
    else if (st?.kind === 'obstacle') obstacles.push({ kind, opacity: st.a.opacity, frame: st.a.frame })
  }
  return { ticks: live.ticks, platforms, obstacles }
}

function useDistortionPropAnims(): DistortionPropAnims | null {
  const [got, setGot] = useState<DistortionPropAnims | null>(null)
  useEffect(() => {
    let alive = true
    void loadDistortionPropAnims().then((a) => { if (alive) setGot(a) })
    return () => { alive = false }
  }, [])
  return got
}

export function DistortionProps({ mapId }: { mapId: number }) {
  // 층이 실제로 걸린 뒤에야 자료가 온다. 처음 들어설 때 `valid`가 서므로
  // 그때 한 번 더 본다 — 안 그러면 첫 층만 소품이 안 뜬다
  const valid = useSaveStore((s) => s.distortion.valid)
  const [places, setPlaces] = useState<readonly DistortionPropPlace[]>([])
  useEffect(() => {
    setPlaces(isDistortionFloor(mapId) && distortionFloor() !== null
      ? distortionPropPlaces(mapId)
      : [])
    // ⚠️ `valid`도 본다. 자료를 아직 안 받았을 때 처음 들어서면 층이 나중에
    // 걸리는데, 그때 서는 표가 이것뿐이다 — 빼면 첫 층만 소품이 안 뜬다
  }, [mapId, valid])

  /**
   * 이 층이 쓰는 소품 종류만 받는다. 스물다섯을 다 받을 이유가 없다.
   *
   * ⚠️ **기라티나 그림자만 예외다.** 그것은 자리표에 없고 사건이 부를 때에야
   * 뜨는데, 그때 받기 시작하면 48프레임짜리 연출이 다 지나간 뒤에 도착한다.
   * 4.3KB짜리 하나라 이 세계에 들어설 때 미리 받아 둔다
   */
  const kinds = useMemo(
    () => [...new Set([...places.map((p) => p.kind), ...(places.length > 0 ? [GIRATINA_SHADOW_KIND] : [])])]
      .sort((a, b) => a - b),
    [places],
  )
  const { byKind, offsets } = useLoadedProps(kinds)
  const anims = useDistortionPropAnims()

  /** 관절 애니가 있는 종류는 기하를 노드마다 쪼갠다 (`propAnim.splitByNode`) */
  const parts = useMemo(() => {
    const out = new Map<number, Map<number, BufferGeometry>>()
    if (anims === null) return out
    for (const [kind, got] of byKind) {
      const info = anims.model(kind)
      if (anims.clip(kind)?.kind === 'BCA0' && info) out.set(kind, splitByNode(got.mesh, info.submeshNodes))
    }
    return out
  }, [anims, byKind])

  /** 자리마다 한 벌 — 발판의 둥실거림 · 덩굴꽃의 프레임 (`…_AnimInit`) */
  const states = useRef<Anim[]>([])
  useEffect(() => {
    states.current = places.map((p): Anim => {
      if (p.group < 0) return null
      const hidden = !distortionPropShown(p)
      if (isObstacle(p.kind)) return { kind: 'obstacle', a: obstacleAnimInit(hidden, anims?.clip(p.kind)?.frames ?? 0) }
      if (p.kind <= LAST_PLATFORM_KIND) {
        return { kind: 'platform', a: platformAnimInit(hidden, Math.floor(Math.random() * 0x10000)), y: 0 }
      }
      return null
    })
  }, [places, anims])
  /** 60분의 1초 틱을 센다 — 늘 도는 소품의 프레임이 이것이다 */
  const clock = useRef({ acc: 0, ticks: 0 })

  const roots = useRef<(Group | null)[]>([])
  /** 자리마다 그 몸 — 흐리게 할 때 다 같이 바꾼다 */
  const meshes = useRef<Mesh[][]>([])
  /** 자리마다 노드 무리 — 관절 애니가 움직인다 */
  const joints = useRef<Map<number, Group>[]>([])
  /**
   * B6F의 B7F행 발판이 나타나는 동안만 쓰는 제 재질 (`distortionPropOpacity`).
   *
   * 재질은 같은 종류의 소품끼리 나눠 쓰므로 알파를 거기 쓰면 딴 발판까지 흐려진다 — 나타나는 동안만
   * 떼어 내 쓰고 다 나타나면 돌려놓는다
   */
  const faded = useRef(new Map<number, { shared: Material | Material[], own: Material[] }>())
  const fade = (body: readonly Mesh[], i: number, alpha: number): void => {
    const had = faded.current.get(i)
    if (alpha >= 1) {
      if (had !== undefined) {
        for (const mesh of body) mesh.material = had.shared
        for (const m of had.own) m.dispose()
        faded.current.delete(i)
      }
      return
    }
    let own = had?.own
    if (own === undefined) {
      const first = body[0]
      if (first === undefined) return
      const shared = first.material
      own = (Array.isArray(shared) ? shared : [shared]).map((m) => {
        const c = m.clone()
        c.transparent = true
        return c
      })
      faded.current.set(i, { shared, own })
      for (const mesh of body) mesh.material = Array.isArray(shared) ? own : own[0]!
    }
    for (const m of own) m.opacity = alpha
  }
  const shadowRef = useRef<Mesh | null>(null)

  useFrame((_, dt) => {
    const c = clock.current
    c.acc += Math.min(dt, 0.25) * 60
    const ticks = Math.floor(c.acc)
    c.acc -= ticks
    c.ticks += ticks
    live = { places, states: states.current, ticks: c.ticks }
    // 지나가는 기라티나. 자리·크기·방향이 프레임마다 온다
    const ghost = shadowRef.current
    if (ghost) {
      const at = distortionShadowAt()
      ghost.visible = at !== null
      if (at !== null) {
        ghost.position.set(at.x + 0.5, at.y + 0.5, at.z + 0.5)
        ghost.rotation.set(
          (at.rot[0] * Math.PI) / 180, (at.rot[1] * Math.PI) / 180, (at.rot[2] * Math.PI) / 180,
        )
        ghost.scale.setScalar(at.scale)
      }
    }
    // 폭포 — 재질이 종류마다 하나라 한 번만 민다 (`DistWorldSimpleProp_AnimTick` · 한 틱에 한 프레임, 돈다)
    for (const [kind, got] of byKind) {
      const clip = anims?.clip(kind)
      const info = anims?.model(kind)
      if (clip?.kind !== 'BTA0' || !info || !isSimpleAnimated(kind)) continue
      const frame = c.ticks % Math.max(1, clip.frames)
      for (const [m, spec] of got.mesh.materials.entries()) {
        const name = info.materials[m]
        const map = mapped(got.materials[m])?.map
        if (name === undefined || !map || spec.tex === null) continue
        const [u, v] = uvOffsetAt(clip.anim, name, info.uv[m] ?? [0, 0], frame)
        map.offset.set(u, v)
      }
    }
    const me = worldState.player.position
    const ride = distortionRideAt()
    for (const [i, place] of places.entries()) {
      const root = roots.current[i]
      const body = meshes.current[i] ?? []
      if (!root) continue
      const shown = distortionPropShown(place)
      const st = states.current[i] ?? null
      const clip = anims?.clip(place.kind) ?? null
      const info = anims?.model(place.kind)
      let jointFrame: number | null = null
      if (st?.kind === 'platform') {
        const slowed = place.kind === SMALL_PLATFORM && Math.floor(me.x) === place.x
          && Math.floor(me.z) === place.z && Math.round(me.y) === place.y
        for (let t = 0; t < ticks; t++) {
          const r = platformAnimTick(st.a, !shown, slowed)
          st.y = r.y
          if (r.sound) playOnce(SFX.DISTORTION_APPEAR)
        }
        root.visible = st.a.opacity > 0
        fade(body, i, st.a.opacity / GHOST_PROP_OPACITY_MAX)
      } else if (st?.kind === 'obstacle') {
        const frames = clip?.frames ?? 0
        for (let t = 0; t < ticks; t++) {
          const sound = obstacleAnimTick(st.a, !shown, frames)
          if (sound !== null) playOnce(obstacleSound(place.kind, sound))
        }
        root.visible = st.a.opacity > 0
        fade(body, i, st.a.opacity / GHOST_PROP_OPACITY_MAX)
        jointFrame = st.a.frame
      } else {
        root.visible = shown
        if (place.steppingStones) fade(body, i, distortionPropOpacity(place))
        if (isSimpleAnimated(place.kind) && clip !== null) jointFrame = c.ticks % Math.max(1, clip.frames)
      }
      if (jointFrame !== null && clip?.kind === 'BCA0' && info) {
        for (const [node, group] of joints.current[i] ?? []) {
          const base = info.nodes[node]
          if (!base) continue
          group.matrixAutoUpdate = false
          group.matrix.copy(nodeMatrixAt(base, clip.anim, node, jointFrame))
          group.matrixWorldNeedsUpdate = true
        }
      }
      if (st?.kind === 'platform') {
        const off = offsets[place.kind] ?? [0, 0, 0]
        root.position.set(place.x + 0.5 + off[0]!, place.y + 0.5 + off[1]! + st.y, place.z + 0.5 + off[2]!)
      }
      if (place.elevator < 0) continue
      const off = offsets[place.kind] ?? [0, 0, 0]
      // 타고 가는 동안 발판은 주인공 발밑에 붙어 같이 움직인다.
      // ⚠️ **내린 뒤에는 제자리로 돌려놓는다.** 안 돌려놓으면 그 발판이 내린
      // 자리에 남아, 다음에 그 층에 왔을 때 엉뚱한 칸에 판이 하나 떠 있다
      const on = ride !== null && place.elevator === ride.index
      // 밟으면 통째로 미끄러지는 발판. **판이 실제로 움직여야 한다** — 예전엔
      // 사건이 사람만 여덟 칸 옮겨서, 판은 제자리에 두고 주인공만 허공을
      // 건너갔다 (`distortion.distortionEventTick`)
      const slide = distortionSlideAt(place.elevator) ?? [0, 0, 0]
      root.position.set(
        (on ? ride.x : place.x) + 0.5 + off[0]! + slide[0],
        (on ? ride.y : place.y) + 0.5 + off[1]! + slide[1],
        (on ? ride.z : place.z) + 0.5 + off[2]! + slide[2],
      )
    }
  })

  const shadowMesh = byKind.get(GIRATINA_SHADOW_KIND)
  if (places.length === 0) return null
  return (
    <group>
      {places.map((place, i) => {
        const got = byKind.get(place.kind)
        if (got === undefined) return null
        const off = offsets[place.kind] ?? [0, 0, 0]
        const split = parts.get(place.kind)
        const body: Mesh[] = []
        meshes.current[i] = body
        const keep = (m: Mesh | null): void => { if (m !== null && !body.includes(m)) body.push(m) }
        return (
          <group
            key={i}
            ref={(g) => { roots.current[i] = g }}
            visible={false}
            position={[
              place.x + 0.5 + off[0]!,
              place.y + 0.5 + off[1]!,
              place.z + 0.5 + off[2]!,
            ]}
          >
            {split === undefined
              ? <mesh ref={keep} geometry={got.mesh.geometry} material={got.materials} />
              : [...split].map(([node, geometry]) => (
                <group
                  key={node}
                  ref={(g) => {
                    const at = joints.current[i] ?? new Map<number, Group>()
                    joints.current[i] = at
                    if (g !== null) at.set(node, g)
                  }}
                >
                  <mesh ref={keep} geometry={geometry} material={got.materials} />
                </group>
              ))}
          </group>
        )
      })}
      {shadowMesh === undefined ? null : (
        <mesh
          ref={(m) => { shadowRef.current = m }}
          visible={false}
          geometry={shadowMesh.mesh.geometry}
          material={shadowMesh.materials}
        />
      )}
    </group>
  )
}
