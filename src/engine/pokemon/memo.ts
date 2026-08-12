// 트레이너 메모의 글을 짓는다 (PARITY §5 · `unk_02092494.c`)
//
// **우리가 한 글자도 안 짓는다.** 다섯 줄이 전부 요약 뱅크(455)의 문장 틀이고,
// 여기가 하는 일은 어느 틀을 고르고 아홉 칸을 무엇으로 채우는지뿐이다.
//
// 원작이 다섯 자리를 따로 들고 각각에 **몇 째 줄인지**를 붙여 둔다
// (`infoDisplay->unk_14.unk_00` 같은 값). 줄 번호가 갈래마다 다르다 —
// 잡은 것은 개성이 6줄째인데 부화한 것은 8줄째다. 사이를 비우는 것이 자료라
// 그 값을 그대로 옮긴다.
import { natureOf } from './instance'
import { natureEffect } from './stats'
import {
  characteristicLine, eggFriendshipLine, flavorLine, memoIsEgg, memoStatus,
  memoTemplate, metBank, natureLine, type MetDate, type Origin,
} from './origin'
import type { PokemonInstance } from './instance'

/** 메모 한 줄 — 몇 째 줄에 놓을지와 뱅크의 글 번호 */
export interface MemoLine {
  /** 1부터. 원작은 `(줄 - 1) * 16`픽셀에 찍는다 */
  at: number
  message: number
}

/**
 * 갈래마다 어느 줄에 무엇이 오는가.
 *
 * 원작 `sub_02092494`의 `switch` 스물한 갈래를 표로 편 것이다. 값은
 * [성격, 만난 자리, 개성, 좋아하는 맛, 친밀도] 줄 번호이고 0이면 그 줄이 없다
 */
const ROWS: Readonly<Record<number, readonly [number, number, number, number, number]>> = {
  0: [1, 2, 6, 7, 0], 1: [1, 2, 6, 7, 0], 2: [1, 2, 6, 7, 0],
  3: [1, 2, 8, 9, 0], 4: [1, 2, 8, 9, 0], 5: [1, 2, 8, 9, 0], 6: [1, 2, 8, 9, 0],
  7: [1, 2, 7, 8, 0], 8: [1, 2, 7, 8, 0],
  9: [1, 2, 9, 0, 0], 10: [1, 2, 9, 0, 0], 11: [1, 2, 9, 0, 0], 12: [1, 2, 9, 0, 0],
  13: [1, 2, 9, 0, 0], 14: [1, 2, 9, 0, 0],
  15: [1, 2, 6, 7, 0],
  16: [0, 1, 0, 0, 6], 17: [0, 1, 0, 0, 6], 18: [0, 1, 0, 0, 6],
  19: [0, 1, 0, 0, 6], 20: [0, 1, 0, 0, 6],
}

/** 요약 뱅크의 아홉 칸을 채울 값 */
export interface MemoSlots {
  /** 0~8. 원작 차례 그대로다 — 0~2 만난 날 · 3 레벨 · 4 만난 자리 · 5~7 알 날 · 8 알 자리 */
  values: string[]
}

export interface MemoNames {
  /** 지역명 표 (`names/locations.*.json`) */
  location: readonly string[]
  /** 2000을 넘는 자리 (`TEXT_BANK_SPECIAL_MET_LOCATION_NAMES`) */
  special: readonly string[]
  /** 달 이름 12개 (`TEXT_BANK_MONTH_NAMES`) */
  month: readonly string[]
}

/**
 * 자리 번호 → 이름 (`StringTemplate_SetMetLocationName`).
 *
 * ⚠️ **0번은 지역명 표를 안 본다.** 원작이 `!(type == 0 && id == 0)`으로 빼내고
 * 특별한 자리 표의 "수수께끼의 장소"로 떨어뜨린다 — 지역명 0번은 빈 글이라
 * 그대로 쓰면 자리가 통째로 사라진다
 */
export function metName(location: number, names: MemoNames): string {
  const { special, index } = metBank(location)
  if (!special && index === 0) return names.special[MYSTERY_ZONE] ?? ''
  const table = special ? names.special : names.location
  return table[index] ?? names.special[MYSTERY_ZONE] ?? ''
}

/** `SPECIAL_METLOC_NAME_MYSTERY_ZONE` — 특별한 자리 표 열셋 중 마지막 */
const MYSTERY_ZONE = 12

/** 두 자리로 채운 수. 원작은 `PADDING_MODE_ZEROES`로 찍는다 */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 달 (`StringTemplate_SetMonthName`).
 *
 * ⚠️ 1~12 밖의 값은 **1로 자른다**. 원작이 그렇게 하고, 그래서 날짜가 안
 * 새겨진 개체도 화면이 안 깨진다.
 *
 * ⚠️ **이름을 쓰는 판이 미국판뿐이다.** 세 롬을 맞대 보고 정한 규칙이다 —
 * 미국 표는 `Jan.`이고 문장 틀이 단위를 안 쓴다. 한국 표는 `1월`인데 문장 틀이
 * 뒤에 `월`을 또 쓰고, 일본 롬은 표 자체가 없다(`textBanks`의 열쇠도 없다고
 * 한다). 그래서 **제 번호로 시작하는 이름은 단위가 이미 붙은 것**으로 보고
 * 숫자만 넣는다 — 안 그러면 한국어가 "1월월"이 된다
 */
export function monthText(month: number, names: MemoNames): string {
  const at = month < 1 || month > 12 ? 1 : month
  const name = names.month[at - 1]
  if (name === undefined) return String(at)
  return name.startsWith(String(at)) ? String(at) : name
}

/** 아홉 칸을 채운다 (`InitializePokemonMetInfoString`) */
export function memoSlots(origin: Origin, names: MemoNames): string[] {
  const met = origin.met.date ?? BLANK_DATE
  const egg = origin.egg.date ?? BLANK_DATE
  return [
    pad2(met.year), monthText(met.month, names), String(met.day),
    String(origin.metLevel),
    metName(origin.met.location, names),
    pad2(egg.year), monthText(egg.month, names), String(egg.day),
    metName(origin.egg.location, names),
  ]
}

/** 날짜가 안 새겨진 개체 — 판 12 이전의 리포트에서만 나온다 */
const BLANK_DATE: MetDate = { year: 0, month: 0, day: 0 }

/**
 * 메모 한 장.
 *
 * `template`은 문장 틀의 번호고 `slots`가 그 빈칸이다. 나머지 넷은 빈칸이 없는
 * 한 줄짜리 글이라 번호만 있으면 된다
 */
export interface Memo {
  lines: MemoLine[]
  /** 만난 자리 줄에 채워 넣을 아홉 칸 */
  slots: string[]
  /** 그 줄이 만난 자리 줄인가 — 이 줄만 빈칸을 채워야 한다 */
  metLine: number
}

/**
 * 개체 하나의 메모.
 *
 * `otMatches`는 원래 트레이너가 나인가다. 통신이 없어서 늘 참이지만, 값을
 * 받아 두면 갈래가 스무 개 그대로 남는다 — 통신이 붙는 날 여기를 안 고친다
 */
export function buildMemo(mon: PokemonInstance, otMatches: boolean, names: MemoNames): Memo {
  const status = memoStatus(mon.origin, otMatches, mon.isEgg)
  const rows = ROWS[status] ?? ROWS[0]!
  const [natureAt, metAt, charAt, flavorAt, friendAt] = rows
  const nature = natureOf(mon.pid)
  const lines: MemoLine[] = []
  const add = (at: number, message: number): void => { if (at > 0) lines.push({ at, message }) }

  add(natureAt, natureLine(nature))
  add(metAt, memoTemplate(status))
  if (!memoIsEgg(status)) {
    add(charAt, characteristicLine(mon.pid, mon.ivs))
    add(flavorAt, flavorLine(natureEffect(nature).up))
  }
  add(friendAt, eggFriendshipLine(mon.friendship))

  return { lines, slots: memoSlots(mon.origin, names), metLine: metAt }
}
