// 배틀 카메라의 순수 계산 — 시퀀스 카메라가 놓인 뒤 기본 자리로 돌아오는 길과 끊을지의 결정.
// 훅(`BattleStage`의 `useBattleCamera`)은 시계·ref·충돌 보정만 맡고 판단은 여기서 한다
import type { SeqCamera } from '../../engine/battle/fx/sequence'

/** 시퀀스 카메라가 끝난 뒤 기본 자리로 돌아오는 시간(초) — 우리 값 */
export const SEQ_CAMERA_RETURN = 0.35

/**
 * 돌아오는 길이 보는 곳 둘레를 이 각(도)보다 크게 돌아야 하면 잇지 않고 끊는다 — 우리 값.
 *
 * 0.35초에 90°를 돌면 초당 260°다. 그보다 빠르면 화면이 휙 쓸려 무엇이 지나갔는지 안 읽히고(필름의 180° 규칙도
 * 반대편으로 넘어가는 이음은 끊어 간다), 그 안이면 도는 것이 오히려 두 샷을 잇는다
 */
export const SEQ_CAMERA_CUT = 90

export const lerpV = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
  [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]

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
  const target = lerpV(from.target, to.target, e)
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
