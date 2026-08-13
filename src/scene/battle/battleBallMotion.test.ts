import { describe, expect, it } from 'vitest'
import {
  CAPTURE_SEAL_TIME,
  CAPTURE_THROW_TIME,
  ballPalette,
  ballShakeAngle,
  captureBodyScale,
  captureResolveAt,
  throwArc,
  trainerThrowOrigin,
} from './battleBallMotion'

describe('battle ball motion', () => {
  it('keeps the throw endpoints exact and raises the midpoint', () => {
    const from = trainerThrowOrigin('p1a')
    const to = [1, 1, -2] as const
    expect(throwArc(from, to, 0)).toEqual([...from])
    expect(throwArc(from, to, 1)).toEqual([...to])
    expect(throwArc(from, to, 0.5)[1]).toBeGreaterThan(2)
  })

  it('shakes only for the number of completed checks', () => {
    expect(ballShakeAngle(0.2, 3)).toBe(0)
    expect(Math.abs(ballShakeAngle(1.02, 3))).toBeGreaterThan(0.1)
    expect(ballShakeAngle(captureResolveAt(3), 3)).toBe(0)
  })

  it('seals the target in the ball and releases it only after a failed catch', () => {
    expect(captureBodyScale(CAPTURE_THROW_TIME, 2, false)).toBe(1)
    expect(captureBodyScale(CAPTURE_SEAL_TIME, 2, false)).toBe(0)
    expect(captureBodyScale(captureResolveAt(2) + 0.3, 2, false)).toBe(1)
    expect(captureBodyScale(captureResolveAt(4) + 3, 4, true)).toBe(0)
  })

  it('uses distinct official ball color families and falls back to a Poke Ball', () => {
    expect(ballPalette(1)).not.toEqual(ballPalette(4))
    expect(ballPalette(13).bottom).toBe('#16191a')
    expect(ballPalette(999)).toEqual(ballPalette(4))
  })
})
