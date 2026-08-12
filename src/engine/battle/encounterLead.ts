// 선두 포켓몬·도구·피리·리펠이 야생 조우를 바꾼다 (PARITY §1.22)
// — `src/overlay006/wild_encounters.c`의 `WildEncounters_FieldParams` 일가.
//
// **눈에 안 보이는 규칙 뭉치라 제일 조용히 빠진다.** 조우가 일어나기는 하니까
// 화면만 봐서는 멀쩡하다. 그런데 리펠을 뿌려도 계속 나오고, 자력을 앞세워도
// 코일이 안 나오고, 최면술을 앞세워도 레벨이 안 올라간다 — 4세대에서 "선두를
// 누구로 두는가"가 사냥의 절반인데 그 절반이 통째로 없는 상태다.
//
// ⚠️ **원작 버그 둘은 안 옮긴다** ([BUGS.md](../../../docs/BUGS.md) §1.2·§1.3).
// 끈끈이·흡반의 낚시 2배가 버려진 식이고(`newEncRate * 2;`), 자력이 물에서
// 정전기 판정에 덮어써진다. 둘 다 디컴프가 `// BUG:`로 표시해 둔 자기 모순이다.
import type { LandSlot, Rng, WaterTable } from './encounter'

/**
 * 조우에 끼어드는 특성 번호 (`abilities.narc` 색인).
 *
 * 스무 개가 전부다. 손으로 고른 목록이 아니라 `wild_encounters.c`가 이름으로
 * 부르는 것 전부를 옮긴 것이다
 */
export const LeadAbility = {
  /** 악취 — 출현률 ÷2 */
  STENCH: 1,
  /** 모래숨기 — 모래바람 맵에서 ÷2 */
  SAND_VEIL: 8,
  /** 정전기 — 전기 타입 칸을 고른다 */
  STATIC: 9,
  /** 복안 — 도구를 들고 나올 확률이 오른다 */
  COMPOUND_EYES: 14,
  /** 흡반 — 낚시 출현률 ×2 */
  SUCTION_CUPS: 21,
  /** 위협 — 레벨 낮은 야생을 절반 쫓는다 */
  INTIMIDATE: 22,
  /** 싱크로 — 성격을 절반 물려준다 */
  SYNCHRONIZE: 28,
  /** 발광 — 출현률 ×2 */
  ILLUMINATE: 35,
  /** 자력 — 강철 타입 칸을 고른다 */
  MAGNET_PULL: 42,
  /** 프레셔 — 레벨이 높은 쪽으로 */
  PRESSURE: 46,
  /** 날카로운눈 — 레벨 낮은 야생을 절반 쫓는다 */
  KEEN_EYE: 51,
  /** 의욕 — 레벨이 높은 쪽으로 */
  HUSTLE: 55,
  /** 헤롱헤롱바디 — 2/3 확률로 반대 성별 */
  CUTE_CHARM: 56,
  /** 점착 — 낚시 출현률 ×2 */
  STICKY_HOLD: 60,
  /** 개미지옥 — 출현률 ×2 */
  ARENA_TRAP: 71,
  /** 의기양양 — 레벨이 높은 쪽으로 */
  VITAL_SPIRIT: 72,
  /** 하얀연기 — 출현률 ÷2 */
  WHITE_SMOKE: 73,
  /** 눈숨기 — 눈 맵에서 ÷2 */
  SNOW_CLOAK: 81,
  /** 속보 — 출현률 ÷2 */
  QUICK_FEET: 95,
  /** 노가드 — 출현률 ×2 */
  NO_GUARD: 99,
} as const

/** 맵 헤더의 날씨 번호 (`constants/overworld_weather.h`). 숨기 특성이 이걸 본다 */
export const OverworldWeather = {
  SNOWING: 5,
  HEAVY_SNOW: 6,
  BLIZZARD: 7,
  SANDSTORM: 10,
} as const

/** 불어 둔 피리 (`FLUTE_FACTOR_*`) */
export const Flute = { NONE: 0, BLACK: 1, WHITE: 2 } as const

/** 클리어부적·순수한향로. 출현률을 2/3로 만든다 */
export const ITEM_CLEANSE_TAG = 224
export const ITEM_PURE_INCENSE = 320

/** 선두 포켓몬에게서 읽는 것 전부 (`WildEncounters_FieldParams`) */
export interface Lead {
  /**
   * 알인가. **알이면 특성이 아예 없는 것과 같다** — 원작은 `ABILITY_BAD_DREAMS`를
   * 꽂아 두는데, 그 특성에 필드 효과가 없다는 것을 이용한 자리 채우기다
   */
  isEgg: boolean
  ability: number
  level: number
  gender: 'male' | 'female' | 'genderless'
  pid: number
  heldItem: number
}

/** 파티가 비었거나 아직 안 실렸을 때. 아무 보정도 안 붙는다 */
export const NO_LEAD: Lead = {
  isEgg: true, ability: 0, level: 0, gender: 'genderless', pid: 0, heldItem: 0,
}

/** 그 특성이 지금 도는가. 알이면 언제나 아니다 */
export function leadHas(lead: Lead, ability: number): boolean {
  return !lead.isEgg && lead.ability === ability
}

/** 레벨을 밀어 올리는 셋 — 의욕·의기양양·프레셔가 같은 자리에 있다 */
function pushesLevel(lead: Lead): boolean {
  return leadHas(lead, LeadAbility.HUSTLE)
    || leadHas(lead, LeadAbility.VITAL_SPIRIT)
    || leadHas(lead, LeadAbility.PRESSURE)
}

/** 조우 판정을 둘러싼 필드 상태 */
export interface FieldMods {
  lead: Lead
  /** 맵 날씨 (`MapHeader.weather`). 모래숨기·눈숨기가 본다 */
  weather: number
  /** 불어 둔 피리 */
  flute: number
  /**
   * 리펠이 도는 동안 **싸울 수 있는 첫 마리**의 레벨. 0이면 리펠이 안 돈다.
   *
   * ⚠️ 선두가 아니다 — 원작은 `Party_FindFirstEligibleBattler`를 쓴다. 선두가
   * 쓰러져 있으면 다음 마리의 레벨이 기준이 된다
   */
  repelLevel: number
  /** 오늘. 특별한 날이 평평한 관문을 ±5·±10 움직인다 */
  month: number
  day: number
}

/**
 * 걸어서 만나는 출현률 보정.
 *
 * ⚠️ **차례가 값을 바꾼다.** 원작은 특성 → 피리 → 도구 순으로 부르고 **특성
 * 뒤에서 한 번만** 100으로 자른다 (`WildEncounters_TryWildEncounter` 267~270).
 * 전부 정수 나눗셈이라 순서를 바꾸면 1씩 어긋난다
 */
export function walkRate(rate: number, mods: FieldMods): number {
  const { lead } = mods
  let out = rate
  if (!lead.isEgg) {
    if (leadHas(lead, LeadAbility.ARENA_TRAP)
      || leadHas(lead, LeadAbility.NO_GUARD)
      || leadHas(lead, LeadAbility.ILLUMINATE)) {
      out *= 2
    } else if (leadHas(lead, LeadAbility.SAND_VEIL)) {
      if (mods.weather === OverworldWeather.SANDSTORM) out = Math.floor(out / 2)
    } else if (leadHas(lead, LeadAbility.SNOW_CLOAK)) {
      const snowing = mods.weather === OverworldWeather.SNOWING
        || mods.weather === OverworldWeather.HEAVY_SNOW
        || mods.weather === OverworldWeather.BLIZZARD
      if (snowing) out = Math.floor(out / 2)
    } else if (leadHas(lead, LeadAbility.WHITE_SMOKE)
      || leadHas(lead, LeadAbility.QUICK_FEET)
      || leadHas(lead, LeadAbility.STENCH)) {
      out = Math.floor(out / 2)
    }
    if (out > 100) out = 100
  }

  if (mods.flute === Flute.BLACK) out = Math.floor(out / 2)
  else if (mods.flute === Flute.WHITE) out = out + Math.floor(out / 2)

  if (lead.heldItem === ITEM_CLEANSE_TAG || lead.heldItem === ITEM_PURE_INCENSE) {
    out = Math.floor((out * 2) / 3)
  }
  return out
}

/**
 * 낚시 출현률 보정.
 *
 * ⚠️ **피리도 도구도 안 붙는다.** 원작이 낚시 쪽에서는 특성만 부른다
 * (`WildEncounters_TryFishingEncounter` 394 — 뒤에 피리·도구 호출이 없다).
 *
 * ⚠️ **끈끈이·흡반의 2배를 되살린다** (BUGS.md §1.2). 원작 코드는
 * `newEncRate * 2;` — 결과를 안 담는 버려진 식이라 두 특성이 낚시에서 아무
 * 일도 안 한다. 이 둘에게 낚시 효과는 그것 하나뿐이라, 안 고치면 자리가 죽는다
 */
export function fishRate(rate: number, lead: Lead): number {
  if (lead.isEgg) return rate
  let out = rate
  if (leadHas(lead, LeadAbility.STICKY_HOLD) || leadHas(lead, LeadAbility.SUCTION_CUPS)) {
    out *= 2
  }
  return out > 100 ? 100 : out
}

/**
 * 타입이 맞는 칸을 고른다 (`ForceMatchingTypeEncounterSlot`).
 *
 * 표 안에 그 타입이 **하나라도 있고 전부는 아닐 때만** 고른다. 전부가 그
 * 타입이면 고를 이유가 없고, 하나도 없으면 고를 것이 없다
 */
function matchingSlot(
  species: readonly number[], type: number,
  typeOf: (species: number) => readonly [number, number], rng: Rng,
): number | null {
  const hits: number[] = []
  for (let i = 0; i < species.length; i++) {
    const [t1, t2] = typeOf(species[i]!)
    if (t1 === type || t2 === type) hits.push(i)
  }
  if (hits.length === 0 || hits.length === species.length) return null
  return hits[Math.floor(rng() * hits.length)] ?? null
}

/** 강철 · 전기 (`constants/pokemon.h`의 `TYPE_*`) */
export const TYPE_ELECTRIC = 13
export const TYPE_STEEL = 8

/**
 * 자력·정전기가 칸을 고른다 (`TryGetSlotForTypeMatchAbility`).
 *
 * 특성이 맞아도 **절반은 그냥 넘어간다** — `LCRNG_RandMod(2)`가 먼저다.
 *
 * ⚠️ **물에서도 돈다** (BUGS.md §1.3). 원작은 파도타기·낚시 갈래에서 자력
 * 판정의 결과를 정전기 판정이 그대로 덮어써서(`if (!forcedSlot)`가 빠졌다)
 * 자력이 물에서 한 번도 안 걸린다. 풀숲 쪽 차례를 그대로 쓴다
 */
export function forcedSlot(
  species: readonly number[], lead: Lead,
  typeOf: (species: number) => readonly [number, number], rng: Rng,
): number | null {
  if (lead.isEgg) return null
  const pairs: readonly (readonly [number, number])[] = [
    [LeadAbility.MAGNET_PULL, TYPE_STEEL],
    [LeadAbility.STATIC, TYPE_ELECTRIC],
  ]
  for (const [ability, type] of pairs) {
    if (!leadHas(lead, ability)) continue
    if (Math.floor(rng() * 2) !== 0) return null
    return matchingSlot(species, type, typeOf, rng)
  }
  return null
}

/**
 * 같은 종의 더 높은 레벨 칸으로 옮긴다 (`TryFindHigherLevelSlot`).
 *
 * 풀숲 전용이다 — 물은 칸마다 레벨 범위가 있어서 `waterLevel`이 대신 한다.
 * 절반은 그냥 넘어간다
 */
export function higherLevelSlot(
  land: readonly LandSlot[], lead: Lead, slot: number, rng: Rng,
): number {
  if (!pushesLevel(lead)) return slot
  if (Math.floor(rng() * 2) === 0) return slot
  let best = slot
  for (let i = 0; i < land.length; i++) {
    const here = land[i]!, cur = land[best]!
    if (here.species === cur.species && here.level > cur.level) best = i
  }
  return best
}

/**
 * 물 칸의 레벨 (`GetWildMonLevel`).
 *
 * 의욕·의기양양·프레셔면 절반은 최대 레벨로 고정된다. 그 셋이 없으면 균등.
 *
 * ⚠️ 난수를 **먼저** 뽑고 특성을 본다. 순서를 바꾸면 같은 씨앗에서 다른 값이 나온다
 */
export function waterLevel(min: number, max: number, lead: Lead, rng: Rng): number {
  const lo = Math.min(min, max), hi = Math.max(min, max)
  const roll = Math.floor(rng() * (hi - lo + 1))
  if (!pushesLevel(lead)) return lo + roll
  return Math.floor(rng() * 2) === 0 ? lo + roll : hi
}

/**
 * 날카로운눈·위협이 쫓아낸다 (`FirstMonAbilityPreventsEncounter`).
 *
 * 선두가 **6레벨 이상**이고 야생이 그보다 5 이상 낮으면 절반을 막는다.
 * 5레벨 이하면 아무것도 안 한다 — 원작이 그렇게 잘라 둔다
 */
export function leadScaresOff(lead: Lead, wildLevel: number, rng: Rng): boolean {
  if (lead.isEgg) return false
  if (!leadHas(lead, LeadAbility.KEEN_EYE) && !leadHas(lead, LeadAbility.INTIMIDATE)) return false
  if (lead.level <= 5) return false
  return wildLevel <= lead.level - 5 && Math.floor(rng() * 2) === 0
}

/**
 * 리펠이 막는가 (`RepelPreventsEncounter`).
 *
 * ⚠️ **같으면 안 막는다.** 조건이 `>`라, 리펠을 뿌리고도 같은 레벨은 나온다
 */
export function repelBlocks(repelLevel: number, wildLevel: number): boolean {
  return repelLevel > 0 && repelLevel > wildLevel
}

/**
 * 야생이 도구를 들고 나올 확률 표 (`sHeldItemChance`).
 *
 * 복안이면 「없음 20 · 흔한 것 60 · 귀한 것 20」, 아니면 「45 · 50 · 5」다.
 * 두 칸이 같으면 100%라 여기까지 안 온다
 */
export function heldItemRoll(
  common: number, rare: number, lead: Lead, rng: Rng,
): number {
  if (common === 0 && rare === 0) return 0
  if (common === rare) return common
  const eyed = leadHas(lead, LeadAbility.COMPOUND_EYES)
  const [none, upTo] = eyed ? [20, 80] : [45, 95]
  const roll = Math.floor(rng() * 100)
  if (roll < none) return 0
  return roll < upTo ? common : rare
}

/**
 * 싱크로가 성격을 물려준다 (`GetNatureForWildMon`).
 *
 * 절반이다. 물려줄 때는 **선두 PID의 나머지**를 그대로 쓴다
 */
export function wildNature(lead: Lead, rng: Rng): number | null {
  if (!leadHas(lead, LeadAbility.SYNCHRONIZE)) return null
  if (Math.floor(rng() * 2) !== 0) return null
  return lead.pid % 25
}

/**
 * 헤롱헤롱바디가 반대 성별을 부른다 (`CreateWildMon`).
 *
 * **2/3**이다 — `LCRNG_RandMod(3) > 0`이라 셋 중 둘이다. 절반이 아니다.
 * 선두가 무성이면 뒤집을 것이 없어서 안 걸린다
 */
export function wildGender(lead: Lead, rng: Rng): 'male' | 'female' | null {
  if (!leadHas(lead, LeadAbility.CUTE_CHARM)) return null
  if (lead.gender === 'genderless') return null
  if (Math.floor(rng() * 3) === 0) return null
  return lead.gender === 'female' ? 'male' : 'female'
}

/** 표의 종족 번호만 뽑는다 — 칸 고르기가 종족 타입만 본다 */
export function speciesOf(land: readonly LandSlot[]): number[] {
  return land.map((s) => s.species)
}

/** 물 표의 종족 번호 */
export function waterSpeciesOf(t: WaterTable): number[] {
  return t.slots.map((s) => s.species)
}
