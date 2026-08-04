// 야생 조우 판정 (DATA.md §2.8)
//
// 슬롯 확률은 4세대 고정표다. 12슬롯의 가중치가 합 100이 되고, 롬에는 이 표가
// 들어 있지 않다 — 코드에 박혀 있던 값이라 여기서도 상수로 둔다.
//
// RNG를 주입받는 이유: 테스트에서 결과를 고정해야 하고, 나중에 저장 파일 기반
// 재현 가능한 시드로 바꿀 여지를 남겨 둔다.
import { Behavior } from '../map/zone'

/** 4세대 육상 12슬롯 가중치 (합 100) */
export const LAND_SLOT_RATES = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1] as const
/** 물 5슬롯 가중치 (합 100) */
export const WATER_SLOT_RATES = [60, 30, 5, 4, 1] as const

export interface LandSlot { level: number; species: number }
export interface WaterSlot { min: number; max: number; species: number }
export interface WaterTable { rate: number; slots: WaterSlot[] }

export interface EncounterTable {
  landRate: number
  land: LandSlot[]
  swarm: number[]
  day: number[]
  night: number[]
  radar: number[]
  surf: WaterTable
  oldRod: WaterTable
  goodRod: WaterTable
  superRod: WaterTable
}

export interface WildEncounter {
  species: number
  level: number
  /** 어느 슬롯에서 나왔는지 — 디버그·로그용 */
  slot: number
}

export type Rng = () => number

function pickSlot(rates: readonly number[], rng: Rng): number {
  let roll = rng() * 100
  for (let i = 0; i < rates.length; i++) {
    roll -= rates[i]!
    if (roll < 0) return i
  }
  return rates.length - 1
}

/**
 * 한 걸음에 조우가 일어나는가.
 *
 * ⚠️ 원작의 정확한 식이 아니다. 4세대는 걸음마다 `rand(100) < rate`가 아니라
 * 걸음 수 카운터와 보정(스프레이·특성·자전거)이 얽힌 식을 쓴다. 지금은 표의
 * landRate를 그대로 백분율로 쓴다 — 체감이 원작과 비슷하고, 정확한 식은
 * 스크립트·특성이 들어올 때 함께 맞추는 편이 낫다.
 */
export function shouldEncounter(rate: number, rng: Rng): boolean {
  return rate > 0 && rng() * 100 < rate
}

/** 육상 조우 하나를 굴린다. 표가 비었으면 null */
export function rollLand(table: EncounterTable, rng: Rng): WildEncounter | null {
  if (table.landRate <= 0) return null
  const slot = pickSlot(LAND_SLOT_RATES, rng)
  const s = table.land[slot]
  if (!s || s.species <= 0) return null
  return { species: s.species, level: s.level, slot }
}

/** 물 조우 하나를 굴린다 (파도타기·낚시). 레벨은 min~max 균등 */
export function rollWater(t: WaterTable, rng: Rng): WildEncounter | null {
  if (t.rate <= 0) return null
  const slot = pickSlot(WATER_SLOT_RATES, rng)
  const s = t.slots[slot]
  if (!s || s.species <= 0) return null
  const level = s.min + Math.floor(rng() * (s.max - s.min + 1))
  return { species: s.species, level, slot }
}

/** 이 타일에서 야생이 나올 수 있는가 */
export function isEncounterTile(behavior: number): boolean {
  return behavior === Behavior.TALL_GRASS
}
