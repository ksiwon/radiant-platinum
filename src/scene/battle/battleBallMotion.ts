import type { SlotId } from '../../engine/battle/events'
import { PAIR_DIR } from '../../engine/battle/shots'
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

export function trainerThrowOrigin(slot: SlotId): Point3 {
  return slot.startsWith('p1') ? [-4.4, 1.65, 6.2] : [4.6, 1.65, -6.4]
}

/**
 * 한 쪽에 트레이너가 **둘** 선 판에서 두 사람이 벌어지는 폭 (PARITY §2.2b).
 *
 * ⚠️ **재서 고른 값이 아니고 원작 값도 아니다.** 원작 DS는 트레이너 둘을 두 칸
 * 그림으로 나란히 세우는데(`BattleDisplay_NewManagedSpriteTrainer`의 x 좌표가
 * 전투원마다 다르다) 그 값을 우리 무대 척도로 옮긴 적이 없다. 한 사람 폭(어깨
 * 0.5m)의 두 배를 넘겨 몸이 안 겹치게만 잡았다 — 화면 확인이 남았다 (REPAIR §82)
 */
const PAIRED_TRAINER_GAP = { p1: 0.8, p2: 1.3 } as const

/**
 * 그 자리의 트레이너가 서는 곳. 한 쪽에 한 사람이면 `trainerThrowOrigin`과 같다.
 *
 * 둘이면 자리 a의 주인이 화면 오른쪽, b의 주인이 왼쪽에 선다 — 포켓몬 발판이
 * 벌어지는 방향(`shots`의 `PAIR_DIR`, 화면 왼쪽)과 같은 쪽이다
 */
export function trainerStandAt(slot: SlotId, paired: boolean): Point3 {
  const base = trainerThrowOrigin(slot)
  if (!paired) return base
  const side = slot.startsWith('p1') ? 'p1' : 'p2'
  const off = PAIRED_TRAINER_GAP[side] * (slot.endsWith('a') ? -1 : 1)
  return [base[0] + PAIR_DIR[0] * off, base[1], base[2] + PAIR_DIR[2] * off]
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
