// 경험치 곡선 6종 (4세대)
//
// @pkmn/sim은 레벨업을 다루지 않으므로(대전 시뮬레이터다) 여기는 대조할 오라클이
// 없다. 대신 **레벨 100 총량**이 공표된 상수라 그것이 독립 검증이 된다 —
// 식을 한 글자라도 틀리면 여섯 개 중 하나는 반드시 어긋난다.
import type { Species } from '../../data/schema'

export const MAX_LEVEL = 100

/** 롬 growthRate 값 (DATA.md §2.4) */
export const GrowthRate = {
  MEDIUM_FAST: 0,
  ERRATIC: 1,
  FLUCTUATING: 2,
  MEDIUM_SLOW: 3,
  FAST: 4,
  SLOW: 5,
} as const

/** 레벨 100에 필요한 누적 경험치. 식이 맞는지 재는 자다 */
export const TOTAL_AT_100: Record<number, number> = {
  [GrowthRate.MEDIUM_FAST]: 1_000_000,
  [GrowthRate.ERRATIC]: 600_000,
  [GrowthRate.FLUCTUATING]: 1_640_000,
  [GrowthRate.MEDIUM_SLOW]: 1_059_860,
  [GrowthRate.FAST]: 800_000,
  [GrowthRate.SLOW]: 1_250_000,
}

function erratic(n: number): number {
  if (n <= 50) return (n ** 3 * (100 - n)) / 50
  if (n <= 68) return (n ** 3 * (150 - n)) / 100
  if (n <= 98) return (n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500
  return (n ** 3 * (160 - n)) / 100
}

function fluctuating(n: number): number {
  if (n <= 15) return (n ** 3 * (Math.floor((n + 1) / 3) + 24)) / 50
  if (n <= 36) return (n ** 3 * (n + 14)) / 50
  return (n ** 3 * (Math.floor(n / 2) + 32)) / 50
}

/**
 * 그 레벨에 도달하는 데 필요한 누적 경험치.
 *
 * ⚠️ 레벨 1은 무조건 0이다. 식을 그대로 넣으면 완만(1)·느림(1)·불규칙(1)이
 * 0이 아닌 값을 내고, 굼뜸은 −54가 나온다 — 곡선식은 2레벨부터의 것이다
 */
export function expForLevel(rate: number, level: number): number {
  const n = Math.min(MAX_LEVEL, Math.floor(level))
  if (n <= 1) return 0
  switch (rate) {
    case GrowthRate.ERRATIC: return Math.floor(erratic(n))
    case GrowthRate.FLUCTUATING: return Math.floor(fluctuating(n))
    case GrowthRate.MEDIUM_SLOW: return Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140)
    case GrowthRate.FAST: return Math.floor((4 * n ** 3) / 5)
    case GrowthRate.SLOW: return Math.floor((5 * n ** 3) / 4)
    default: return n ** 3 // 보통
  }
}

/** 누적 경험치가 몇 레벨인가. 곡선이 단조증가라 위에서부터 훑으면 된다 */
export function levelForExp(rate: number, exp: number): number {
  for (let level = MAX_LEVEL; level > 1; level--) {
    if (exp >= expForLevel(rate, level)) return level
  }
  return 1
}

/** 다음 레벨까지 남은 경험치. 100레벨이면 0 */
export function expToNextLevel(rate: number, exp: number): number {
  const level = levelForExp(rate, exp)
  if (level >= MAX_LEVEL) return 0
  return expForLevel(rate, level + 1) - exp
}

/** 현재 레벨 구간에서의 진행도 0~1. HUD의 경험치 바가 쓴다 */
export function levelProgress(rate: number, exp: number): number {
  const level = levelForExp(rate, exp)
  if (level >= MAX_LEVEL) return 1
  const floorExp = expForLevel(rate, level)
  const span = expForLevel(rate, level + 1) - floorExp
  return span > 0 ? (exp - floorExp) / span : 0
}

/** 종족의 곡선으로 그 레벨의 시작 경험치를 구한다 */
export function startingExp(species: Pick<Species, 'growthRate'>, level: number): number {
  return expForLevel(species.growthRate, level)
}
