import type { SlotId } from '../../engine/battle/events'

export type Point3 = readonly [number, number, number]

export const CAPTURE_THROW_TIME = 0.52
export const CAPTURE_SEAL_TIME = 0.74
export const CAPTURE_SHAKE_START = 0.92
const CAPTURE_SHAKE_STEP = 0.46
const CAPTURE_RELEASE_TIME = 0.28

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

export function captureResolveAt(shakes: number): number {
  return CAPTURE_SHAKE_START + Math.max(0, shakes) * CAPTURE_SHAKE_STEP
}

export function captureDuration(shakes: number, caught: boolean): number {
  return captureResolveAt(shakes) + (caught ? 0.72 : 0.62)
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
