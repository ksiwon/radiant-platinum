import type { SlotId } from '../../engine/battle/events'
// ⚠️ **시간표는 엔진이 든다.** 박자를 만드는 쪽(`engine/battle/playback`)이 같은
// 값을 봐야 포획 결과 글이 볼 연출을 기다린다 — 예전에는 이 초가 여기에만 있어서
// 결과가 던지기와 같은 프레임에 떴다
import {
  CAPTURE_DROP_TIME,
  CAPTURE_RELEASE_TIME,
  CAPTURE_SEAL_TIME,
  CAPTURE_SHAKE_START,
  CAPTURE_SHAKE_STEP,
  CAPTURE_THROW_TIME,
  captureDuration,
  captureResolveAt,
} from '../../engine/battle/captureTiming'

export type Point3 = readonly [number, number, number]

export {
  CAPTURE_DROP_TIME,
  CAPTURE_SEAL_TIME,
  CAPTURE_SHAKE_START,
  CAPTURE_THROW_TIME,
  captureDuration,
  captureResolveAt,
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

export function throwArc(
  from: Point3,
  to: Point3,
  progress: number,
  height = 2.2,
): [number, number, number] {
  const t = clamp01(progress)
  if (t === 0) return [...from]
  if (t === 1) return [...to]
  return [
    mix(from[0], to[0], t),
    mix(from[1], to[1], t) + Math.sin(t * Math.PI) * height,
    mix(from[2], to[2], t),
  ]
}

/** 볼이 손을 떠나는 높이(m) */
const HAND = 1.65

/**
 * 볼이 날아오는 자리 — 화면 밖이다. 배틀에 사람이 서지 않아 (사용자 결정 2026-10-04 — 제
 * 포켓몬 맞은편에 선 사람이 트레이너가 포켓몬과 싸우는 것으로 읽혔다) 등장 볼도 교체·포획 볼도
 * 여기서 들어온다. 고정 카메라(`shots.CAMERA`)에서 우리 쪽은 왼쪽 앞, 상대 쪽은 오른쪽 뒤의 바깥이다
 */
export function trainerThrowOrigin(slot: SlotId): Point3 {
  return slot.startsWith('p1') ? [-4.4, HAND, 6.2] : [4.6, HAND, -6.4]
}

/**
 * 자리의 마리가 바뀔 때 **앞 몸을 볼로 거두는가** (`RecallPokemon`).
 *
 * 서 있던 **다른 마리**로 바뀔 때만이다. ⚠️ **열쇠(`key`)로 가른다 — 종으로 가르지 않는다.**
 * 변신(`transform`)과 폼 변화는 같은 마리라 열쇠가 그대로고 종만 바뀐다 (`engine/battle/view`)
 * — 종을 보면 변신에 거두는 빔이 쏜다. 쓰러진 뒤의 교체는 몸이 이미 졌으므로 거두지 않는다 —
 * 원작도 쓰러진 마리는 거두지 않는다. 무대의 몸(`BattleStage`)과 빔(`BattleBallEffects`)이
 * 이 한 함수를 본다
 */
export function recallsBody(before: { key: string | null; alive: boolean }, next: string | null): boolean {
  return before.key !== null && before.alive && before.key !== next
}

export function ballShakeAngle(elapsed: number, shakes: number): number {
  const local = elapsed - CAPTURE_SHAKE_START
  if (local < 0 || shakes <= 0) return 0
  const cycle = Math.floor(local / CAPTURE_SHAKE_STEP)
  if (cycle >= shakes) return 0
  // BDSP 흔들림 클립(`ee102_ball_anim`)은 0.8초를 가만히 있다가 끝 0.35초에 좌우로 두 번 기운다
  const at = local - cycle * CAPTURE_SHAKE_STEP - SHAKE_IDLE
  if (at < 0) return 0
  const phase = Math.min(1, at / (CAPTURE_SHAKE_STEP - SHAKE_IDLE))
  return Math.sin(phase * Math.PI * 2) * Math.sin(phase * Math.PI) * 0.3
}

/** 흔들림 한 번 중 가만히 있는 앞 몫(초) — `ee102_ball_anim` 0.817초 */
const SHAKE_IDLE = 0.817

/**
 * 떨어져 튀는 볼의 높이 — **쉬는 높이 위로 몇 m인가** (`ee101_ball_anim`의 `Waist` y에서 반지름 0.036을 뺀 값).
 *
 * @param t 떨어지기 시작한 뒤의 초 (`CAPTURE_DROP_TIME`부터)
 */
export function ballDropLift(t: number): number {
  if (t <= 0) return DROP_KEYS[0]![1]
  const last = DROP_KEYS[DROP_KEYS.length - 1]!
  if (t >= last[0]) return 0
  let i = 0
  while (t > DROP_KEYS[i + 1]![0]) i++
  const [t0, y0] = DROP_KEYS[i]!
  const [t1, y1] = DROP_KEYS[i + 1]!
  return y0 + (y1 - y0) * ((t - t0) / (t1 - t0))
}

/** [떨어진 뒤 초, 쉬는 높이 위 m] — 클립 1.483~2.25초를 30fps로 떠 온 것 */
const DROP_KEYS: readonly (readonly [number, number])[] = [
  [0, 0.5], [0.05, 0.461], [0.1, 0.381], [0.15, 0.277], [0.2, 0.149], [0.25, 0],
  [0.3, 0.077], [0.35, 0.104], [0.4, 0.105], [0.45, 0.081], [0.5, 0.026], [0.55, 0.021],
  [0.6, 0.039], [0.65, 0.036], [0.7, 0.012], [0.767, 0],
]

/** 볼이 떠서 열리는 높이 — 쉬는 높이 위 0.5m (떨어지기 시작하는 그 높이) */
const BALL_HOVER = DROP_KEYS[0]![1]

/**
 * 볼 반지름(m). ⚠️ **원작 값이 아니다** — BDSP 볼 모델은 실제 크기(반지름 0.038m)인데 우리 카메라는 한
 * 자리에서 5.8m 밖을 보므로 그 크기면 몇 픽셀이다. 지름 0.3m로 키운다(「읽히는 쪽이 이긴다」).
 * 떨어지고 튀는 높이는 원작 m 그대로 둔다
 */
export const BALL_RADIUS = 0.15

/**
 * 볼이 떠서 열리는 자리 — 상대 앞 0.7m (`ee101` `ModelMoveRelativePoke pos=0/50/70`).
 * 상대는 −Z에 서고 내 쪽이 +Z라 앞은 +Z다
 */
export function captureHoverAt(spot: readonly [number, number], slot: SlotId): Point3 {
  const front = slot.startsWith('p2') ? 0.7 : -0.7
  return [spot[0], BALL_RADIUS + BALL_HOVER, spot[1] + front]
}

export function captureBodyScale(elapsed: number, shakes: number, caught: boolean): number {
  if (elapsed <= CAPTURE_THROW_TIME) return 1
  if (elapsed < CAPTURE_SEAL_TIME) {
    return 1 - clamp01((elapsed - CAPTURE_THROW_TIME) / (CAPTURE_SEAL_TIME - CAPTURE_THROW_TIME))
  }
  const resolve = captureResolveAt(shakes)
  if (elapsed < resolve || caught) return 0
  return clamp01((elapsed - resolve) / CAPTURE_RELEASE_TIME)
}

interface BallPalette {
  top: string
  bottom: string
  accent: string
}

const BALL_TOP = [
  '#ec4b59',
  '#7d4db4',
  '#e1bd39',
  '#3375bf',
  '#ec4b59',
  '#5d9569',
  '#3486ba',
  '#6ca843',
  '#d45a3c',
  '#d6d8dc',
  '#202327',
  '#313840',
  '#f0eee9',
  '#254736',
  '#efa9c8',
  '#6aa8dc',
  '#d94845',
]

const BALL_ACCENT = [
  '#f5f1de',
  '#e78af3',
  '#22252a',
  '#df4a51',
  '#ffffff',
  '#d8e9c2',
  '#e7d955',
  '#efdc69',
  '#f4ca50',
  '#c3523b',
  '#d7b64b',
  '#ddba4d',
  '#dc3234',
  '#77bd66',
  '#f5d7e6',
  '#f0cd45',
  '#dce8f0',
]

export function ballPalette(ball: number): BallPalette {
  const id = Number.isInteger(ball) && ball >= 1 && ball <= 16 ? ball : 4
  return {
    top: BALL_TOP[id]!,
    bottom: id === 13 ? '#16191a' : '#f0f0eb',
    accent: BALL_ACCENT[id]!,
  }
}
