import { describe, expect, it } from 'vitest'
import {
  CAPTURE_SEAL_TIME,
  CAPTURE_THROW_TIME,
  ballPalette,
  ballShakeAngle,
  captureBodyScale,
  captureResolveAt,
  recallsBody,
  throwArc,
  trainerThrowOrigin,
} from './battleBallMotion'
import { battleNdc } from '../../engine/battle/shots'

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

describe('볼이 날아오는 자리', () => {
  // 배틀에 사람이 서지 않는다 — 등장 볼도 화면 밖에서 와서 화면으로 날아든다
  it('출발점은 고정 카메라의 화면 밖이다', () => {
    expect(battleNdc(trainerThrowOrigin('p2a'), 1.6)[0]).toBeGreaterThan(1)
    expect(battleNdc(trainerThrowOrigin('p1a'), 1.6)[0]).toBeLessThan(-1)
  })
})

describe('앞 몸을 거두는가 (`RecallPokemon`)', () => {
  it('서 있던 다른 마리로 바뀔 때만 거둔다', () => {
    expect(recallsBody({ key: 'p1: 모부기', alive: true }, 'p1: 찌르꼬')).toBe(true)
    // 비는 자리도 거둔다 (밀려나는 기술)
    expect(recallsBody({ key: 'p1: 모부기', alive: true }, null)).toBe(true)
  })

  it('변신은 열쇠가 같아 안 거둔다 — 종만 바뀐다', () => {
    expect(recallsBody({ key: 'p2: 메타몽', alive: true }, 'p2: 메타몽')).toBe(false)
  })

  it('쓰러진 뒤의 교체와 첫 등판은 거두지 않는다', () => {
    expect(recallsBody({ key: 'p1: 모부기', alive: false }, 'p1: 찌르꼬')).toBe(false)
    expect(recallsBody({ key: null, alive: false }, 'p1: 찌르꼬')).toBe(false)
  })
})
