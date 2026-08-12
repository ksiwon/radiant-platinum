// 선두 포켓몬이 조우를 바꾼다 (PARITY §1.22 · BUGS.md §1.2·§1.3)
//
// **재는 것 셋:**
//
//   ① 보정의 **차례** — 특성 → 100으로 자르기 → 피리 → 도구. 정수 나눗셈이라
//      순서를 바꾸면 값이 1씩 어긋난다
//   ② 원작 버그 둘을 **안 옮겼는가** — 낚시 2배, 물에서의 자력
//   ③ 절반·2/3처럼 **난수를 먹는 자리**가 실제로 난수를 먹는가
import { expect, it } from 'vitest'
import {
  Flute, ITEM_CLEANSE_TAG, ITEM_PURE_INCENSE, LeadAbility, NO_LEAD, OverworldWeather,
  fishRate, forcedSlot, heldItemRoll, higherLevelSlot, leadHas, leadScaresOff,
  repelBlocks, walkRate, waterLevel, wildGender, wildNature, type FieldMods, type Lead,
} from './encounterLead'
import type { LandSlot } from './encounter'

const lead = (over: Partial<Lead> = {}): Lead => ({
  isEgg: false, ability: 0, level: 20, gender: 'male', pid: 0, heldItem: 0, ...over,
})

const mods = (over: Partial<FieldMods> = {}): FieldMods => ({
  lead: lead(), weather: 0, flute: Flute.NONE, repelLevel: 0, month: 6, day: 1, ...over,
})

/** 0을 계속 내는 난수 — 「절반」 판정이 늘 걸리는 쪽 */
const zero = (): number => 0
/** 0.99를 계속 내는 난수 — 늘 안 걸리는 쪽 */
const high = (): number => 0.99

it('알을 앞세우면 아무 보정도 안 붙는다', () => {
  // 원작은 알에게 `ABILITY_BAD_DREAMS`를 꽂아 두고 그 특성에 필드 효과가 없다
  const egg = lead({ isEgg: true, ability: LeadAbility.ILLUMINATE })
  expect(leadHas(egg, LeadAbility.ILLUMINATE)).toBe(false)
  expect(walkRate(20, mods({ lead: egg }))).toBe(20)
})

it('개미지옥·노가드·발광이 두 배', () => {
  for (const a of [LeadAbility.ARENA_TRAP, LeadAbility.NO_GUARD, LeadAbility.ILLUMINATE]) {
    expect(walkRate(20, mods({ lead: lead({ ability: a }) }))).toBe(40)
  }
})

it('하얀연기·속보·악취가 절반', () => {
  for (const a of [LeadAbility.WHITE_SMOKE, LeadAbility.QUICK_FEET, LeadAbility.STENCH]) {
    expect(walkRate(21, mods({ lead: lead({ ability: a }) })), '정수 나눗셈').toBe(10)
  }
})

it('모래숨기·눈숨기는 날씨를 봐야 먹는다', () => {
  const veil = lead({ ability: LeadAbility.SAND_VEIL })
  expect(walkRate(20, mods({ lead: veil }))).toBe(20)
  expect(walkRate(20, mods({ lead: veil, weather: OverworldWeather.SANDSTORM }))).toBe(10)
  // 눈숨기는 눈 세 가지를 다 본다
  const cloak = lead({ ability: LeadAbility.SNOW_CLOAK })
  expect(walkRate(20, mods({ lead: cloak, weather: OverworldWeather.SANDSTORM }))).toBe(20)
  for (const w of [OverworldWeather.SNOWING, OverworldWeather.HEAVY_SNOW, OverworldWeather.BLIZZARD]) {
    expect(walkRate(20, mods({ lead: cloak, weather: w })), `날씨 ${String(w)}`).toBe(10)
  }
})

it('⚠️ 특성 뒤에서만 100으로 자른다 — 피리는 그 위에 얹힌다', () => {
  const trap = lead({ ability: LeadAbility.ARENA_TRAP })
  // 75 × 2 = 150 → 100으로 잘린 뒤 하얀피리가 +50%
  expect(walkRate(75, mods({ lead: trap, flute: Flute.WHITE }))).toBe(150)
  // 자르는 것이 특성 앞이었다면 75 → 112가 되어 값이 달라진다
  expect(walkRate(75, mods({ lead: trap }))).toBe(100)
})

it('피리 → 도구 차례다', () => {
  // 검은피리 ÷2 뒤에 클리어부적 ×2/3
  expect(walkRate(30, mods({ flute: Flute.BLACK }))).toBe(15)
  expect(walkRate(30, mods({ lead: lead({ heldItem: ITEM_CLEANSE_TAG }) }))).toBe(20)
  expect(walkRate(30, mods({ lead: lead({ heldItem: ITEM_PURE_INCENSE }) }))).toBe(20)
  expect(walkRate(30, mods({ lead: lead({ heldItem: ITEM_CLEANSE_TAG }), flute: Flute.BLACK })))
    .toBe(10)
})

it('⚠️ 끈끈이·흡반이 낚시를 두 배로 만든다 — 원작 버그를 안 옮긴다', () => {
  // 원작은 `newEncRate * 2;`라 결과를 안 담는다 (BUGS.md §1.2). 그 두 특성이
  // 낚시에 붙는 효과는 이것 하나뿐이라, 안 고치면 자리가 통째로 죽는다
  for (const a of [LeadAbility.STICKY_HOLD, LeadAbility.SUCTION_CUPS]) {
    expect(fishRate(40, lead({ ability: a }))).toBe(80)
  }
  expect(fishRate(40, lead())).toBe(40)
  expect(fishRate(60, lead({ ability: LeadAbility.STICKY_HOLD })), '100에서 잘린다').toBe(100)
  // 걷는 쪽의 특성은 낚시에 안 붙는다
  expect(fishRate(40, lead({ ability: LeadAbility.ARENA_TRAP }))).toBe(40)
})

/** `TYPE_*` — 강철 8 · 전기 13 · 불 10 · 풀 12 · 독 3 */
const TYPES: Readonly<Record<number, readonly [number, number]>> = {
  81: [13, 8], // 코일 — 전기/강철
  25: [13, 13], // 피카츄 — 전기
  1: [12, 3], // 이상해씨 — 풀/독
  4: [10, 10], // 파이리 — 불
}
const typeOf = (id: number): readonly [number, number] => TYPES[id] ?? [0, 0]

it('자력이 강철 칸을 집는다 — 절반은 그냥 넘어간다', () => {
  const magnet = lead({ ability: LeadAbility.MAGNET_PULL })
  const species = [1, 4, 81, 1, 4]
  // rng() = 0 → `RandMod(2) === 0`이라 걸린다. 그다음 0으로 첫 후보를 고른다
  expect(forcedSlot(species, magnet, typeOf, zero)).toBe(2)
  // rng() = 0.99 → 절반에서 떨어진다
  expect(forcedSlot(species, magnet, typeOf, high)).toBeNull()
  // 특성이 없으면 아무 일도 없다
  expect(forcedSlot(species, lead(), typeOf, zero)).toBeNull()
})

it('⚠️ 표가 전부 그 타입이거나 하나도 없으면 안 집는다', () => {
  const magnet = lead({ ability: LeadAbility.MAGNET_PULL })
  expect(forcedSlot([1, 4, 1], magnet, typeOf, zero), '하나도 없다').toBeNull()
  expect(forcedSlot([81, 81], magnet, typeOf, zero), '전부다').toBeNull()
})

it('정전기는 자력이 안 걸릴 때만 본다 — 한 마리에 특성 하나라 겹치지 않는다', () => {
  const stat = lead({ ability: LeadAbility.STATIC })
  expect(forcedSlot([1, 25, 4], stat, typeOf, zero)).toBe(1)
})

const land = (rows: [number, number][]): LandSlot[] =>
  rows.map(([species, level]) => ({ species, level }))

it('의욕·의기양양·프레셔가 같은 종의 높은 레벨 칸으로 옮긴다', () => {
  const table = land([[1, 5], [1, 9], [4, 20], [1, 7]])
  for (const a of [LeadAbility.HUSTLE, LeadAbility.VITAL_SPIRIT, LeadAbility.PRESSURE]) {
    const l = lead({ ability: a })
    // rng() = 0.99 → `RandMod(2) !== 0`이라 옮긴다
    expect(higherLevelSlot(table, l, 0, high), `특성 ${String(a)}`).toBe(1)
    // rng() = 0 → 그대로
    expect(higherLevelSlot(table, l, 0, zero)).toBe(0)
  }
  expect(higherLevelSlot(table, lead(), 0, high), '특성이 없으면 그대로').toBe(0)
})

it('물 칸 레벨 — 셋이 있으면 절반은 최대치다', () => {
  const push = lead({ ability: LeadAbility.HUSTLE })
  expect(waterLevel(10, 20, lead(), zero)).toBe(10)
  expect(waterLevel(10, 20, push, high), '난수를 먼저 먹고 특성을 본다').toBe(20)
  expect(waterLevel(10, 20, push, zero)).toBe(10)
  // 뒤집힌 범위도 원작처럼 바로잡는다
  expect(waterLevel(20, 10, lead(), zero)).toBe(10)
})

it('날카로운눈·위협이 레벨 낮은 야생을 절반 쫓는다', () => {
  const eye = lead({ ability: LeadAbility.KEEN_EYE, level: 20 })
  expect(leadScaresOff(eye, 15, zero), '20 − 5 = 15는 걸린다').toBe(true)
  expect(leadScaresOff(eye, 16, zero), '16은 안 걸린다').toBe(false)
  expect(leadScaresOff(eye, 15, high), '절반은 그냥 넘어간다').toBe(false)
  // ⚠️ 5레벨 이하는 아무것도 안 한다
  expect(leadScaresOff(lead({ ability: LeadAbility.INTIMIDATE, level: 5 }), 1, zero)).toBe(false)
  expect(leadScaresOff(lead({ ability: LeadAbility.INTIMIDATE, level: 6 }), 1, zero)).toBe(true)
})

it('⚠️ 리펠은 같은 레벨을 안 막는다', () => {
  expect(repelBlocks(20, 19)).toBe(true)
  expect(repelBlocks(20, 20), '조건이 `>`다').toBe(false)
  expect(repelBlocks(0, 1), '안 도는 중').toBe(false)
})

it('복안이 도구 확률을 올린다', () => {
  const eyed = lead({ ability: LeadAbility.COMPOUND_EYES })
  // 없음 45 / 흔한 것 50 / 귀한 것 5
  expect(heldItemRoll(7, 9, lead(), () => 0.44)).toBe(0)
  expect(heldItemRoll(7, 9, lead(), () => 0.5)).toBe(7)
  expect(heldItemRoll(7, 9, lead(), () => 0.96)).toBe(9)
  // 복안: 20 / 60 / 20
  expect(heldItemRoll(7, 9, eyed, () => 0.19)).toBe(0)
  expect(heldItemRoll(7, 9, eyed, () => 0.5)).toBe(7)
  expect(heldItemRoll(7, 9, eyed, () => 0.85)).toBe(9)
  // 두 칸이 같으면 100%
  expect(heldItemRoll(7, 7, lead(), () => 0.99)).toBe(7)
  expect(heldItemRoll(0, 0, eyed, () => 0)).toBe(0)
})

it('싱크로가 성격을 절반 물려준다', () => {
  const sync = lead({ ability: LeadAbility.SYNCHRONIZE, pid: 27 })
  expect(wildNature(sync, zero)).toBe(2)
  expect(wildNature(sync, high)).toBeNull()
  expect(wildNature(lead({ pid: 27 }), zero)).toBeNull()
})

it('⚠️ 헤롱헤롱바디는 절반이 아니라 2/3다', () => {
  const charm = lead({ ability: LeadAbility.CUTE_CHARM, gender: 'female' })
  // `LCRNG_RandMod(3) > 0`이라 셋 중 둘이 걸린다
  expect(wildGender(charm, () => 0), '0/3은 안 걸린다').toBeNull()
  expect(wildGender(charm, () => 0.4), '1/3').toBe('male')
  expect(wildGender(charm, () => 0.8), '2/3').toBe('male')
  expect(wildGender(lead({ ability: LeadAbility.CUTE_CHARM, gender: 'male' }), () => 0.4))
    .toBe('female')
  // 무성은 뒤집을 것이 없다
  expect(wildGender(lead({ ability: LeadAbility.CUTE_CHARM, gender: 'genderless' }), () => 0.4))
    .toBeNull()
})

it('선두가 없으면 아무것도 안 한다', () => {
  expect(walkRate(30, mods({ lead: NO_LEAD }))).toBe(30)
  expect(fishRate(30, NO_LEAD)).toBe(30)
  expect(forcedSlot([1, 81], NO_LEAD, typeOf, zero)).toBeNull()
  expect(leadScaresOff(NO_LEAD, 1, zero)).toBe(false)
})
