// 배틀팩토리 한 라운드 (PARITY §9.3)
import { describe, expect, it } from 'vitest'
import { ChallengeType } from './factory'
import { BATTLES_PER_ROUND, STREAK_SILVER } from './factoryTables'
import {
  applySwap, chooseParty, currentTrainer, isRoundDone, openRound, roundReward, skipSwap, winBattle,
} from './challenge'

/** 자리 번호를 그대로 종족·도구로 쓰는 가짜 표 */
const setOf = (id: number) => ({ species: id, item: 1000 + id })

/** 겹치는 값이 잘 안 나오게 도는 난수. 씨앗을 바꿔 여러 판을 만든다 */
function walk(seed: number) {
  let n = seed
  return () => {
    n = (n * 1103515245 + 12345) & 0x7fffffff
    return n / 0x7fffffff
  }
}

function fresh(streak = 0, tradeCount = 0, challenge = ChallengeType.SINGLE) {
  return openRound({ challenge, openLevel: false, streak, tradeCount, rng: walk(7), setOf })
}

describe('라운드를 연다', () => {
  it('트레이너 일곱과 빌릴 여섯, 그리고 첫 상대 셋', () => {
    const round = fresh()
    expect(round.trainers).toHaveLength(BATTLES_PER_ROUND)
    expect(round.rentals).toHaveLength(6)
    expect(round.opponents).toHaveLength(3)
    expect(round.party).toEqual([])
    expect(round.battle).toBe(0)
  })

  it('⚠️ 첫 상대는 빌린 여섯을 **다** 피한다 — 아직 고르기 전이라서다', () => {
    const round = fresh()
    const mine = new Set(round.rentals.map((r) => setOf(r.set).species))
    for (const foe of round.opponents) expect(mine.has(setOf(foe.set).species)).toBe(false)
  })

  it('연승에서 라운드 번호가 나온다', () => {
    expect(fresh(0).round).toBe(0)
    expect(fresh(21).round).toBe(3)
  })
})

describe('셋을 고른다', () => {
  it('고른 자리가 그대로 파티가 된다', () => {
    const round = chooseParty(fresh(), [0, 2, 4])
    expect(round.party.map((p) => p.set))
      .toEqual([round.rentals[0]!.set, round.rentals[2]!.set, round.rentals[4]!.set])
  })

  it('수가 틀리거나 같은 자리를 두 번 고르면 선다', () => {
    expect(() => chooseParty(fresh(), [0, 1])).toThrow(/골라야 한다/)
    expect(() => chooseParty(fresh(), [0, 1, 1])).toThrow(/두 번/)
  })
})

describe('한 판을 이긴다', () => {
  it('연승이 오르고, 이긴 상대가 바꿀 수 있는 것이 된다', () => {
    const round = chooseParty(fresh(), [0, 1, 2])
    const beaten = round.opponents
    const next = winBattle(round, walk(11), setOf)
    expect(next.battle).toBe(1)
    expect(next.streak).toBe(1)
    expect(next.swapPool).toEqual(beaten)
    expect(next.opponents).toHaveLength(3)
    // 다음 상대는 새로 뽑은 것이다
    expect(next.opponents).not.toEqual(beaten)
  })

  it('⚠️ 다음 상대는 내 셋과 방금 이긴 셋을 둘 다 피한다', () => {
    const round = chooseParty(fresh(), [0, 1, 2])
    const next = winBattle(round, walk(11), setOf)
    const avoid = new Set([...round.party, ...round.opponents].map((s) => setOf(s.set).species))
    for (const foe of next.opponents) expect(avoid.has(setOf(foe.set).species)).toBe(false)
  })

  it('일곱을 다 이기면 라운드가 끝나고 다음 상대를 안 뽑는다', () => {
    let round = chooseParty(fresh(), [0, 1, 2])
    for (let i = 0; i < BATTLES_PER_ROUND; i++) round = winBattle(round, walk(20 + i), setOf)
    expect(isRoundDone(round)).toBe(true)
    expect(round.streak).toBe(BATTLES_PER_ROUND)
    expect(round.opponents).toEqual([])
    expect(round.swapPool).toEqual([])
  })
})

describe('바꾼다', () => {
  it('내 자리가 이긴 상대의 마리로 바뀌고 교환 수가 오른다', () => {
    const round = winBattle(chooseParty(fresh(), [0, 1, 2]), walk(11), setOf)
    const taken = round.swapPool[1]!
    const after = applySwap(round, 0, 1)
    expect(after.party[0]).toEqual(taken)
    expect(after.party[1]).toEqual(round.party[1])
    expect(after.tradeCount).toBe(1)
    // 한 번 바꾸면 그 판의 바꿀 거리는 사라진다
    expect(after.swapPool).toEqual([])
  })

  it('안 바꾸면 교환 수가 그대로다', () => {
    const round = winBattle(chooseParty(fresh(), [0, 1, 2]), walk(11), setOf)
    const after = skipSwap(round)
    expect(after.party).toEqual(round.party)
    expect(after.tradeCount).toBe(0)
  })

  it('없는 자리를 집으면 선다', () => {
    const round = winBattle(chooseParty(fresh(), [0, 1, 2]), walk(11), setOf)
    expect(() => applySwap(round, 0, 9)).toThrow(/바꿀 것에/)
    expect(() => applySwap(round, 9, 0)).toThrow(/내 9번 자리/)
  })
})

describe('상값', () => {
  it('⚠️ 첫 라운드가 5 BP다 — 들어올 때 번호(0)로 세면 0이 된다', () => {
    let round = chooseParty(fresh(0), [0, 1, 2])
    for (let i = 0; i < BATTLES_PER_ROUND; i++) round = winBattle(round, walk(30 + i), setOf)
    expect(roundReward(round)).toBe(5)
  })

  it('스물한 판째를 채우면 20 BP다', () => {
    let round = chooseParty(fresh(STREAK_SILVER - BATTLES_PER_ROUND), [0, 1, 2])
    for (let i = 0; i < BATTLES_PER_ROUND; i++) round = winBattle(round, walk(40 + i), setOf)
    expect(round.streak).toBe(STREAK_SILVER)
    expect(roundReward(round)).toBe(20)
  })
})

describe('이번 판 상대', () => {
  it('판이 넘어가면 다음 트레이너다', () => {
    const round = chooseParty(fresh(), [0, 1, 2])
    expect(currentTrainer(round)).toBe(round.trainers[0])
    expect(currentTrainer(winBattle(round, walk(11), setOf))).toBe(round.trainers[1])
  })
})
