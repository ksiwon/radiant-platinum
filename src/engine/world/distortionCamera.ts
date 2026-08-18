// 깨어진 세계의 카메라 각 (PARITY §6.10) — `DistWorld_UpdateCameraAngle`.
//
// 층마다 카메라가 홱 도는 자리가 있다. 스물여섯 곳이고 각은 여덟 가지다.
//
// ── 단위 ────────────────────────────────────────────────────────────────────
// ⚠️ **자료의 각은 도가 아니다.** 원작이 `angle * 0x100`으로 DS 각에 올린다
// (`DISTORTION_WORLD_CAMERA_PERSISTED_ANGLES_FACTOR`). DS는 한 바퀴가
// 0x10000이니 한 눈금이 **360/256 = 1.40625도**다. 도로 읽으면 45가 45도가
// 아니라 63.3도다.
//
// ⚠️ **부호가 있다.** 눈금 240은 +240도가 아니라 **−22.5도**다 — 원작이
// `(s16)`으로 읽는다. 그래서 220·240이 오른쪽이 아니라 왼쪽이다.
//
// ── 밑각 ────────────────────────────────────────────────────────────────────
// ⚠️ **실제 각은 밑각 + 구역의 각이다** — `baseAngle.x`가 −10750(−59.06도)이고
// 거기에 더한다. 우리 카메라는 밑이 다르다: 원작이 **41.7칸 떨어져 화각 8.1도**
// (`BASE_DISTANCE` 0x29AEC1 · `BASE_FOVY` 1473)로 거의 평행투영처럼 보는데
// 우리는 8칸에 보통 화각이다. 그래서 **더하는 값만** 옮긴다 — 구역에서 카메라가
// 도는 양은 같고, 밑그림은 우리 것이다.
//
// 밑을 원작에 맞추면 이 세계만 딴 게임처럼 보인다. 그건 3D로 다시 만든다는
// 전제를 깨는 것이라 안 한다.

/** 한 눈금이 몇 도인가 (`0x100 / 0x10000`) */
export const CAMERA_UNIT = 360 / 256

/** DS 각 한 바퀴 */
const TURN = 0x10000
/** `S16_SIGN_MASK` */
const HALF = 0x8000

/** 눈금을 DS 각으로 올린 뒤 부호 있는 값으로 읽는다 (`(s16)`) */
function signed(stored: number): number {
  const raw = ((stored * 0x100) % TURN + TURN) % TURN
  return raw >= HALF ? raw - TURN : raw
}

/** 그 눈금이 몇 도인가. 부호가 있다 — 240은 −22.5도다 */
export function cameraDegrees(stored: number): number {
  return (signed(stored) / TURN) * 360
}

/**
 * 두 각 사이를 **가까운 쪽으로** 도는 차 (DS 각).
 *
 * 원작 `CalculateCameraAngleDelta` 그대로다. ⚠️ 반 바퀴를 넘을 때의 갈래가
 * 이상하게 적혀 있는데(`(d + 0x8000) % 0x8000`), 자료에 있는 여덟 각끼리는
 * 어느 짝을 골라도 반 바퀴를 안 넘어서 **한 번도 안 탄다**. 시험이 그걸 본다
 */
export function cameraDelta(from: number, to: number): number {
  const delta = signed(to) - signed(from)
  let fixed = Math.abs(delta)
  if (fixed > HALF) {
    fixed = (fixed + HALF) % HALF
    return signed(from) < signed(to) ? -fixed : fixed
  }
  return delta
}

/** 카메라가 한 자리에서 다른 자리로 도는 것 (`DistWorldCameraTransition`) */
export interface CameraTurn {
  /** 떠나는 각 (눈금) */
  from: readonly [number, number, number]
  /** 닿을 각 (눈금) */
  to: readonly [number, number, number]
  /** 몇 프레임에 걸쳐 (`transitionSteps`) */
  steps: number
}

/**
 * `frame`프레임 뒤의 각 (**도**).
 *
 * 원작이 프레임마다 `angleStep`을 더하고 마지막 프레임에 목표로 딱 맞춘다.
 * 그래서 중간은 선형이고 끝은 정확하다
 */
export function cameraTurnAngles(turn: CameraTurn, frame: number): [number, number, number] {
  const steps = Math.max(1, turn.steps)
  const t = Math.min(1, Math.max(0, frame / steps))
  const out: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const from = turn.from[i] ?? 0
    const to = turn.to[i] ?? 0
    if (t >= 1) { out[i] = cameraDegrees(to); continue }
    const at = signed(from) + cameraDelta(from, to) * t
    out[i] = (at / TURN) * 360
  }
  return out
}

/** 다 돌았는가 */
export function cameraTurnDone(turn: CameraTurn, frame: number): boolean {
  return frame >= Math.max(1, turn.steps)
}
