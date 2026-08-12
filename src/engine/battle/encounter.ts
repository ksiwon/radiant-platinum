// 야생 조우 판정 (DATA.md §2.8)
//
// 슬롯 확률은 4세대 고정표다. 12슬롯의 가중치가 합 100이 되고, 롬에는 이 표가
// 들어 있지 않다 — 코드에 박혀 있던 값이라 여기서도 상수로 둔다.
//
// RNG를 주입받는 이유: 테스트에서 결과를 고정해야 하고, 나중에 저장 파일 기반
// 재현 가능한 시드로 바꿀 여지를 남겨 둔다.
import { Behavior } from '../map/zone'
import { TimeOfDay, type TimeOfDayId } from '../map/timeOfDay'

/** 4세대 육상 12슬롯 가중치 (합 100) */
export const LAND_SLOT_RATES = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1] as const
/** 파도타기 5슬롯 가중치 (합 100) — `GetWaterEncounterSlot` */
export const WATER_SLOT_RATES = [60, 30, 5, 4, 1] as const

/** 낚싯대 셋. 조우표의 어느 칸을 볼지가 갈린다 */
export type Rod = 'old' | 'good' | 'super'

/**
 * 낚싯대별 5슬롯 가중치 (`GetRodEncounterSlot`).
 *
 * ⚠️ **낡은 낚싯대만 파도타기와 같다.** 좋은/대단한 낚싯대는 앞 두 칸이
 * 40·40이고 셋째가 15다 — 하나로 뭉뚱그리면 대단한 낚싯대의 셋째 칸(15%)이
 * 5%로 줄어, 원작에서 흔한 것이 여기서는 안 나온다
 */
export const ROD_SLOT_RATES: Readonly<Record<Rod, readonly number[]>> = {
  old: [60, 30, 5, 4, 1],
  good: [40, 40, 15, 4, 1],
  super: [40, 40, 15, 4, 1],
}

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

/**
 * 날마다 바뀌는 것들 (`data/encountersEx.json` · PARITY §6.11).
 *
 * `/arc/encdata_ex.narc` 열두 칸을 그대로 옮긴 것이다. 표 183개와 달리 맵에
 * 안 매여 있어서 한 벌뿐이다
 */
export interface EncountersEx {
  feebas: { species: number; groups: number[]; tiles: number[] }
  /** 꿀나무 세 희귀도. 각 6칸 */
  honeyTree: Record<string, number[]>
  /** 트로피가든 특별 16종 */
  trophyGarden: number[]
  greatMarsh: { natdex: number[]; local: number[]; spots: { x: number; y: number }[] }
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
 * 긴 풀(`VERY_TALL_GRASS`)이나 자전거면 30이 더 붙어 70%가 된다. ⚠️ **둘은
 * 겹치지 않는다** — 원작이 `else if`라 긴 풀 위에서 자전거를 타도 70이다
 * (`wild_encounters.c`의 `ShouldGetRandomEncounter`)
 */
const FLAT_GATE = 40
const FLAT_GATE_BONUS = 30

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
export function shouldEncounter(
  rate: number, state: EncounterState, rng: Rng, where: Footing = {},
): boolean {
  if (rate <= 0) return false

  if (state.attempts < graceSteps(rate)) {
    state.attempts++
    if (rng() * 100 >= 5) return false
  }

  if (rng() * 100 >= flatGate(where)) return false
  return rng() * 100 < rate
}

/** 지금 무엇을 밟고 있고 무엇을 타고 있는가. 관문의 높이가 여기서 갈린다 */
export interface Footing {
  /** 긴 풀(0x03) 위인가 */
  veryTallGrass?: boolean
  /** 자전거를 타고 있는가. ⚠️ 아직 아무 데서도 안 켠다 — 자전거가 없다 */
  cycling?: boolean
}

export function flatGate(where: Footing): number {
  // 원작이 `else if`다. 긴 풀 위에서 자전거를 타도 100이 아니라 70이다
  const bonus = where.veryTallGrass || where.cycling ? FLAT_GATE_BONUS : 0
  return Math.min(100, FLAT_GATE + bonus)
}

/**
 * 시간대가 갈아 끼우는 육상 슬롯 (`WildEncounters_ReplaceTimedEncounters`).
 *
 * ⚠️ **표에 적힌 열두 칸은 「아침」판이다.** 낮·해질녘이면 2·3번 칸의 종족이
 * `day`로, 밤·심야면 `night`로 바뀐다. **레벨은 안 바뀐다** — 갈아 끼우는 것은
 * 종족뿐이라, 레벨까지 옮기면 원작에 없는 개체가 나온다.
 *
 * 아침(0)에는 아무것도 안 바뀐다. 그래서 `day`·`night`가 놀고 있으면
 * 하루 종일 아침 표만 나온다 — 눈으로는 "왜 얘만 나오지"로만 보인다
 */
export function timedLand(table: EncounterTable, time: TimeOfDayId): LandSlot[] {
  const swap = time === TimeOfDay.DAY || time === TimeOfDay.TWILIGHT ? table.day
    : time === TimeOfDay.NIGHT || time === TimeOfDay.LATE_NIGHT ? table.night
      : null
  if (!swap) return table.land
  return table.land.map((s, i) => {
    if (i !== 2 && i !== 3) return s
    const species = swap[i - 2]
    return species === undefined || species <= 0 ? s : { level: s.level, species }
  })
}

/**
 * 오늘 무리가 뜬 자리면 슬롯 0·1을 갈아 끼운다
 * (`WildEncounters_ReplaceSwarmEncounters`).
 *
 * ⚠️ 시간대와 **다른 칸**이다 — 무리는 0·1, 시간대는 2·3. 겹치지 않아서
 * 둘이 같이 걸릴 수 있다
 */
export function swarmLand(table: EncounterTable, land: LandSlot[]): LandSlot[] {
  return land.map((s, i) => {
    if (i !== 0 && i !== 1) return s
    const species = table.swarm[i]
    return species === undefined || species <= 0 ? s : { level: s.level, species }
  })
}

/**
 * 트로피가든이 슬롯 6·7을 갈아 끼운다
 * (`WildEncounters_ReplaceTrophyGardenEncounters`).
 *
 * 자리가 안 정해졌으면(`null`) 그 칸은 표 그대로다 — 원작도
 * `TROPHY_GARDEN_SLOT_NONE`이면 손대지 않는다
 */
export function trophyLand(
  land: LandSlot[], pair: readonly (number | null)[],
): LandSlot[] {
  return land.map((s, i) => {
    if (i !== 6 && i !== 7) return s
    const species = pair[i - 6]
    return species == null || species <= 0 ? s : { level: s.level, species }
  })
}

/** 갈아 끼우는 것들. 세 자리가 안 겹쳐서 한 번에 다 걸릴 수 있다 */
export interface LandSwaps {
  /** 오늘 무리가 뜬 자리인가 — 슬롯 0·1 */
  swarming?: boolean
  /** 트로피가든 두 자리 — 슬롯 6·7 */
  trophy?: readonly (number | null)[]
}

/** 육상 조우 하나를 굴린다. 표가 비었으면 null */
export function rollLand(
  table: EncounterTable, rng: Rng, time: TimeOfDayId = TimeOfDay.MORNING,
  swaps: LandSwaps = {},
): WildEncounter | null {
  if (table.landRate <= 0) return null
  const slot = pickSlot(LAND_SLOT_RATES, rng)
  let land = timedLand(table, time)
  if (swaps.swarming) land = swarmLand(table, land)
  if (swaps.trophy) land = trophyLand(land, swaps.trophy)
  const s = land[slot]
  if (!s || s.species <= 0) return null
  return { species: s.species, level: s.level, slot }
}

/**
 * 물 조우 하나를 굴린다. 레벨은 min~max 균등.
 *
 * `rates`를 밖에서 받는 이유가 전부다 — 파도타기와 낡은 낚싯대는 60/30/5/4/1이고
 * 좋은·대단한 낚싯대는 40/40/15/4/1이다
 */
export function rollWater(
  t: WaterTable, rng: Rng, rates: readonly number[] = WATER_SLOT_RATES,
): WildEncounter | null {
  if (t.rate <= 0) return null
  const slot = pickSlot(rates, rng)
  const s = t.slots[slot]
  if (!s || s.species <= 0) return null
  const level = s.min + Math.floor(rng() * (s.max - s.min + 1))
  return { species: s.species, level, slot }
}

/** 낚싯대가 보는 칸. 이름이 곧 표의 이름이다 */
export function rodTable(table: EncounterTable, rod: Rod): WaterTable {
  return rod === 'old' ? table.oldRod : rod === 'good' ? table.goodRod : table.superRod
}

/** 낚싯대 하나를 던진다. 가중치가 낚싯대마다 다르다 */
export function rollRod(
  table: EncounterTable, rod: Rod, rng: Rng,
): WildEncounter | null {
  return rollWater(rodTable(table, rod), rng, ROD_SLOT_RATES[rod])
}

/**
 * 낚싯줄에 뭔가 걸리는가 (`WildEncounters_TryFishingEncounter`).
 *
 * ⚠️ **걷는 조우의 관문 셋이 여기엔 없다.** 유예 구간도 40% 관문도 안 거치고
 * 출현률 하나로 끝난다 — 낚시는 걸음이 아니라 한 번의 시도이기 때문이다.
 * 관문을 그대로 갖다 붙이면 대단한 낚싯대(출현률 40~75)가 거의 안 걸린다
 */
export function hooksFish(table: EncounterTable, rod: Rod, rng: Rng): boolean {
  const rate = rodTable(table, rod).rate
  return rate > 0 && rng() * 100 < rate
}

/**
 * 걸어서 야생을 만나는 타일 거동 13개.
 *
 * ⚠️ **풀숲 하나만 보고 있었다.** 그래서 동굴(무쇠탄갱·천관산·챔피언로드)과
 * 대습초원에서는 아무리 걸어도 야생이 안 나왔다 — 대습초원 풀은 `TALL_GRASS`가
 * 아니라 `MUD_WITH_GRASS`(0xA6)다.
 *
 * 목록을 눈으로 고르지 않는다. 원작이 `map_tile_behavior.c`에 거동마다 표식을
 * 붙여 두었고, `TILE_BEHAVIOR_FLAG_ENCOUNTER`만 붙은 것이 정확히 이 열셋이다.
 * 자전거 다리 둘이 여기 드는 것이 특히 중요한데, 다리 **아래**가 인카운터
 * 구역이라 다리 위에서도 나온다는 뜻이라 손으로는 못 고를 값이다.
 */
const LAND_BEHAVIORS: ReadonlySet<number> = new Set([
  0x02, // TALL_GRASS
  0x03, // VERY_TALL_GRASS
  0x05, // UNUSED_x05
  0x06, // UNUSED_x06
  0x08, // CAVE_FLOOR
  0x0b, // OLD_CHATEAU_FLOOR
  0x24, // UNUSED_x24
  0x25, // UNUSED_x25
  0x72, // BRIDGE_OVER_CAVE
  0x77, // BIKE_BRIDGE_N_S_OVER_ENCS
  0x7b, // BIKE_BRIDGE_E_W_OVER_ENCS
  0xa6, // MUD_WITH_GRASS — 대습초원
  0xa7, // MUD_DEEP_WITH_GRASS — 대습초원 깊은 곳
])

/**
 * 파도타기로 야생을 만나는 타일 거동 6개 — `FLAG_SURFABLE_ENCOUNTER`.
 *
 * ⚠️ **탈 수 있는 물 열여섯 칸 중 여섯에서만 나온다.** 폭포(0x13)와 물 위
 * 다리 셋(0x73·0x78·0x7C)은 탈 수는 있어도 조우가 없다. `isSurfable`로
 * 뭉뚱그리면 다리 위를 지나가는 것만으로 배틀이 열린다
 */
const SURF_BEHAVIORS: ReadonlySet<number> = new Set([
  0x10, // WATER_RIVER
  0x11, // UNUSED_x11
  0x12, // UNUSED_x12
  0x15, // WATER_SEA
  0x22, // UNUSED_x22
  0x2a, // UNUSED_x2A
])

/** 이 타일을 밟고 걸으면 야생이 나올 수 있는가 */
export function isLandEncounterTile(behavior: number): boolean {
  return LAND_BEHAVIORS.has(behavior)
}

/** 이 물 위에서 파도타기 조우가 일어나는가 */
export function isSurfEncounterTile(behavior: number): boolean {
  return SURF_BEHAVIORS.has(behavior)
}

/**
 * 어느 표를 볼 것인가 (`GetTileEncounterRateAndType`).
 *
 * 원작은 `HasEncounters`로 한 번 거르고 `IsSurfable`로 육상/물을 가른다.
 * 우리는 두 집합이 겹치지 않으니 곧바로 답한다
 */
export function encounterKind(behavior: number): 'land' | 'surf' | null {
  if (LAND_BEHAVIORS.has(behavior)) return 'land'
  if (SURF_BEHAVIORS.has(behavior)) return 'surf'
  return null
}

/** 풀숲인가 — 흔들리는 풀 연출과 발소리가 이걸 본다. 동굴 바닥은 아니다 */
export function isGrassTile(behavior: number): boolean {
  return behavior === Behavior.TALL_GRASS || behavior === Behavior.VERY_TALL_GRASS
}

/**
 * 풀 포기를 세울 칸인가 (`scene/Grass.tsx`).
 *
 * ⚠️ **`isGrassTile`보다 넓다.** 대습초원의 풀은 `TALL_GRASS`가 아니라
 * **진흙 위의 풀**(`MUD_WITH_GRASS` 0xA6 · `MUD_DEEP_WITH_GRASS` 0xA7)이다.
 * 실측으로 실내 행렬에 0xA6가 2,510칸 · 0xA7이 584칸 있고 전부 대습초원이다
 * (행렬 24·240). 그 칸을 빼 두면 대습초원만 **바닥 그림 그대로** 남아서, 3인칭
 * 으로 보면 초록 「W」를 뿌려 놓은 장판이 된다 — 실제로 그렇게 찍혔다.
 *
 * ⚠️ **그렇다고 `isGrassTile`을 넓히면 안 된다.** 원작은 진흙 위에서 풀이
 * 흔들리는 연출을 안 돌린다(`sub_02063964`는 `TALL_GRASS`만 본다) — 대신
 * 사람이 **가라앉고**(`MapObject_SinkIntoTerrain`) 그림자가 숨는다. 서 있는
 * 것과 스치는 소리는 다른 이야기다
 */
export function isTuftTile(behavior: number): boolean {
  return isGrassTile(behavior)
    || behavior === Behavior.MUD_WITH_GRASS
    || behavior === Behavior.MUD_DEEP_WITH_GRASS
}
