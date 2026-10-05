// 배틀 카메라의 순수 계산 — 시퀀스 카메라가 놓인 뒤 기본 자리로 돌아오는 길과 끊을지의 결정.
// 훅(`BattleStage`의 `useBattleCamera`)은 시계·ref·충돌 보정만 맡고 판단은 여기서 한다
import type { SeqCamera } from '../../engine/battle/fx/sequence'
import { lerp3 } from '../../engine/battle/fx/vec3'

/** 시퀀스 카메라가 끝난 뒤 기본 자리로 돌아오는 시간(초) — 우리 값 */
export const SEQ_CAMERA_RETURN = 0.35

/**
 * 돌아오는 길이 보는 곳 둘레를 이 각(도)보다 크게 돌아야 하면 잇지 않고 끊는다 — 우리 값.
 *
 * 0.35초에 90°를 돌면 초당 260°다. 그보다 빠르면 화면이 휙 쓸려 무엇이 지나갔는지 안 읽히고(필름의 180° 규칙도
 * 반대편으로 넘어가는 이음은 끊어 간다), 그 안이면 도는 것이 오히려 두 샷을 잇는다
 */
export const SEQ_CAMERA_CUT = 90

/** 두 샷의 카메라가 각자의 보는 곳에서 본 수평 방향이 벌어진 각(도) */
export function swing(a: SeqCamera, b: SeqCamera): number {
  const ax = a.pos[0] - a.target[0], az = a.pos[2] - a.target[2]
  const bx = b.pos[0] - b.target[0], bz = b.pos[2] - b.target[2]
  const d = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz))
  return (d * 180) / Math.PI
}

/**
 * 돌아오는 길 — 보는 곳은 곧게, 카메라는 **보는 곳 둘레를 돌아서**(수평 방위 · 내려다보는 각 · 거리를 따로 잇는다).
 * 카메라 자리를 곧게 이으면 두 자리 사이에 선 몸 곁을 스친다
 */
export function orbitBlend(from: SeqCamera, to: SeqCamera, e: number): SeqCamera {
  const target = lerp3(from.target, to.target, e)
  const polar = (c: SeqCamera) => {
    const dx = c.pos[0] - c.target[0], dy = c.pos[1] - c.target[1], dz = c.pos[2] - c.target[2]
    const r = Math.hypot(dx, dy, dz)
    return { yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy / (r || 1)))), r }
  }
  const a = polar(from), b = polar(to)
  let dyaw = b.yaw - a.yaw
  dyaw -= Math.round(dyaw / (2 * Math.PI)) * 2 * Math.PI
  const yaw = a.yaw + dyaw * e
  const pitch = a.pitch + (b.pitch - a.pitch) * e
  const r = a.r + (b.r - a.r) * e
  return {
    pos: [target[0] + Math.sin(yaw) * Math.cos(pitch) * r, target[1] + Math.sin(pitch) * r, target[2] + Math.cos(yaw) * Math.cos(pitch) * r],
    target,
    fov: from.fov + (to.fov - from.fov) * e,
    roll: from.roll * (1 - e),
  }
}

/** 시퀀스 카메라의 마지막 자리 · 시퀀스가 놓은 시각 — 돌아오는 길을 잇는다 */
export interface CameraReturn {
  last: SeqCamera | null
  leftAt: number | null
}

export const NO_RETURN: CameraReturn = { last: null, leftAt: null }

/**
 * 한 프레임의 카메라를 정한다.
 *
 * - 시퀀스 카메라(`want`)가 서 있으면 그 자리(`clamp` 보정 뒤)를 마지막 자리로 적는다.
 * - 놓은 뒤에는 `SEQ_CAMERA_RETURN`초에 걸쳐 `base`로 돌아온다. 첫 프레임(`k === 0`)에 두 자리의 수평 방향이
 *   `SEQ_CAMERA_CUT`보다 벌어졌으면 잇지 않고 곧바로 `base`로 끊는다
 * - 돌아오는 길도 `clamp`를 거친다 — 몸 곁을 스치지 않게. 다 돌아오면 `base` 그대로
 */
export function stepCamera(
  st: CameraReturn,
  want: SeqCamera | null,
  base: SeqCamera,
  now: number,
  clamp: (c: SeqCamera) => SeqCamera,
): { shot: SeqCamera; state: CameraReturn } {
  if (want) {
    const shot = clamp(want)
    return { shot, state: { last: shot, leftAt: null } }
  }
  if (!st.last) return { shot: base, state: NO_RETURN }
  const leftAt = st.leftAt ?? now
  const k = Math.min(1, (now - leftAt) / SEQ_CAMERA_RETURN)
  // ⚠️ **크게 돌아야 하면 끊는다.** 껍질에 숨기(`ew110`)는 모부기 얼굴 앞(상대 쪽)에서 끝나고 기본 자리는
  // 모부기 등 뒤다. 그 사이를 곧게 이으면 카메라가 모부기 몸 곁을 0.35초에 스쳐 지나며, 주황빛 모부기가
  // 화면 왼쪽 아래를 통째로 덮고 바닥만 비친 칸이 섰다(C3 3.2초)
  if (k === 0 && swing(st.last, base) > SEQ_CAMERA_CUT) return { shot: base, state: NO_RETURN }
  if (k >= 1) return { shot: base, state: NO_RETURN }
  const e = k * k * (3 - 2 * k)
  return { shot: clamp(orbitBlend(st.last, base, e)), state: { last: st.last, leftAt } }
}

// ── 큰 몸 앞에서 카메라를 옆으로 돌린다 ───────────────────────────────────────────────────────────────────────

/**
 * 큰 몸(내 쪽)이 설 때 기본 카메라를 보는 곳 둘레로 더 돌리는 각(도)의 상한 — 우리 값.
 *
 * BDSP는 내 몸이 큰 종(`PokeSizeP` 3)일 때 두 가지를 바꾼다 (`DefaultCameraPlacementData` · `DefaultCharaPlacementData`):
 * 카메라가 (−4.6, 0.8, 7.3) · 회전 Y 145°로 옮겨 수평 방위가 28.4°에서 32.2°로 **3.8° 더 벌어지고**, 두 몸의 자리가 z ±2.2에서
 * ±2.5로 **0.6m 더 벌어진다**. 큰 몸 뒤의 상대가 몸에 안 가리게 하는 장치다. 우리는 자리를 풀밭 기준 한 값(`SLOT`)으로 두므로
 * 같은 일을 카메라 방위로만 한다 — 그래서 BDSP보다 더 돌려야 한다. 몸 상자를 실제 카메라로 투영해 재 보니(`pnpm shot
 * champion --keys=z,z,z,z,z --boxes`) 토대부기(키 2.25m) 대 화강돌은 방위 28°에서 상자가 66% 겹쳤고 38°에서 28%, 45°에서 2%였다.
 * 기본 방위 28.4°에 17°를 더하면 45°다
 */
export const BIG_SWING_MAX = 17

/** 이 거리 배율(`cameraFit`) 이상이면 상한까지 돌린다 — 토대부기(2.25m)의 배율이 1.87이다 */
export const BIG_SWING_FULL_FIT = 1.8

/**
 * 내 몸 때문에 물러난 배율(`fit`)에 따른 추가 방위(도). 배율 1(기본 샷이 담는 몸)이면 0이고 `BIG_SWING_FULL_FIT`에서 상한이다.
 * 방 반지름이 거리를 막는 좁은 무대는 배율이 1 근처에 묶이므로 거의 안 돈다 — 벽이 이긴다
 */
export function bigSwing(fit: number): number {
  const k = (fit - 1) / (BIG_SWING_FULL_FIT - 1)
  return BIG_SWING_MAX * Math.min(1, Math.max(0, k))
}

/** 카메라 자리를 보는 곳 둘레로 `deg`도 돌린다 (수평 방위만 · 높이와 거리는 그대로). 양수가 카메라 쪽(+x)으로 더 벌어지는 쪽이다 */
export function swingAround(pos: SeqCamera['pos'], target: SeqCamera['target'], deg: number): SeqCamera['pos'] {
  const dx = pos[0] - target[0], dz = pos[2] - target[2]
  const r = Math.hypot(dx, dz)
  const a = Math.atan2(dx, dz) + (deg * Math.PI) / 180
  return [target[0] + Math.sin(a) * r, pos[1], target[2] + Math.cos(a) * r]
}

/** 3D 상자 — 무대 좌표 */
export interface Box3Like {
  min: readonly [number, number, number]
  max: readonly [number, number, number]
}

/** 상자를 이 카메라로 본 화면 직사각형 — 0~1 (왼쪽 위가 0,0). 상자가 카메라 뒤에 걸리면 `null` */
export function screenRect(
  box: Box3Like, cam: Pick<SeqCamera, 'pos' | 'target' | 'fov'>, aspect: number,
): [number, number, number, number] | null {
  const f = unit(sub(cam.target, cam.pos))
  const r = unit(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  const t = Math.tan((cam.fov * Math.PI) / 360)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    const d = sub([x, y, z], cam.pos)
    const depth = dot(d, f)
    if (depth <= 0) return null
    const sx = (dot(d, r) / depth / t / aspect + 1) / 2
    const sy = (1 - dot(d, u) / depth / t) / 2
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy)
  }
  return [x0, y0, x1, y1]
}

/** 두 화면 직사각형이 겹친 넓이를 **작은 쪽**의 넓이로 나눈 값 (0~1) — 작은 몸이 얼마나 가렸는가 */
export function rectOverlap(a: readonly number[], b: readonly number[]): number {
  const w = Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!))
  const h = Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!))
  const area = (q: readonly number[]): number => (q[2]! - q[0]!) * (q[3]! - q[1]!)
  const small = Math.min(area(a), area(b))
  return small > 0 ? (w * h) / small : 0
}

type V = readonly [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V): V => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n] }
