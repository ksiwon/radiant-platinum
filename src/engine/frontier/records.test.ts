// 배틀팩토리 기록 (PARITY §9.3)
import { describe, expect, it } from 'vitest'
import { ChallengeType } from './factory'
import {
  awardPrint, beginChallenge, factorySlot, FACTORY_SLOTS, finishChallenge, newFactoryRecords,
  recordAt,
} from './records'

describe('넉 줄', () => {
  it('레벨50·오픈레벨 × 싱글·더블', () => {
    expect(newFactoryRecords().records).toHaveLength(FACTORY_SLOTS)
    expect(factorySlot(false, ChallengeType.SINGLE)).toBe(0)
    expect(factorySlot(false, ChallengeType.DOUBLE)).toBe(1)
    expect(factorySlot(true, ChallengeType.SINGLE)).toBe(2)
    expect(factorySlot(true, ChallengeType.DOUBLE)).toBe(3)
  })
})

describe('연승을 잇는 표식', () => {
  it('라운드를 마치면 그 연승을 이어받는다', () => {
    const after = finishChallenge(newFactoryRecords(), 0, 7, 2, true)
    expect(beginChallenge(after, 0)).toEqual({ streak: 7, trades: 2 })
  })

  it('⚠️ 지면 값은 남지만 이어받지 않는다 — 0부터 다시다', () => {
    const after = finishChallenge(newFactoryRecords(), 0, 13, 4, false)
    expect(recordAt(after, 0).streak).toBe(13)
    expect(beginChallenge(after, 0)).toEqual({ streak: 0, trades: 0 })
  })

  it('줄이 서로 안 섞인다', () => {
    const after = finishChallenge(newFactoryRecords(), 2, 21, 5, true)
    expect(beginChallenge(after, 2).streak).toBe(21)
    expect(beginChallenge(after, 0).streak).toBe(0)
  })
})

describe('최고 기록', () => {
  it('넘으면 갱신되고 못 넘으면 그대로다', () => {
    let all = finishChallenge(newFactoryRecords(), 0, 21, 3, true)
    expect(recordAt(all, 0).best).toBe(21)
    all = finishChallenge(all, 0, 7, 9, false)
    expect(recordAt(all, 0).best).toBe(21)
    expect(recordAt(all, 0).streak).toBe(7)
  })

  it('⚠️ 기록을 깨면 교환 수를 덮어쓴다 — 옛 기록의 수가 남으면 안 된다', () => {
    let all = finishChallenge(newFactoryRecords(), 0, 21, 30, true)
    all = finishChallenge(all, 0, 49, 2, true)
    expect(recordAt(all, 0)).toMatchObject({ best: 49, bestTrades: 2 })
  })

  it('⚠️ 기록과 같으면 교환이 **많은** 쪽을 남긴다', () => {
    let all = finishChallenge(newFactoryRecords(), 0, 21, 3, true)
    all = finishChallenge(all, 0, 21, 11, true)
    expect(recordAt(all, 0)).toMatchObject({ best: 21, bestTrades: 11 })
    all = finishChallenge(all, 0, 21, 1, true)
    expect(recordAt(all, 0).bestTrades).toBe(11)
  })
})

describe('인쇄', () => {
  it('금이 은을 덮고 은은 금을 못 덮는다', () => {
    let all = awardPrint(newFactoryRecords(), 1)
    expect(all.print).toBe(1)
    all = awardPrint(all, 2)
    expect(all.print).toBe(2)
    all = awardPrint(all, 1)
    expect(all.print).toBe(2)
  })
})
