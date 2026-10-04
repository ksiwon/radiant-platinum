import type { SlotId } from '../../engine/battle/events'
// ⚠️ **시간표는 엔진이 든다.** 박자를 만드는 쪽(`engine/battle/playback`)이 같은
// 값을 봐야 포획 결과 글이 볼 연출을 기다린다 — 예전에는 이 초가 여기에만 있어서
// 결과가 던지기와 같은 프레임에 떴다
import {
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
  const phase = (local - cycle * CAPTURE_SHAKE_STEP) / CAPTURE_SHAKE_STEP
  return Math.sin(phase * Math.PI * 2) * Math.sin(phase * Math.PI) * 0.42
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
