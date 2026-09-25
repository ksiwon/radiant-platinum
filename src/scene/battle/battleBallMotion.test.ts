import { describe, expect, it } from 'vitest'
import {
  CAPTURE_SEAL_TIME,
  CAPTURE_THROW_TIME,
  ballPalette,
  ballShakeAngle,
  captureBodyScale,
  captureResolveAt,
  throwArc,
  trainerStandAt,
  trainerThrowOrigin,
} from './battleBallMotion'
import { CAMERA, PAIR_DIR, pairOffset, SLOT, viewDepth } from '../../engine/battle/shots'

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

describe('짝으로 선 트레이너 (REPAIR §123)', () => {
  /** 카메라에서 본 시선 좌우 값 ÷ 깊이 — 화면 x에 비례한다 */
  const screenX = (p: readonly [number, number, number]): number =>
    ((p[0] - CAMERA.position[0]) * PAIR_DIR[0] + (p[2] - CAMERA.position[2]) * PAIR_DIR[2]) / viewDepth(p)

  it('원작처럼 제 포켓몬 발판과 같은 화면 x에 선다 — 원작에는 트레이너만의 좌표가 없다', () => {
    for (const slot of ['p1a', 'p1b', 'p2a', 'p2b'] as const) {
      const side = slot.startsWith('p1') ? 'p1' : 'p2'
      const padBase = [SLOT[side].x, 0, SLOT[side].z] as const
      const off = pairOffset(slot)
      const pad = [padBase[0] + PAIR_DIR[0] * off, 0, padBase[2] + PAIR_DIR[2] * off] as const
      const stand = trainerStandAt(slot, true)
      const base = trainerThrowOrigin(slot)
      // 가운데에서 벌어진 화면 x가 발판과 트레이너가 같다
      expect(screenX(stand) - screenX(base)).toBeCloseTo(screenX(pad) - screenX(padBase), 6)
    }
  })

  it('짝이 없으면 싱글 자리 그대로다', () => {
    expect(trainerStandAt('p2a', false)).toEqual(trainerThrowOrigin('p2a'))
  })
})
