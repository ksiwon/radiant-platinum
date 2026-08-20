// 모험노트 (PARITY §7.4) — `src/journal.c`
//
// 하루가 한 쪽이고 열 쪽이 남는다. 쪽 하나에 들어가는 것은 정해져 있다:
//
//   · 머리글  날짜 · 요일 · 그날 아침에 서 있던 자리
//   · 자리 일 넷 (`locationEvents`)  들른 곳 · 이긴 관장 · 쓴 비전기술 …
//   · 포켓몬 한 줄 (`mon`)  **그날 마지막으로** 잡거나 쓰러뜨린 한 마리
//   · 트레이너 한 줄 (`trainer`)  그날 마지막으로 이긴 보통 트레이너
//   · 통신 일 둘 (`onlineEvents`)
//
// ⚠️ **자리 일만 넷이 쌓이고 나머지는 덮어쓴다.** 포켓몬 칸이 하나뿐이라
// 하루에 백 마리를 잡아도 마지막 한 마리만 남는다. 원작이 그렇다.
//
// ⚠️ **자리 일은 원작의 u32 묶음 그대로 든다.** 겹치는 일을 걸러내는 규칙이
// `locationEvents[i - 1] >> 16`처럼 **묶인 값을 직접 보므로**, 풀어서 담으면
// 그 규칙을 옮길 수가 없다 (`LOCATION_EVENT` 매크로)

/** `journal_location_events.txt`의 줄 차례가 곧 값이다 */
export const LocationEvent = {
  NONE: 0,
  RESTED_AT_HOME: 1,
  LEFT_RESEARCH_LAB: 2,
  USED_PC_BOX: 3,
  SHOPPED_AT_MART: 4,
  LOTS_OF_SHOPPING: 5,
  SOLD_A_LITTLE: 6,
  SOLD_A_LOT: 7,
  BUSINESS_AT_MART: 8,
  GYM_WAS_TOO_TOUGH: 9,
  BEAT_GYM_LEADER: 10,
  BEAT_ELITE_FOUR_MEMBER: 11,
  BEAT_CHAMPION: 12,
  ARRIVED_IN_LOCATION: 13,
  LEFT_CAVE: 14,
  LEFT_BUILDING: 15,
  GAME_CORNER: 16,
  SAFARI_GAME: 17,
  ITEM_WAS_OBTAINED: 18,
  USED_CUT: 19,
  FLEW_TO_LOCATION: 20,
  USED_SURF: 21,
  USED_STRENGTH: 22,
  USED_DEFOG: 23,
  USED_ROCK_SMASH: 24,
  USED_WATERFALL: 25,
  USED_ROCK_CLIMB: 26,
  USED_FLASH: 27,
  WARPED_TO_LOCATION: 28,
  USED_DIG: 29,
  LURED_POKEMON: 30,
  UNUSED: 31,
  USED_MILK_DRINK: 32,
  USED_SOFTBOILED: 33,
  DUG_UNDERGROUND: 34,
  BUILT_SECRET_BASE: 35,
  BATTLE_TOWER: 36,
  BATTLE_FACTORY: 37,
  BATTLE_CASTLE: 38,
  BATTLE_HALL: 39,
  BATTLE_ARCADE: 40,
} as const
export type LocationEventId = (typeof LocationEvent)[keyof typeof LocationEvent]

/** `journal_online_events.txt`. 대부분 통신이라 §9지만 콘테스트 순위는 혼자서도 난다 */
const OnlineEvent = {
  NONE: 0,
  PLACED_IN_CONTEST: 13,
  MADE_POFFINS: 14,
} as const

/** `POKEMON_CAUGHT` · `POKEMON_DEFEATED`. 0은 그날 아무것도 없었다는 뜻이다 */
export const MonResult = { NONE: 0, CAUGHT: 1, DEFEATED: 2 } as const

export const MAX_JOURNAL_ENTRIES = 10
export const MAX_LOCATION_EVENTS = 4
export const MAX_ONLINE_EVENTS = 2

/** 스크립트가 여는 노트 일 다섯 갈래. `ScrCmd_CreateJournalEvent`가 받는 값 */
export const SCRIPT_EVENT_TYPES: readonly number[] = [
  LocationEvent.GAME_CORNER, LocationEvent.SAFARI_GAME, LocationEvent.ITEM_WAS_OBTAINED,
  LocationEvent.USED_CUT, LocationEvent.USED_SURF, LocationEvent.USED_STRENGTH,
  LocationEvent.USED_DEFOG, LocationEvent.USED_ROCK_SMASH, LocationEvent.USED_WATERFALL,
  LocationEvent.USED_ROCK_CLIMB,
  LocationEvent.BATTLE_TOWER, LocationEvent.BATTLE_FACTORY, LocationEvent.BATTLE_CASTLE,
  LocationEvent.BATTLE_HALL, LocationEvent.BATTLE_ARCADE,
]

interface JournalDate {
  /** 2000을 뺀 값 0~99 (원작 `RTCDate.year`) */
  year: number
  /** 1~12 */
  month: number
  /** 1~31 */
  day: number
  /** 요일 0~6. 0이 일요일이다 */
  week: number
}

interface JournalTitle extends JournalDate {
  /** 그 쪽이 열릴 때 서 있던 맵 */
  mapId: number
}

interface JournalMon {
  /** `MonResult` */
  result: number
  /**
   * 같은 일을 세 가지 말로 적는다 (`JournalEntry_CreateEventMonCaught`).
   *
   * ⚠️ **플레이 시간의 분에서 나온다** — `분 / 10`이 0·2·4면 0, 1·3이면 1,
   * 5면 2다. 무작위가 아니라 시계라서 같은 순간에 다시 잡으면 같은 말이 뜬다
   */
  variant: number
  /** `TimeOfDay` 0~4 */
  timeOfDay: number
  /** 0 수컷 · 1 암컷 · 2 무성 (`GENDER_*`) */
  gender: number
  species: number
}

interface JournalTrainer {
  /** 보통 트레이너를 이긴 적이 있는가. 0이면 이 줄을 안 그린다 */
  standard: number
  trainerId: number
  mapId: number
}

interface JournalOnline {
  /** `OnlineEvent` */
  type: number
  /** 콘테스트 등수 같은 곁값 */
  result: number
}

export interface JournalEntry {
  title: JournalTitle
  /** `LOCATION_EVENT` 묶음 넷. 0이 빈 칸이다 */
  locationEvents: number[]
  mon: JournalMon
  trainer: JournalTrainer
  online: JournalOnline[]
}

/** `LOCATION_EVENT(locationID, trainerID, eventType)` */
export function packLocationEvent(locationId: number, trainerId: number, eventType: number): number {
  // ⚠️ `<<16`은 32비트 부호를 넘길 수 있다. 자바스크립트에서는 `>>> 0`으로 눌러야
  // 그 뒤의 `>>> 16`이 음수를 안 낸다
  return (((locationId & 0xffff) << 16) | ((trainerId & 0x3ff) << 6) | (eventType & 0x3f)) >>> 0
}

export const eventType = (packed: number): number => packed & 0x3f
export const eventTrainer = (packed: number): number => (packed >>> 6) & 0x3ff
/** 자리 번호이자 도구 번호다 — 원작이 같은 칸을 둘로 쓴다 */
export const eventLocation = (packed: number): number => (packed >>> 16) & 0xffff

export function emptyEntry(): JournalEntry {
  return {
    title: { year: 0, month: 0, day: 0, week: 0, mapId: 0 },
    locationEvents: [0, 0, 0, 0],
    mon: { result: MonResult.NONE, variant: 0, timeOfDay: 0, gender: 0, species: 0 },
    trainer: { standard: 0, trainerId: 0, mapId: 0 },
    online: [{ type: 0, result: 0 }, { type: 0, result: 0 }],
  }
}

export function newJournal(): JournalEntry[] {
  return Array.from({ length: MAX_JOURNAL_ENTRIES }, emptyEntry)
}

export function isEmptyEntry(entry: JournalEntry): boolean {
  return entry.title.year === 0 && entry.title.month === 0 && entry.title.day === 0
}

/** 오늘 날짜를 원작 모양으로 */
export function journalDate(at: Date): JournalDate {
  return {
    year: at.getFullYear() - 2000, month: at.getMonth() + 1, day: at.getDate(), week: at.getDay(),
  }
}

const sameDay = (a: JournalDate, b: JournalDate): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day && a.week === b.week

/**
 * 오늘 쪽을 꺼낸다 (`Journal_GetSavedPage`).
 *
 * 첫 쪽에 적힌 날이 오늘이 아니면 **열 쪽을 한 칸씩 밀고** 첫 쪽을 비운다.
 * 아직 노트를 안 받았으면 아무것도 안 한다 — 그동안의 일은 안 적힌다.
 *
 * ⚠️ `title.month`가 0인 쪽은 안 민다. 새 노트의 첫날에 두 번 부르면
 * 빈 쪽 열 개가 되어 버린다
 */
export function rollPage(
  journal: readonly JournalEntry[], today: JournalDate, acquired: boolean,
): { journal: JournalEntry[]; rolled: boolean } {
  const out = journal.map((e) => e)
  if (!acquired) return { journal: out, rolled: false }
  const first = out[0]
  if (!first || first.title.month === 0 || sameDay(first.title, today)) {
    return { journal: out, rolled: false }
  }
  for (let i = MAX_JOURNAL_ENTRIES - 1; i >= 1; i--) out[i] = out[i - 1]!
  out[0] = emptyEntry()
  return { journal: out, rolled: true }
}

/** 그 날짜의 일련번호. `daily.dayNumber`와 달리 노트에 적힌 조각으로 센다 */
function dayNumberOf(d: JournalDate): number {
  return Math.floor(Date.UTC(2000 + d.year, d.month - 1, d.day) / 86_400_000)
}

/**
 * 이어하기에서 노트를 **저절로 펼칠 것인가** (`Journal_CheckOpenOnContinue`).
 *
 * 이틀 넘게 안 켰으면 펼친다. ⚠️ 12/31과 1/1이 맞물릴 때만 해가 두 번 넘어갔는지를
 * 따로 본다 — 원작이 날 수 차이로는 그 한 칸을 못 세어서 둔 갈래다
 */
export function checkOpenOnContinue(
  journal: readonly JournalEntry[], today: JournalDate, acquired: boolean,
): boolean {
  if (!acquired) return false
  const first = journal[0]
  if (!first) return false
  const then = first.title
  const diff = dayNumberOf(today) - dayNumberOf(then)
  if ((today.month === 12 && today.day === 31 && then.month === 1 && then.day === 1)
    || (today.month === 1 && today.day === 1 && then.month === 12 && then.day === 31)) {
    const years = today.year - then.year
    return years >= 2 || years <= -2
  }
  if (diff <= -2 || diff >= 2) return true
  return today.year !== then.year
}

/** 머리글을 적는다. **같은 날이면 안 덮어쓴다** — 자리가 그날 처음 것으로 남는다 */
export function saveTitle(entry: JournalEntry, title: JournalTitle): JournalEntry {
  if (sameDay(entry.title, title)) return entry
  return { ...entry, title: { ...title } }
}

/** 빈 칸을 찾는다. 넷이 다 찼으면 **한 칸씩 당기고** 마지막을 비운다 */
function pushLocationEvent(events: readonly number[], packed: number): number[] {
  const out = [...events]
  const free = out.findIndex((e) => eventType(e) === LocationEvent.NONE)
  if (free >= 0) {
    out[free] = packed
    return out
  }
  for (let i = 0; i < MAX_LOCATION_EVENTS - 1; i++) out[i] = out[i + 1]!
  out[MAX_LOCATION_EVENTS - 1] = packed
  return out
}

/** 맨 뒤에 적힌 일. 없으면 -1 */
function lastFilled(events: readonly number[]): number {
  const free = events.findIndex((e) => e === 0)
  return free < 0 ? MAX_LOCATION_EVENTS - 1 : free - 1
}

/**
 * 자리 일 하나를 적는다.
 *
 * 갈래마다 겹침을 거르는 방식이 다르다 — 원작의 일곱 함수를 그대로 옮긴다:
 *
 *   · 곁값 없는 일    바로 앞이 같은 갈래면 안 적는다
 *   · 자리/도구/기술  바로 앞이 같은 갈래 **+ 같은 곁값**이면 안 적는다
 *   · 체육관          같은 체육관의 「강적뿐이다」를 **지우고** 적는다
 *   · 사천왕          앞선 사천왕 줄을 **지우고** 적는다 (넷을 다 이겨도 한 줄)
 *   · 챔피언          거르지 않는다
 */
export function saveLocationEvent(
  entry: JournalEntry, ev: { type: number; locationId?: number; trainerId?: number; item?: number },
): JournalEntry {
  const events = entry.locationEvents
  const type = ev.type
  const at = lastFilled(events)
  const prev = at >= 0 ? events[at]! : 0

  const noArg = (): JournalEntry | null => {
    if (at >= 0 && eventType(prev) === type) return entry
    return null
  }
  const sameArg = (arg: number): JournalEntry | null => {
    if (at >= 0 && eventType(prev) === type && (prev >>> 16) === arg) return entry
    return null
  }

  switch (type) {
    case LocationEvent.RESTED_AT_HOME:
    case LocationEvent.LEFT_RESEARCH_LAB:
    case LocationEvent.USED_PC_BOX:
    case LocationEvent.SHOPPED_AT_MART:
    case LocationEvent.LOTS_OF_SHOPPING:
    case LocationEvent.SOLD_A_LITTLE:
    case LocationEvent.SOLD_A_LOT:
    case LocationEvent.BUSINESS_AT_MART:
    case LocationEvent.GAME_CORNER:
    case LocationEvent.SAFARI_GAME:
    case LocationEvent.DUG_UNDERGROUND:
    case LocationEvent.BUILT_SECRET_BASE:
    case LocationEvent.BATTLE_TOWER:
    case LocationEvent.BATTLE_FACTORY:
    case LocationEvent.BATTLE_CASTLE:
    case LocationEvent.BATTLE_HALL:
    case LocationEvent.BATTLE_ARCADE: {
      const same = noArg()
      if (same) return same
      return { ...entry, locationEvents: pushLocationEvent(events, packLocationEvent(0, 0, type)) }
    }

    case LocationEvent.GYM_WAS_TOO_TOUGH:
    case LocationEvent.BEAT_GYM_LEADER: {
      const kept = dropWhere(events, (e) =>
        eventType(e) === LocationEvent.GYM_WAS_TOO_TOUGH && eventLocation(e) === (ev.locationId ?? 0))
      return {
        ...entry,
        locationEvents: pushLocationEvent(
          kept, packLocationEvent(ev.locationId ?? 0, ev.trainerId ?? 0, type),
        ),
      }
    }

    case LocationEvent.BEAT_ELITE_FOUR_MEMBER: {
      const kept = dropWhere(events, (e) => eventType(e) === LocationEvent.BEAT_ELITE_FOUR_MEMBER)
      return {
        ...entry,
        locationEvents: pushLocationEvent(
          kept, packLocationEvent(ev.locationId ?? 0, ev.trainerId ?? 0, type),
        ),
      }
    }

    case LocationEvent.BEAT_CHAMPION:
      return {
        ...entry,
        locationEvents: pushLocationEvent(
          events, packLocationEvent(ev.locationId ?? 0, ev.trainerId ?? 0, type),
        ),
      }

    case LocationEvent.ITEM_WAS_OBTAINED: {
      const item = ev.item ?? 0
      const same = sameArg(item)
      if (same) return same
      return { ...entry, locationEvents: pushLocationEvent(events, packLocationEvent(item, 0, type)) }
    }

    default: {
      // 자리 셋(도착·굴에서 나옴·건물에서 나옴)과 기술 열넷이 같은 규칙이다
      if (!TRAVEL_OR_MOVE.has(type)) return entry
      const where = ev.locationId ?? 0
      const same = sameArg(where)
      if (same) return same
      return { ...entry, locationEvents: pushLocationEvent(events, packLocationEvent(where, 0, type)) }
    }
  }
}

/** 지운 자리를 메우며 앞으로 당긴다 (`JournalEntry_SaveLocationEventGym`의 안쪽 고리) */
function dropWhere(events: readonly number[], match: (e: number) => boolean): number[] {
  const out = [...events]
  for (let i = 0; i < MAX_LOCATION_EVENTS; i++) {
    if (!match(out[i]!)) continue
    for (let j = i; j < MAX_LOCATION_EVENTS - 1; j++) {
      out[j] = out[j + 1]!
      out[j + 1] = 0
    }
    break
  }
  return out
}

const TRAVEL_OR_MOVE = new Set<number>([
  LocationEvent.ARRIVED_IN_LOCATION, LocationEvent.LEFT_CAVE, LocationEvent.LEFT_BUILDING,
  LocationEvent.USED_CUT, LocationEvent.FLEW_TO_LOCATION, LocationEvent.USED_SURF,
  LocationEvent.USED_STRENGTH, LocationEvent.USED_FLASH, LocationEvent.USED_DEFOG,
  LocationEvent.USED_ROCK_SMASH, LocationEvent.USED_WATERFALL, LocationEvent.USED_ROCK_CLIMB,
  LocationEvent.USED_DIG, LocationEvent.LURED_POKEMON, LocationEvent.WARPED_TO_LOCATION,
  LocationEvent.USED_SOFTBOILED, LocationEvent.USED_MILK_DRINK,
])

/**
 * 그날의 포켓몬 한 줄 (`JournalEntry_SaveMon`).
 *
 * ⚠️ **덮어쓴다.** 하루에 여러 마리를 잡아도 남는 것은 마지막 한 마리다
 */
export function saveMon(entry: JournalEntry, mon: JournalMon): JournalEntry {
  return { ...entry, mon: { ...mon } }
}

export function saveTrainer(entry: JournalEntry, trainer: JournalTrainer): JournalEntry {
  return { ...entry, trainer: { ...trainer } }
}

/** 통신 일. 곁값 없는 것은 바로 앞과 같으면 안 적는다 (`SaveOnlineEventMisc`) */
export function saveOnline(entry: JournalEntry, ev: JournalOnline): JournalEntry {
  const online = entry.online.map((e) => ({ ...e }))
  const free = online.findIndex((e) => e.type === OnlineEvent.NONE)
  if (free < 0) {
    online[0] = online[1]!
    online[1] = { type: ev.type, result: ev.result }
  } else {
    online[free] = { type: ev.type, result: ev.result }
  }
  return { ...entry, online }
}

/** 「분 / 10」이 정하는 말투 (`JournalEntry_CreateEventMonCaught`) */
export function monVariant(playtimeMinutes: number): number {
  const v = Math.floor((playtimeMinutes % 60) / 10)
  if (v === 0 || v === 2 || v === 4) return 0
  if (v === 1 || v === 3) return 1
  return 2
}

/** 체육관 여덟 (`sGymsInfo`) — 관장 번호 · 체육관 맵 · 뱃지 비트 */
interface GymInfo { trainerId: number; mapId: number; badge: number }

/**
 * ⚠️ **연고체육관은 입구 방이다.** 나머지 일곱은 체육관 맵 자체인데 연고만
 * `HEARTHOME_CITY_GYM_ENTRANCE_ROOM`이 적혀 있다 — 안쪽 방으로 들어가는 것은
 * 이미 들어온 뒤라 「강적뿐이다」를 적을 자리가 아니기 때문이다
 */
export const GYMS: readonly GymInfo[] = [
  { trainerId: 246, mapId: 47, badge: 0 },  // 무쇠 강석
  { trainerId: 315, mapId: 67, badge: 1 },  // 영원 자무
  { trainerId: 316, mapId: 122, badge: 3 }, // 들판 맥시무
  { trainerId: 317, mapId: 133, badge: 2 }, // 장막 스모모
  { trainerId: 318, mapId: 88, badge: 4 },  // 연고 멜리사
  { trainerId: 319, mapId: 167, badge: 6 }, // 선단 무청
  { trainerId: 250, mapId: 35, badge: 5 },  // 운하 강석철
  { trainerId: 320, mapId: 154, badge: 7 }, // 물가 대성
]

/**
 * 사천왕 여덟 번호(재대결 포함)와 챔피언 둘 (`JournalEntry_TrainerType`).
 *
 * ⚠️ 재대결 번호가 866~870으로 **뚝 떨어져 있다** — 리그를 깬 뒤에 붙은
 * 표라 본판 번호 옆이 아니다
 */
export const ELITE_FOUR: readonly number[] = [261, 866, 262, 867, 263, 868, 264, 869]
export const CHAMPIONS: readonly number[] = [267, 870]

export const TrainerKind = { GYM: 0, ELITE_FOUR: 1, CHAMPION: 2, STANDARD: 3 } as const

/** 그 트레이너가 어느 갈래인가. 체육관이면 몇 번째인지도 준다 */
export function trainerKind(trainerId: number): { kind: number; gym: number } {
  const gym = GYMS.findIndex((g) => g.trainerId === trainerId)
  if (gym >= 0) return { kind: TrainerKind.GYM, gym }
  if (ELITE_FOUR.includes(trainerId)) return { kind: TrainerKind.ELITE_FOUR, gym: -1 }
  if (CHAMPIONS.includes(trainerId)) return { kind: TrainerKind.CHAMPION, gym: -1 }
  return { kind: TrainerKind.STANDARD, gym: -1 }
}

/** 이 맵이 아직 뱃지 없는 체육관인가. 아니면 -1 (`JournalEntry_GetGymTooTough`) */
export function gymTooTough(mapId: number, badges: number): number {
  const at = GYMS.findIndex((g) => g.mapId === mapId)
  if (at < 0) return -1
  return (badges & (1 << GYMS[at]!.badge)) === 0 ? at : -1
}

/** `MapType`. 원작 `enum MapType` 그대로다 */
export const MapType = {
  NONE: 0, TOWN_CITY: 1, OUTDOORS: 2, CAVE: 3, INDOORS: 4, POKECENTER: 5, UNDERGROUND: 6,
} as const

const isCave = (t: number): boolean => t === MapType.CAVE
const isBuilding = (t: number): boolean => t === MapType.INDOORS || t === MapType.POKECENTER
const isOutdoorsType = (t: number): boolean => t === MapType.TOWN_CITY || t === MapType.OUTDOORS

/** 떡잎마을 주인공 집 1층 · 잔모래마을 포켓몬연구소 (`MAP_HEADER_*`) */
export const MAP_PLAYER_HOUSE_1F = 414
export const MAP_RESEARCH_LAB = 422

/**
 * 노트에 이름이 적히는 건물 스물일곱 (`sMapsInfo`).
 *
 * 값은 그 건물의 **지역명 번호**(`mapLabelTextID`)고, `exited`가 참이면
 * 「나왔다」, 거짓이면 「떠났다」로 적는다. 여기 없는 건물은 아예 안 적힌다 —
 * 포켓몬센터를 드나든 것까지 다 적으면 넉 줄이 그것으로 찬다
 */
export const JOURNAL_BUILDINGS: ReadonlyMap<number, boolean> = new Map([
  [90, true],   // 축복TV방송국
  [91, false],  // 포켓치주식회사
  [92, true],   // GTS
  [93, true],   // 트레이너스쿨
  [94, false],  // 탄갱박물관
  [95, true],   // 플라워숍
  [96, true],   // 사이클숍
  [97, true],   // 콘테스트회장
  [98, true],   // 포핀하우스
  [99, false],  // 이문화건물
  [100, true],  // 포켓몬키우미집
  [101, false], // 장막백화점
  [102, true],  // 게임코너
  [71, false],  // 갤럭시단아지트
  [103, false], // 운하도서관
  [64, false],  // 선단신전
  [104, false], // 길잡이등대
  [105, true],  // 물가시장
  [80, true],   // 배틀타워
  [106, false], // 포켓몬저택
  [107, true],  // 발자국박사의 집
  [108, false], // 찻집
  [109, false], // 그랜드레이크
  [110, false], // 레스토랑
  [47, false],  // 골짜기발전소
  [49, false],  // 골풀무제철소
  [70, false],  // 숲의 양옥집
])

/**
 * 굴 셋만 「빠져나왔다」가 아니라 「떠났다」로 적힌다
 * (`JournalPrinter_PrintLeftCave`) — 골짜기발전소·선단신전·골풀무제철소.
 *
 * ⚠️ **굴이 아닌데 굴로 적힌 맵들이다.** 셋 다 `MAP_TYPE_CAVE`인데 실은
 * 건물이라 "빠져나왔다"가 안 어울려서 원작이 따로 골라 냈다
 */
export const CAVES_USING_DEPARTED: ReadonlySet<number> = new Set([47, 64, 49])

interface MapInfoForJournal {
  /** `MapHeader.mapType` */
  type: number
  /** `MapHeader.label` — 지역명 번호 */
  label: number
}

/**
 * 맵을 넘을 때 생기는 일 (`JournalEntry_CreateAndSaveEventMapTransition`).
 *
 * 굴에서 밖으로 · 건물에서 밖으로 · 밖에서 아직 못 이긴 체육관으로, 셋뿐이다.
 * 나머지 모든 이동은 아무것도 안 적는다
 */
export function mapTransitionEvent(
  prev: MapInfoForJournal, curr: MapInfoForJournal, prevMapId: number, currMapId: number,
  badges: number,
): { type: number; locationId?: number } | null {
  if (isCave(prev.type)) {
    if (!isOutdoorsType(curr.type)) return null
    return { type: LocationEvent.LEFT_CAVE, locationId: prev.label }
  }
  if (isBuilding(prev.type)) {
    if (!isOutdoorsType(curr.type)) return null
    if (prevMapId === MAP_PLAYER_HOUSE_1F) return { type: LocationEvent.RESTED_AT_HOME }
    if (prevMapId === MAP_RESEARCH_LAB) return { type: LocationEvent.LEFT_RESEARCH_LAB }
    if (!JOURNAL_BUILDINGS.has(prev.label)) return null
    return { type: LocationEvent.LEFT_BUILDING, locationId: prev.label }
  }
  if (isOutdoorsType(prev.type) && isBuilding(curr.type)) {
    const gym = gymTooTough(currMapId, badges)
    if (gym < 0) return null
    return { type: LocationEvent.GYM_WAS_TOO_TOUGH, locationId: gym }
  }
  return null
}
