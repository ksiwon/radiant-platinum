// 배틀팩토리의 규칙 (PARITY §9.3)
//
// ⚠️ **표가 오버레이 코드에서 손으로 옮겨 온 것이다.** 추출기가 못 세어 주므로
// 여기서 모양과 수를 못 박는다 — BP 값 표와 같은 처지다 (§12.3)
import { describe, expect, it } from 'vitest'
import {
  addStreak, bpForRound, ChallengeType, commonType, drawSets, drawTrainers, eliteSlots,
  factoryLevel, opponentPartySize, opponentTierIndex, opponentTiers, playerPartySize,
  printAtNext, rentalTierIndex, rentalTiers, roundOf, trainerFor,
} from './factory'
import {
  BATTLES_PER_ROUND, BP_BY_ROUND_SOLO, MAX_STREAK, STREAK_GOLD, STREAK_SILVER,
  TIERS_LV50, TIERS_OPEN_OPPONENT, TIERS_OPEN_RENTAL, TRAINER_RANGES,
  TRAINER_THORTON_GOLD, TRAINER_THORTON_SILVER,
} from './factoryTables'

/** 0.5로 고정된 난수 — `Math.floor(0.5 * n)`이라 가운데를 집는다 */
const half = () => 0.5

/** 순서대로 내주는 난수. 어느 자리를 집는지 못 박을 때 쓴다 */
function seq(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]!
}

/** 자리 번호를 그대로 종족·도구로 쓰는 가짜 표 — 겹칠 일이 없다 */
const uniqueSets = (id: number) => ({ species: id, item: 1000 + id })

describe('표의 모양', () => {
  it('층 표 셋이 열 줄씩이고 문턱이 같은 자리에 있다', () => {
    for (const tiers of [TIERS_LV50, TIERS_OPEN_RENTAL, TIERS_OPEN_OPPONENT]) {
      expect(tiers).toHaveLength(10)
      expect(tiers.map((t) => t.upTo)).toEqual([100, 120, 140, 160, 180, 200, 220, 300, 310, 311])
      // ⚠️ **마지막 세 줄은 위가 없다.** 층을 올려 주는 갈래가 여기서 멈춘다
      expect(tiers.slice(0, 7).every((t) => t.canStepUp)).toBe(true)
      expect(tiers.slice(7).every((t) => !t.canStepUp)).toBe(true)
      for (const t of tiers) {
        expect(t.from, `${String(t.upTo)}층`).toBeGreaterThanOrEqual(1)
        expect(t.to, `${String(t.upTo)}층`).toBeLessThanOrEqual(950)
        expect(t.from).toBeLessThanOrEqual(t.to)
      }
    }
  })

  it('개체값이 여덟 단계뿐이다 — 31/8의 배수다', () => {
    const seen = new Set<number>()
    for (const tiers of [TIERS_LV50, TIERS_OPEN_RENTAL, TIERS_OPEN_OPPONENT]) {
      for (const t of tiers) seen.add(t.ivs)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 4, 8, 12, 16, 20, 24, 31])
  })

  it('트레이너 구간이 여덟 줄이고 뒤로 갈수록 센 자리다', () => {
    expect(TRAINER_RANGES).toHaveLength(8)
    for (const r of TRAINER_RANGES) {
      expect(r.normal).toBeLessThan(r.normalEnd)
      expect(r.last).toBeLessThan(r.lastEnd)
      // ⚠️ **마지막 판 구간이 보통 판보다 위다** — 끝판대장 자리다.
      // 마지막 줄만 둘이 같아서 라운드 8부터는 구별이 없어진다
      expect(r.last).toBeGreaterThanOrEqual(r.normal)
    }
    expect(TRAINER_RANGES[7]).toEqual({ normal: 200, normalEnd: 299, last: 200, lastEnd: 299 })
  })
})

describe('빌리는 층', () => {
  it('라운드 번호로 바로 집고 여덟에서 멈춘다', () => {
    expect(rentalTierIndex(0)).toBe(0)
    expect(rentalTierIndex(7)).toBe(7)
    expect(rentalTierIndex(99)).toBe(7)
  })

  it('레벨50은 빌리는 것과 상대 것이 같은 표다', () => {
    expect(rentalTiers(false)).toBe(TIERS_LV50)
    expect(opponentTiers(false)).toBe(TIERS_LV50)
    // ⚠️ 오픈레벨은 다르다 — 빌리는 쪽이 한 층 더 좁다
    expect(rentalTiers(true)).not.toBe(opponentTiers(true))
  })
})

describe('상대 층 — 트레이너 번호의 문턱', () => {
  it('번호가 작을수록 아래 층이다', () => {
    const t = TIERS_LV50
    expect(opponentTierIndex(t, 0)).toBe(0)
    expect(opponentTierIndex(t, 99)).toBe(0)
    expect(opponentTierIndex(t, 100)).toBe(1)
    expect(opponentTierIndex(t, 219)).toBe(6)
    expect(opponentTierIndex(t, 220)).toBe(7)
  })

  it('⚠️ 시설장은 마지막 줄로 간다 — 개체값 31이다', () => {
    const t = TIERS_LV50
    expect(opponentTierIndex(t, TRAINER_THORTON_SILVER)).toBe(8)
    expect(t[opponentTierIndex(t, TRAINER_THORTON_GOLD)]!.ivs).toBe(31)
  })
})

describe('개체 뽑기', () => {
  it('구간의 **위에서 아래로** 집는다', () => {
    // 0.5 → floor(0.5 × (150 - 1 + 1)) = 75 → 150 - 75 = 75
    const [first] = drawSets({
      tiers: TIERS_LV50, tierIndex: 0, count: 1, rng: half, setOf: uniqueSets,
    })
    expect(first!.set).toBe(75)
    expect(first!.ivs).toBe(0)
  })

  it('⚠️ 종족도 도구도 안 겹친다 — 같은 것이 나오면 다시 뽑는다', () => {
    // 같은 값을 세 번 준 뒤 다른 값 — 겹치는 둘을 버리고 셋째에서 채운다
    const rng = seq(0.5, 0.5, 0.5, 0.1)
    const got = drawSets({
      tiers: TIERS_LV50, tierIndex: 0, count: 2, rng, setOf: uniqueSets,
    })
    expect(got.map((g) => g.set)).toEqual([75, 135])
  })

  it('피할 목록에 든 종족·도구도 안 나온다', () => {
    const rng = seq(0.5, 0.1)
    const got = drawSets({
      tiers: TIERS_LV50, tierIndex: 0, count: 1, rng, setOf: uniqueSets,
      exclude: { species: [75], items: [] },
    })
    expect(got[0]!.set).toBe(135)
  })

  it('⚠️ 교환을 많이 했으면 마지막 자리를 한 층 위에서 뽑는다', () => {
    // 교환 10번 → 자리 하나. 여섯 중 마지막 하나만 1층(개체값 4)에서 온다
    const got = drawSets({
      tiers: TIERS_LV50, tierIndex: 0, count: 6, tradeCount: 10,
      rng: seq(0.9, 0.7, 0.5, 0.3, 0.1, 0.5), setOf: uniqueSets,
    })
    expect(got.slice(0, 5).map((g) => g.ivs)).toEqual([0, 0, 0, 0, 0])
    expect(got[5]!.ivs).toBe(4)
    expect(got[5]!.set).toBeGreaterThan(150)
  })

  it('⚠️ 올려 줄 자리 수 — 문턱 「이하」면 그 번호만큼이라 여섯 번까지는 0이다', () => {
    expect([0, 1, 6].map(eliteSlots)).toEqual([0, 0, 0])
    expect([7, 13].map(eliteSlots)).toEqual([1, 1])
    expect([14, 20].map(eliteSlots)).toEqual([2, 2])
    expect(eliteSlots(34)).toBe(4)
    expect(eliteSlots(35)).toBe(5)
    expect(eliteSlots(999)).toBe(5)
  })

  it('위가 없는 층은 안 올린다', () => {
    // 9번 줄이 마지막이라 `canStepUp`이 거짓이다
    const got = drawSets({
      tiers: TIERS_LV50, tierIndex: 9, count: 2, tradeCount: 99, rng: seq(0.5, 0.2), setOf: uniqueSets,
    })
    expect(got.every((g) => g.ivs === 31)).toBe(true)
  })

  it('⚠️ 못 뽑으면 조용히 모자란 채 내보내지 않고 선다', () => {
    // 후보가 하나뿐인 층에서 둘을 달라고 하면 영영 못 채운다
    const oneWide = [{ upTo: 1, from: 5, to: 5, ivs: 0, canStepUp: false }]
    expect(() => drawSets({
      tiers: oneWide, tierIndex: 0, count: 2, rng: half, setOf: uniqueSets,
    })).toThrow(/못 뽑았다/)
  })
})

describe('트레이너 뽑기', () => {
  it('라운드의 마지막 판은 구간이 다르다', () => {
    // 라운드 0: 보통 [0,98], 마지막 [100,118]
    expect(trainerAt(0, 0)).toBeLessThan(100)
    expect(trainerAt(0, BATTLES_PER_ROUND - 1)).toBeGreaterThanOrEqual(100)
  })

  it('⚠️ 스물한 판째와 마흔아홉 판째는 시설장이다', () => {
    // 라운드 2의 일곱 번째가 21판째다
    expect(trainerAt(2, 6)).toBe(TRAINER_THORTON_SILVER)
    // 라운드 6의 일곱 번째가 49판째다
    expect(trainerAt(6, 6)).toBe(TRAINER_THORTON_GOLD)
  })

  it('더블에는 시설장이 안 나온다 — 싱글만이다', () => {
    const id = trainerAt(2, 6, ChallengeType.DOUBLE)
    expect(id).not.toBe(TRAINER_THORTON_SILVER)
  })

  it('일곱을 서로 다르게 뽑는다', () => {
    let n = 0
    const rng = () => ((n++ * 37) % 100) / 100
    const got = drawTrainers(ChallengeType.SINGLE, 0, rng)
    expect(got).toHaveLength(BATTLES_PER_ROUND)
    expect(new Set(got).size).toBe(BATTLES_PER_ROUND)
  })
})

function trainerAt(round: number, battle: number, challenge = ChallengeType.SINGLE): number {
  return trainerFor(challenge, round, battle, half)
}

describe('연승과 BP', () => {
  it('일곱 판이 한 라운드다', () => {
    expect(roundOf(0)).toBe(0)
    expect(roundOf(6)).toBe(0)
    expect(roundOf(7)).toBe(1)
    expect(roundOf(49)).toBe(7)
  })

  it('BP가 라운드마다 오르고 여덟에서 멈춘다', () => {
    // ⚠️ 연승은 인쇄가 안 걸린 값으로 둔다 — 21·49면 표를 안 보고 20이 된다
    const solo = (round: number) => bpForRound(ChallengeType.SINGLE, round, 0)
    expect([1, 2, 3, 4].map(solo)).toEqual([5, 5, 5, 5])
    expect([5, 6, 7, 8].map(solo)).toEqual([7, 7, 8, 9])
    expect(solo(99)).toBe(BP_BY_ROUND_SOLO[8])
  })

  it('⚠️ 인쇄가 붙는 판은 20 BP다 — 라운드 표를 안 본다', () => {
    expect(bpForRound(ChallengeType.SINGLE, 3, STREAK_SILVER)).toBe(20)
    expect(bpForRound(ChallengeType.SINGLE, 7, STREAK_GOLD)).toBe(20)
    // 더블은 인쇄가 없다
    expect(bpForRound(ChallengeType.DOUBLE, 3, STREAK_SILVER)).toBe(5)
  })

  it('다음 판이 인쇄 판인지 알려 준다', () => {
    expect(printAtNext(ChallengeType.SINGLE, STREAK_SILVER - 1)).toBe(1)
    expect(printAtNext(ChallengeType.SINGLE, STREAK_GOLD - 1)).toBe(2)
    expect(printAtNext(ChallengeType.SINGLE, 5)).toBe(0)
    expect(printAtNext(ChallengeType.DOUBLE, STREAK_SILVER - 1)).toBe(0)
  })

  it('연승이 9999에서 멈춘다', () => {
    expect(addStreak(0)).toBe(1)
    expect(addStreak(MAX_STREAK)).toBe(MAX_STREAK)
  })
})

describe('판의 크기', () => {
  it('싱글·더블은 셋씩, 멀티는 둘씩 낸다', () => {
    expect(playerPartySize(ChallengeType.SINGLE)).toBe(3)
    expect(playerPartySize(ChallengeType.DOUBLE)).toBe(3)
    expect(playerPartySize(ChallengeType.MULTI)).toBe(2)
    // ⚠️ 멀티는 **뽑을 때 넷, 싸울 때 둘**이다
    expect(opponentPartySize(ChallengeType.MULTI, true)).toBe(4)
    expect(opponentPartySize(ChallengeType.MULTI, false)).toBe(2)
  })

  it('레벨50이 50, 오픈레벨이 100이다', () => {
    expect(factoryLevel(false)).toBe(50)
    expect(factoryLevel(true)).toBe(100)
  })
})

describe('상대 타입 귀띔', () => {
  it('둘 이상 겹칠 때만 답한다', () => {
    expect(commonType([[10, 10], [10, 3], [5, 6]])).toBe(10)
    expect(commonType([[1, 2], [3, 4], [5, 6]])).toBe(null)
  })

  it('⚠️ 같은 수면 번호가 작은 타입이 이긴다', () => {
    expect(commonType([[3, 9], [9, 3]])).toBe(3)
  })
})
