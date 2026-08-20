// 모험노트 한 쪽을 글로 (`journal_printer.c`)
//
// 규칙은 `engine/world/journal`이, 그린 모양은 `JournalScreen`이 맡는다.
// 여기는 그 사이 — **적힌 값을 원작 문장으로 바꾸는 일**만 한다.
//
// ⚠️ **한 글자도 우리가 짓지 않는다.** 문장 103개가 전부 롬의 `journal_entries`
// 뱅크에서 나오고, 빈칸에 넣는 것도 지역명·도구명·종족명·체육관명·시간대 표다.
import { monthText } from '../../engine/pokemon/memo'
import {
  LocationEvent, MonResult, eventLocation, eventTrainer, eventType,
  type JournalEntry,
} from '../../engine/world/journal'
import { CAVES_USING_DEPARTED, JOURNAL_BUILDINGS } from '../../engine/world/journal'
import { fillMenuText } from '../../data/uiText'

/**
 * `journal_entries` 뱅크의 줄 번호.
 *
 * 이름은 디컴프 `res/text/journal_entries.json`의 `id` 그대로다 —
 * 번호로만 적어 두면 뱅크가 바뀌었을 때 무엇이 어긋났는지 알 길이 없다
 */
export const J = {
  startedFrom: 0, date: 1, sunday: 2,
  restedAtHome: 9, leftResearchLab: 10, usedPcBox: 11,
  shopped: 12, lotsOfShopping: 13, soldALittle: 14, soldALot: 15, business: 16,
  gymTooTough: 17, beatGymLeader: 18, beatEliteFour: 19, beatChampion: 20,
  arrived: 21, gotThrough: 22, departed: 23, exited: 24,
  battleTower: 25, battleFactory: 26, battleCastle: 27, battleHall: 28, battleArcade: 29,
  gameCorner: 30, safari: 31, dugUnderground: 32, builtSecretBase: 33,
  itemObtained: 34,
  usedCut: 35, flewTo: 36, usedSurf: 37, usedStrength: 38, usedFlash: 39,
  usedRockSmash: 40, usedWaterfall: 41, usedRockClimb: 42, usedDefog: 43, usedDig: 44,
  lured: 45, warpedTo: 46, usedSoftboiled: 47, usedMilkDrink: 48,
  caught: 49, wasCaught: 50, caughtMale: 51, caughtFemale: 52,
  wasDefeated: 53, defeated: 54, defeatedMale: 55, defeatedFemale: 56,
  battledTrainer: 57, beatTrainer: 58, beatTrainer2: 59, metTrainer: 60,
  rivalName: 61,
  placedInContest: 87, madePoffins: 88,
} as const

/** 곁값 없는 일 → 문장 번호 */
const PLAIN: ReadonlyMap<number, number> = new Map([
  [LocationEvent.RESTED_AT_HOME, J.restedAtHome],
  [LocationEvent.LEFT_RESEARCH_LAB, J.leftResearchLab],
  [LocationEvent.USED_PC_BOX, J.usedPcBox],
  [LocationEvent.SHOPPED_AT_MART, J.shopped],
  [LocationEvent.LOTS_OF_SHOPPING, J.lotsOfShopping],
  [LocationEvent.SOLD_A_LITTLE, J.soldALittle],
  [LocationEvent.SOLD_A_LOT, J.soldALot],
  [LocationEvent.BUSINESS_AT_MART, J.business],
  [LocationEvent.GAME_CORNER, J.gameCorner],
  [LocationEvent.SAFARI_GAME, J.safari],
  [LocationEvent.DUG_UNDERGROUND, J.dugUnderground],
  [LocationEvent.BUILT_SECRET_BASE, J.builtSecretBase],
  [LocationEvent.BATTLE_TOWER, J.battleTower],
  [LocationEvent.BATTLE_FACTORY, J.battleFactory],
  [LocationEvent.BATTLE_CASTLE, J.battleCastle],
  [LocationEvent.BATTLE_HALL, J.battleHall],
  [LocationEvent.BATTLE_ARCADE, J.battleArcade],
  [LocationEvent.LURED_POKEMON, J.lured],
  [LocationEvent.USED_SOFTBOILED, J.usedSoftboiled],
  [LocationEvent.USED_MILK_DRINK, J.usedMilkDrink],
])

/** 맵 번호를 곁값으로 갖는 일 → 문장 번호. 자리 이름은 그 맵의 **지역명**이다 */
const AT_MAP: ReadonlyMap<number, number> = new Map([
  [LocationEvent.ARRIVED_IN_LOCATION, J.arrived],
  [LocationEvent.USED_CUT, J.usedCut],
  [LocationEvent.FLEW_TO_LOCATION, J.flewTo],
  [LocationEvent.USED_SURF, J.usedSurf],
  [LocationEvent.USED_STRENGTH, J.usedStrength],
  [LocationEvent.USED_FLASH, J.usedFlash],
  [LocationEvent.USED_ROCK_SMASH, J.usedRockSmash],
  [LocationEvent.USED_WATERFALL, J.usedWaterfall],
  [LocationEvent.USED_ROCK_CLIMB, J.usedRockClimb],
  [LocationEvent.USED_DEFOG, J.usedDefog],
  [LocationEvent.USED_DIG, J.usedDig],
  [LocationEvent.WARPED_TO_LOCATION, J.warpedTo],
])

export interface JournalNames {
  /** `journal_entries` 뱅크 103줄 */
  entries: readonly string[]
  /** `gym_names` 여덟 */
  gyms: readonly string[]
  /** `times_of_day` 다섯 */
  times: readonly string[]
  /** 달 이름 열둘 (`month_names`) */
  months: readonly string[]
  /** 지역명 표 (`names/locations.*.json`) */
  locations: readonly string[]
  items: readonly string[]
  species: readonly string[]
  /** 트레이너 이름 928 */
  trainers: readonly string[]
  /** 트레이너 번호 → 분류 번호. 라이벌만 이름을 따로 쓴다 */
  trainerClass: (id: number) => number
  rivalName: string
  /** 맵 번호 → 지역명 번호 (`MapHeader_GetMapLabelTextID`) */
  labelOf: (mapId: number) => number
}

/** `TRAINER_CLASS_RIVAL` */
export const TRAINER_CLASS_RIVAL = 63

const at = (list: readonly string[], i: number): string => list[i] ?? ''

/** 그 맵의 지역명 */
function placeOf(names: JournalNames, mapId: number): string {
  return at(names.locations, names.labelOf(mapId))
}

/** 트레이너 이름. 라이벌은 주인공이 지은 이름이다 */
function trainerNameOf(names: JournalNames, id: number): string {
  return names.trainerClass(id) === TRAINER_CLASS_RIVAL
    ? names.rivalName
    : at(names.trainers, id)
}

/** 자리 일 하나를 한 줄로. 그릴 것이 없으면 null */
export function locationEventLine(packed: number, names: JournalNames): string | null {
  const type = eventType(packed)
  if (type === LocationEvent.NONE) return null

  const plain = PLAIN.get(type)
  if (plain !== undefined) return at(names.entries, plain)

  const atMap = AT_MAP.get(type)
  if (atMap !== undefined) {
    return fillMenuText(at(names.entries, atMap), [placeOf(names, eventLocation(packed))])
  }

  switch (type) {
    case LocationEvent.GYM_WAS_TOO_TOUGH:
      return fillMenuText(at(names.entries, J.gymTooTough), [at(names.gyms, eventLocation(packed))])

    case LocationEvent.BEAT_GYM_LEADER:
      return fillMenuText(at(names.entries, J.beatGymLeader), [
        at(names.gyms, eventLocation(packed)), trainerNameOf(names, eventTrainer(packed)),
      ])

    case LocationEvent.BEAT_ELITE_FOUR_MEMBER:
      return fillMenuText(at(names.entries, J.beatEliteFour),
        [trainerNameOf(names, eventTrainer(packed))])

    case LocationEvent.BEAT_CHAMPION:
      return fillMenuText(at(names.entries, J.beatChampion),
        [trainerNameOf(names, eventTrainer(packed))])

    case LocationEvent.ITEM_WAS_OBTAINED:
      return fillMenuText(at(names.entries, J.itemObtained),
        [at(names.items, eventLocation(packed))])

    /**
     * ⚠️ **여기 셋만 곁값이 맵이 아니라 지역명 번호다.** 굴과 건물은 안쪽 방이
     * 여럿이라 방 번호로는 「나왔다」를 한 줄로 못 묶는다 — 원작이 저장할 때
     * 이미 지역명으로 바꿔 둔다
     */
    case LocationEvent.LEFT_CAVE: {
      const label = eventLocation(packed)
      const which = CAVES_USING_DEPARTED.has(label) ? J.departed : J.gotThrough
      return fillMenuText(at(names.entries, which), [at(names.locations, label)])
    }

    case LocationEvent.LEFT_BUILDING: {
      const label = eventLocation(packed)
      const which = JOURNAL_BUILDINGS.get(label) === true ? J.exited : J.departed
      return fillMenuText(at(names.entries, which), [at(names.locations, label)])
    }

    default:
      return null
  }
}

/** 그날의 포켓몬 한 줄 (`JournalPrinter_PrintPokemonEvent`) */
export function monLine(entry: JournalEntry, names: JournalNames): string | null {
  const mon = entry.mon
  if (mon.result === MonResult.NONE) return null
  const caught = mon.result === MonResult.CAUGHT
  let which: number
  if (mon.variant === 0) which = caught ? J.caught : J.wasDefeated
  else if (mon.variant === 1) which = caught ? J.wasCaught : J.defeated
  else if (mon.gender === 0) which = caught ? J.caughtMale : J.defeatedMale
  else if (mon.gender === 1) which = caught ? J.caughtFemale : J.defeatedFemale
  // 무성은 성별 문장이 없어서 첫 갈래로 돌아간다 — 원작의 `else`가 그렇다
  else which = caught ? J.caught : J.wasDefeated
  return fillMenuText(at(names.entries, which),
    [at(names.species, mon.species), at(names.times, mon.timeOfDay)])
}

/**
 * 보통 트레이너 한 줄 (`JournalPrinter_PrintTrainerEvent`).
 *
 * ⚠️ **글자 수로 문장을 고른다.** 지역명 + 트레이너 이름이 길수록 짧은 문장을
 * 쓴다 — 원작이 한 줄에 안 들어가는 것을 그렇게 막았다. 14 · 16 · 19가 경계다
 */
export function trainerLine(entry: JournalEntry, names: JournalNames): string | null {
  const t = entry.trainer
  if (t.standard === 0) return null
  const place = placeOf(names, t.mapId)
  const who = trainerNameOf(names, t.trainerId)
  const length = place.length + who.length
  const which = length <= 14 ? J.battledTrainer
    : length <= 16 ? J.beatTrainer
      : length <= 19 ? J.beatTrainer2
        : J.metTrainer
  return fillMenuText(at(names.entries, which), [place, who])
}

/** 통신 칸 한 줄. 지금 날 수 있는 것은 콘테스트 등수와 포핀뿐이다 */
function onlineLine(
  ev: { type: number; result: number }, names: JournalNames,
): string | null {
  if (ev.type === 0) return null
  if (ev.type === 13) {
    return fillMenuText(at(names.entries, J.placedInContest), [String(ev.result)])
  }
  if (ev.type === 14) return at(names.entries, J.madePoffins)
  return null
}

export interface JournalPage {
  /** 「8월 13일」 */
  date: string
  /** 「목요일」 */
  weekday: string
  /** 「떡잎마을에서 시작!」 */
  from: string
  /** 자리 일 · 포켓몬 · 트레이너 · 통신을 원작 차례대로 이어 붙인 것 */
  lines: string[]
}

/** 한 쪽. 아직 안 쓴 쪽이면 null */
export function journalPage(entry: JournalEntry, names: JournalNames): JournalPage | null {
  const t = entry.title
  if (t.year === 0 && t.month === 0 && t.day === 0) return null

  const date = fillMenuText(at(names.entries, J.date),
    [monthText(t.month, { location: [], special: [], month: names.months }), String(t.day)])

  const lines: string[] = []
  for (const packed of entry.locationEvents) {
    // ⚠️ **빈 칸을 만나면 멈춘다.** 원작 인쇄기가 `return`한다 — 앞이 비고
    // 뒤가 찬 상태는 저장 규칙상 생기지 않지만, 생겨도 원작과 같이 군다
    if (eventType(packed) === LocationEvent.NONE) break
    const line = locationEventLine(packed, names)
    if (line !== null) lines.push(line)
  }
  const mon = monLine(entry, names)
  if (mon !== null) lines.push(mon)
  const trainer = trainerLine(entry, names)
  if (trainer !== null) lines.push(trainer)
  for (const ev of entry.online) {
    if (ev.type === 0) break
    const line = onlineLine(ev, names)
    if (line !== null) lines.push(line)
  }

  return {
    date,
    weekday: at(names.entries, J.sunday + t.week),
    from: fillMenuText(at(names.entries, J.startedFrom), [placeOf(names, t.mapId)]),
    lines,
  }
}
