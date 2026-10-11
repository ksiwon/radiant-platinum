// 원작 DS 대본이 전용 태스크로만 그리던 몸 연출을 3D로 (`engine/battle/dsBodyFx`).
//
// 선견 193(눈이 맞는 몸을 훑는다) · 도우미 274(발바닥이 화면 곳곳에 찍힌다) · 슬쩍 289(몸이 가장자리로 달려 나갔다 맞는 쪽 뒤를
// 가로질러 돌아온다) · 냄새맡기 316(맞는 몸의 복사본 둘이 흔들린다). BDSP는 이 기술들의 연출을 안 만들었다.
//
// ⚠️ **눈 · 발바닥은 입체 메시다** (판때기가 아니다) — 눈은 흰자 구 + 홍채 구 + 눈동자 구, 발바닥은 눌린 타원체 다섯. **몸 복사본은 실제 모델 복제**다
// (`SkeletonUtils.clone`). 모양 · 색은 원작 2D 그림(NCGR 셀)을 못 옮긴 우리 디자인이고, **움직임 · 시각은 디컴프 값 그대로**다.
// 이 파일은 작업트리에서 브라우저 없이 쓴 코드다 — 화면 확인 전(`fxshot`)이다.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Quaternion, Vector3, type Group, type Object3D } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { unifySkeletons } from '../unifySkeleton'
import { battleClock } from '../../engine/battle/presentationClock'
import {
  ASSIST_FRAMES, ASSIST_PAWS, DS_SPRITE_PX, FORESIGHT_FRAMES, ODOR_FRAMES, SNATCH_FRAMES,
  foresightAt, odorShakeAt, pawAt, snatchAt,
} from '../../engine/battle/dsBodyFx'
import type { SlotId } from '../../engine/battle/events'
import { STAGE_ORIGIN, slotRig, tallOf } from './stageRefs'
import { torsoY } from './moveAnchor'

/** 이 컴포넌트가 맡는 기술 → 연출 길이(프레임, 60fps) */
export const DS_BODY_FX_FRAMES: Readonly<Record<number, number>> = {
  193: FORESIGHT_FRAMES, 274: ASSIST_FRAMES, 289: SNATCH_FRAMES, 316: ODOR_FRAMES,
}

interface DsBodyShot {
  move: number
  by: SlotId
  at: SlotId
  startedAt: number
  /** 두 자리의 발판 (x, z) */
  from: readonly [number, number]
  to: readonly [number, number]
}

const FPS = 60

/** 지금 선 몸을 뼈째 복제해 그 자리에 둔다. 도트로 선 자리(모델 없음)면 `null` */
function cloneBody(slot: SlotId): Group | null {
  const root: Object3D | null | undefined = slotRig[slot]?.root
  if (!root) return null
  root.updateWorldMatrix(true, true)
  const copy = cloneSkinned(root) as Group
  // 복제 전후로 뼈대를 합친다 — 조각마다 뼈 수가 다르면 그 수만큼 셰이더가 갈린다 (`scene/unifySkeleton`)
  unifySkeletons(copy)
  const pos = new Vector3()
  const quat = new Quaternion()
  const scale = new Vector3()
  root.matrixWorld.decompose(pos, quat, scale)
  copy.position.copy(pos).sub(STAGE_ORIGIN)
  copy.quaternion.copy(quat)
  copy.scale.copy(scale)
  copy.traverse((o) => { o.frustumCulled = false })
  return copy
}

export function DsBodyFx({ shot }: { shot: DsBodyShot }) {
  switch (shot.move) {
    case 193: return <ForesightEye shot={shot} />
    case 274: return <AssistPaws shot={shot} />
    case 289: return <SnatchRun shot={shot} />
    case 316: return <OdorGhosts shot={shot} />
    default: return null
  }
}

const frameOf = (shot: DsBodyShot): number => (battleClock.now() - shot.startedAt) * FPS

/** 선견 — 눈 하나가 맞는 몸을 지그재그로 훑고 사라진다. 그 뒤 몸이 하얗게 번쩍인다(번쩍임은 무대 몫 `moveImpact.tint`) */
function ForesightEye({ shot }: { shot: DsBodyShot }) {
  const host = useRef<Group>(null)
  const eye = useRef<Group>(null)
  const camera = useThree((s) => s.camera)
  const tall = tallOf(shot.at)
  const unit = tall / DS_SPRITE_PX
  const right = useMemo(() => new Vector3(), [])
  const toward = useMemo(() => new Vector3(), [])
  const eyeAt = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const h = host.current
    const e = eye.current
    if (!h || !e) return
    const f = frameOf(shot)
    const s = foresightAt(f)
    h.visible = f >= 0 && s.alpha > 0
    if (!h.visible) return
    // 카메라 쪽 가로 · 위 — 화면에서 지그재그로 보이게 눈 자리를 카메라 가로축으로 민다
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    eyeAt.copy(camera.position).sub(STAGE_ORIGIN)
    h.position.set(shot.to[0], torsoY(shot.at) + s.y * unit, shot.to[1]).addScaledVector(right, s.x * unit)
    // 몸 앞(카메라 쪽)으로 살짝 — 몸에 묻히지 않게
    toward.copy(eyeAt).sub(h.position).normalize()
    h.position.addScaledVector(toward, tall * 0.6)
    // `lookAt`은 세계 좌표를 받는다 — 이 그룹은 무대 원점(`STAGE_ORIGIN`) 아래에 있으므로 카메라 자리를 그대로 준다
    e.lookAt(camera.position)
    e.scale.setScalar(Math.max(0.05, tall * 0.18) * (0.6 + 0.4 * s.alpha))
    e.children.forEach((c) => {
      const m = (c as unknown as { material?: { opacity: number } }).material
      if (m) m.opacity = s.alpha
    })
  })
  return (
    <group ref={host} visible={false}>
      <group ref={eye}>
        <mesh><sphereGeometry args={[1, 20, 14]} /><meshBasicMaterial color="#fffbe8" transparent depthWrite={false} toneMapped={false} /></mesh>
        <mesh position={[0, 0, 0.62]} scale={[0.58, 0.58, 0.4]}><sphereGeometry args={[1, 18, 12]} /><meshBasicMaterial color="#e5483f" transparent depthWrite={false} toneMapped={false} /></mesh>
        <mesh position={[0, 0, 0.9]} scale={[0.26, 0.26, 0.2]}><sphereGeometry args={[1, 14, 10]} /><meshBasicMaterial color="#1a0d10" transparent depthWrite={false} toneMapped={false} /></mesh>
      </group>
    </group>
  )
}

/** 도착 칸 여섯 — 위쪽 셋 · 아래쪽 셋 (`sAssistPawSpriteDestinations`의 0 · 128 · 256 × 0 · 170) */
const PAW_DESTS: readonly (readonly [number, number])[] = [[-1.6, 1], [0, 1], [1.6, 1], [-1.6, -0.2], [0, -0.2], [1.6, -0.2]]

/** 도우미 — 발바닥 열둘이 무대 앞 허공에 찍히고(눌려 부풀었다 돌아온다) 바깥 여섯 칸으로 날아간다 */
function AssistPaws({ shot }: { shot: DsBodyShot }) {
  const refs = useRef<(Group | null)[]>([])
  const camera = useThree((s) => s.camera)
  const mid = useMemo(() => [(shot.from[0] + shot.to[0]) / 2, (shot.from[1] + shot.to[1]) / 2] as const, [shot])
  const tall = Math.max(0.6, tallOf(shot.by))
  const spread = 2.4 + tall * 0.6
  useFrame(() => {
    const f = frameOf(shot)
    for (let i = 0; i < ASSIST_PAWS; i++) {
      const g = refs.current[i]
      if (!g) continue
      const p = pawAt(i, f)
      g.visible = f >= 0 && p.shown && p.fly < 1
      if (!g.visible) continue
      const d = PAW_DESTS[p.dest]!
      const x0 = mid[0] + p.at[0] * spread
      const y0 = tall * (0.2 + (p.at[1] + 1) * 0.4)
      const x1 = mid[0] + d[0] * spread * 2.2
      const y1 = tall * (0.1 + (d[1] + 1) * 0.55)
      g.position.set(x0 + (x1 - x0) * p.fly, y0 + (y1 - y0) * p.fly, mid[1])
      g.scale.setScalar(tall * 0.32 * p.scale)
      g.lookAt(camera.position)
    }
  })
  return (
    <group>
      {Array.from({ length: ASSIST_PAWS }, (_, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g }} visible={false}>
          <mesh scale={[1, 0.8, 0.45]}><sphereGeometry args={[0.5, 14, 10]} /><meshBasicMaterial color="#f4a9b8" toneMapped={false} /></mesh>
          {[-0.62, -0.21, 0.21, 0.62].map((x, k) => (
            <mesh key={k} position={[x, 0.62 + (k === 1 || k === 2 ? 0.14 : 0), 0]} scale={[1, 1.15, 0.5]}>
              <sphereGeometry args={[0.2, 10, 8]} /><meshBasicMaterial color="#f4a9b8" toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** 슬쩍 — 쓴 몸(무대가 감춘다: `anim.vanish`)의 복제가 가장자리로 나갔다 맞는 쪽 뒤를 가로질러 제자리로 돌아온다 */
function SnatchRun({ shot }: { shot: DsBodyShot }) {
  const body = useMemo(() => cloneBody(shot.by), [shot.by])
  const home = useMemo(() => body?.position.clone() ?? new Vector3(shot.from[0], 0, shot.from[1]), [body, shot])
  // 쓴 쪽이 내 편이면 오른쪽 가장자리로 나간다 (`dir = +1`)
  const dir = shot.by.startsWith('p1') ? 1 : -1
  const EDGE = 5.5
  // 맞는 몸의 뒤 — 카메라에서 먼 쪽으로 한 걸음
  const backZ = shot.to[1] + (shot.to[1] < shot.from[1] ? -1.2 : 1.2)
  useFrame(() => {
    if (!body) return
    const f = frameOf(shot)
    const s = snatchAt(f)
    body.visible = f >= 0 && s !== null
    if (!s) return
    const x0 = home.x
    const lerp = (a: number, b: number): number => a + (b - a) * s.k
    if (s.leg === 0) body.position.set(lerp(x0, dir * EDGE), home.y, home.z)
    else if (s.leg === 1) body.position.set(lerp(dir * EDGE, -dir * EDGE), home.y, backZ)
    else body.position.set(lerp(-dir * EDGE, x0), home.y, home.z)
  })
  return body ? <primitive object={body} /> : null
}

/** 냄새맡기 — 맞는 몸과 가운데 기준 맞은편 자리에 복제 둘이 서서 반대로 흔들린다 */
function OdorGhosts({ shot }: { shot: DsBodyShot }) {
  const a = useMemo(() => cloneBody(shot.at), [shot.at])
  const b = useMemo(() => cloneBody(shot.at), [shot.at])
  const baseA = useMemo(() => a?.position.clone() ?? new Vector3(), [a])
  const unit = tallOf(shot.at) / DS_SPRITE_PX
  useFrame(() => {
    const f = frameOf(shot)
    const on = f >= 0 && f < ODOR_FRAMES
    const px = odorShakeAt(f)
    if (a) {
      a.visible = on
      a.position.set(baseA.x + px * unit, baseA.y, baseA.z)
    }
    if (b) {
      b.visible = on
      // 가운데(무대 x = 0)에 대해 맞은편 — 원작은 `+x` · `−x`에 둔다
      b.position.set(-baseA.x - px * unit, baseA.y, baseA.z)
    }
  })
  return <>{a ? <primitive object={a} /> : null}{b ? <primitive object={b} /> : null}</>
}
