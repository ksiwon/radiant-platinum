// 명예의 전당 기록 (PARITY §7.11) — `src/hall_of_fame_entries.c`
//
// 리그를 이길 때마다 그때의 파티가 한 줄씩 남는다. **서른 줄짜리 고리**라
// 서른한 번째부터는 제일 오래된 것을 덮어쓴다.
//
// ⚠️ **알은 안 들어간다.** 파티에 알이 있으면 그 자리를 건너뛰고 뒤엣것을
// 앞으로 당긴다 (`Pokemon_GetValue(mon, MON_DATA_IS_EGG)` 갈래).
//
// ⚠️ **9999번째부터는 아예 안 적는다.** 세는 칸이 u32인데도 원작이 그 앞에서
// 손을 뗀다 — 화면이 네 자리라서다 (`HALL OF FAME No. {4자리}`).
import type { PokemonInstance } from '../pokemon/instance'
import type { MetDate } from '../pokemon/origin'
import { SPECIAL_MET_BASE } from '../pokemon/origin'

/** 고리의 길이 (`MAX_HALL_OF_FAME_ENTRIES`) */
export const MAX_HALL_OF_FAME_ENTRIES = 30

/** 여기까지만 센다 (`if (hallOfFame->totalEntriesCount >= 9999) return`) */
export const MAX_TOTAL_ENTRIES = 9999

/** 한 줄에 들어가는 마릿수 (`MAX_PARTY_SIZE`) */
export const HALL_OF_FAME_PARTY = 6

/** 한 마리 (`HallOfFamePokemon`) */
export interface HallOfFameMon {
  species: number
  level: number
  form: number
  /** `personality` — 성별과 색을 여기서 다시 낸다. 종족값은 안 들고 있다 */
  pid: number
  otId: number
  otSecretId: number
  nickname: string
  otName: string
  /** 네 칸 그대로. 0은 빈 칸이다 */
  moves: number[]
}

/** 한 줄 (`HallOfFameEntry`) */
interface HallOfFameEntry {
  pokemon: HallOfFameMon[]
  /** 2000년부터 몇 해. `RTCDate.year`가 0~99다 */
  year: number
  month: number
  day: number
}

/**
 * 기록 전체 (`HallOfFame`).
 *
 * ⚠️ **`entries`가 서른 칸으로 미리 벌어져 있지 않다.** 원작은 구조체라 늘
 * 서른 칸이지만 우리는 리포트가 JSON이라 빈 칸이 그대로 용량이 된다. 대신
 * `next`가 **`entries.length`로 감긴다** — 서른이 차기 전에는 `next`가 한 번도
 * 안 감기므로(`next === total === length`) 원작과 결과가 같다
 */
export interface HallOfFameRecord {
  entries: HallOfFameEntry[]
  /** 다음에 덮어쓸 자리 (`nextEntryIndex`) */
  next: number
  /** 여태 들어간 횟수 (`totalEntriesCount`). 서른을 넘어도 계속 는다 */
  total: number
}

export function newHallOfFame(): HallOfFameRecord {
  return { entries: [], next: 0, total: 0 }
}

/**
 * 한 줄을 더한다 (`HallOfFame_AddEntry`).
 *
 * 새 기록을 돌려준다 — 부르는 쪽이 세이브에 그대로 얹는다
 */
export function addHallOfFameEntry(
  record: HallOfFameRecord,
  party: readonly PokemonInstance[],
  date: MetDate,
): HallOfFameRecord {
  if (record.total >= MAX_TOTAL_ENTRIES) return record

  const pokemon: HallOfFameMon[] = []
  for (const mon of party) {
    if (mon.isEgg) continue
    if (pokemon.length >= HALL_OF_FAME_PARTY) break
    pokemon.push({
      species: mon.species,
      level: mon.level,
      form: mon.form,
      pid: mon.pid,
      otId: mon.otId,
      otSecretId: mon.otSecretId,
      nickname: mon.nickname ?? '',
      otName: mon.origin.otName,
      moves: mon.moves.map((slot) => slot.move),
    })
  }

  const entry: HallOfFameEntry = {
    pokemon,
    year: date.year,
    month: date.month,
    day: date.day,
  }
  const entries = [...record.entries]
  if (entries.length < MAX_HALL_OF_FAME_ENTRIES) entries.push(entry)
  else entries[record.next] = entry

  const next = (record.next + 1) % MAX_HALL_OF_FAME_ENTRIES
  return { entries, next, total: record.total + 1 }
}

/** 지금 볼 수 있는 줄 수 (`HallOfFame_GetStoredEntriesCount`) */
export function storedEntries(record: HallOfFameRecord): number {
  return Math.min(record.total, MAX_HALL_OF_FAME_ENTRIES)
}

/**
 * 그 줄이 몇 번째 전당인가 (`HallOfFame_GetEntryNum`).
 *
 * 0이 제일 최근이다. 서른을 넘긴 뒤에도 **번호는 안 감긴다** — 마흔 번 이겼으면
 * 제일 오래 남은 줄이 11번이다
 */
export function entryNumber(record: HallOfFameRecord, index: number): number {
  return record.total - index
}

/**
 * 최근에서 `index`번째로 거슬러 올라간 줄 (`HallOfFame_GetNthPriorEntry`).
 *
 * ⚠️ **`next - 1`이 제일 최근이다.** `next`는 다음에 *덮어쓸* 자리라 그 앞이
 * 마지막으로 적은 자리다
 */
export function entryAt(record: HallOfFameRecord, index: number): HallOfFameEntry | null {
  const len = record.entries.length
  if (len === 0) return null
  let at = record.next - 1 - index
  while (at < 0) at += len
  return record.entries[at % len] ?? null
}

/**
 * 만난 자리 글의 갈래 (`HallOfFame_GetMetStringIndex`).
 *
 * 뱅크에서 `MetAt`부터 일곱 줄이 이 차례로 놓여 있다
 */
export const MET_KIND = {
  metAt: 0,
  hatchedAt: 1,
  linkTrade: 2,
  kanto: 3,
  hoenn: 4,
  distantLand: 5,
  fateful: 6,
} as const

/**
 * 어느 글을 쓸까 (`HallOfFame_GetMetStringIndex`).
 *
 * 차례가 원작 그대로다 — 지역판(호연·관동·GC)이 먼저고, 그다음이 「운명적인
 * 만남」, 그다음이 트레이너가 다른지, 마지막이 알인지다.
 *
 * ⚠️ **앞의 셋(호연·관동·머나먼 땅)은 우리에게 아직 안 온다.** 그 갈래는
 * `MON_DATA_MET_GAME`이 3세대나 GC일 때인데 우리 개체는 전부 플래티넘에서
 * 났다 (§9 통신·팔파크). 갈래를 지우지 않고 남겨 둔다 — 지우면 나중에
 * 그 칸이 생겼을 때 이 함수를 다시 읽어야 한다
 */
export function metKindOf(mon: PokemonInstance, trainerId: number, trainerName: string): number {
  if (mon.origin.fateful) return MET_KIND.fateful
  if (mon.otId !== trainerId) return MET_KIND.linkTrade
  if (mon.origin.otName !== trainerName) return MET_KIND.linkTrade
  // ⚠️ **알에서 났어도 보는 것은 「만난 자리」다.** 부화한 자리가 거기 적히고
  // (`origin.ts`), 글에 찍히는 이름도 이 칸이다
  if (mon.origin.met.location >= SPECIAL_MET_BASE) return MET_KIND.fateful
  // ⚠️ 원작이 보는 것은 **알을 받은 달**이다 (`MON_DATA_EGG_MONTH`). 우리는
  // 그 날짜를 통째로 들고 있으므로 있는지만 본다
  return mon.origin.egg.date === null ? MET_KIND.metAt : MET_KIND.hatchedAt
}

/** 그 글이 자리 이름을 채워야 하는가 (`case MetAt:` · `case HatchedAt:`) */
export function metKindNeedsPlace(kind: number): boolean {
  return kind === MET_KIND.metAt || kind === MET_KIND.hatchedAt
}
