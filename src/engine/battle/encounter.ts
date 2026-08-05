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
 * 조우 판정이 들고 있어야 하는 상태.
 *
 * 원작은 조우 직후와 맵 이동 직후에 **몇 걸음 동안 거의 안 나오는 유예 구간**을
 * 둔다. 걸음마다 독립적으로 굴리면 그 구간이 사라져서, 방금 배틀을 끝내고
 * 나오자마자 또 튀어나온다
 */
export interface EncounterState {
  /** 유예 구간에서 판정한 횟수. 원작의 `wildBattleMetadata.encounterAttempts` */
  attempts: number
}

export function newEncounterState(): EncounterState {
  return { attempts: 0 }
}

/**
 * 유예 구간의 길이(걸음).
 *
 * 원작은 출현률을 8비트 올렸다가 10으로 나누고 다시 내린다 — 결국 `rate/10`을
 * 8에서 뺀 값이다. **출현률이 높은 곳일수록 유예가 짧다.** 우리 표의 여섯 값에
 * 대해서는 30·35 → 5걸음, 10·15 → 7걸음, 5 → 8걸음이다.
 *
 * 원작 `GracePeriodStepsUsed` (pokeplatinum `src/overlay006/wild_encounters.c`)
 */
export function graceSteps(rate: number): number {
  const shifted = Math.min(8, Math.floor(Math.floor((rate << 8) / 10) / 256))
  return 8 - shifted
}

/**
 * 걸음마다 하는 평평한 관문. **여기를 60%가 그냥 떨어진다.**
 *
 * 긴 풀숲이나 자전거면 70%로 올라가는데, 둘 다 아직 없다 — 긴 풀숲은 타일
 * 행동값을 아직 못 갈랐고(DATA.md §2.7의 미확정 30종), 자전거도 없다
 */
const FLAT_GATE = 40

/**
 * 한 걸음에 조우가 일어나는가. **관문이 셋이다** (원작 `ShouldGetRandomEncounter`).
 *
 * 1. 조우 직후 유예 구간이면 95%가 여기서 떨어진다
 * 2. 평평한 40% 관문 — 걸음의 60%는 출현률을 보기도 전에 끝난다
 * 3. 표의 출현률
 *
 * 그래서 실효 확률은 출현률 그대로가 아니라 **그 40%**다. 201번도로(출현률 30)는
 * 걸음당 12%, 평균 8.3걸음이다. 관문 ②를 빠뜨리면 3.3걸음이 되어 풀숲을
 * 지나갈 수가 없다.
 *
 * ⚠️ `state.attempts`를 **고친다**. 유예 구간이 걸음을 세야 끝나기 때문이다
 */
export function shouldEncounter(rate: number, state: EncounterState, rng: Rng): boolean {
  if (rate <= 0) return false

  if (state.attempts < graceSteps(rate)) {
    state.attempts++
    if (rng() * 100 >= 5) return false
  }

  if (rng() * 100 >= FLAT_GATE) return false
  return rng() * 100 < rate
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

/** 이 타일에서 야생이 나올 수 있는가. 물 위는 파도타기가 들어올 때 함께 다룬다 */
export function isEncounterTile(behavior: number): boolean {
  return behavior === Behavior.TALL_GRASS
}
