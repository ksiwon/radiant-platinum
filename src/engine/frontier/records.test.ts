// 배틀팩토리 기록 (PARITY §9.3)
import { describe, expect, it } from 'vitest'
import { ChallengeType } from './factory'
import {
  beginChallenge, clearSuspended, dropStreak, factorySlot, FACTORY_SLOTS, finishChallenge,
  newFactoryRecords, recordAt, suspendChallenge, type FactorySuspended,
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

const PAUSED: FactorySuspended = {
  challenge: ChallengeType.SINGLE, openLevel: false, battle: 3, trainers: [1, 2, 3, 4, 5, 6, 7],
  party: [], partySets: [], defeated: [], defeatedSets: [],
}

describe('쉰다 (`ov104_02234148(…, 2)`)', () => {
  it('지금 연승과 교환 수만 적는다 — 표식도 최고 기록도 그대로다', () => {
    const before = finishChallenge(newFactoryRecords(), 0, 21, 3, true)
    const after = suspendChallenge(before, 0, 24, 5, PAUSED)
    expect(recordAt(after, 0)).toEqual({ streak: 24, trades: 5, best: 21, bestTrades: 3, active: true })
    expect(after.suspended).toBe(PAUSED)
    expect(clearSuspended(after).suspended).toBeNull()
  })
})

describe('저장 안 하고 끈 판 (`ScrCmd_2C5`)', () => {
  it('표식 · 최근 연승 · 최근 교환 수가 0이 되고 최고 기록은 남는다', () => {
    const before = finishChallenge(newFactoryRecords(), 1, 14, 6, true)
    const after = dropStreak(before, 1)
    expect(recordAt(after, 1)).toEqual({ streak: 0, trades: 0, best: 14, bestTrades: 6, active: false })
    expect(beginChallenge(after, 1)).toEqual({ streak: 0, trades: 0 })
  })
})
