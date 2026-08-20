// 이름 짓기 화면이 제안하는 이름 (DATA.md §2.11)
//
// 원작은 이름 짓기 화면을 열 때 이 표에서 **무작위로 하나를 골라** 미리 넣어
// 둔다(`naming_screen.c`의 `RANDOM_NAME`). 우리가 이름을 새로 지으면 안 되는
// 자리라 그 표를 그대로 쓴다 — 한국어판 라이벌 기본 이름은 펄과 다이아몬드다.
//
// 구간 경계는 디컴프의 `res/text/generic_names.json`이 붙여 둔 이름표에서 왔다
// (`GenericNames_PlayerMale_First` … `GenericNames_Rival_Last`).
import { loadDialogueBank, type DataLocale } from './gameData'

/** `generated/text_banks.txt`의 `TEXT_BANK_GENERIC_NAMES` */
export const GENERIC_NAMES_BANK = 427

/** [첫 항목, 끝 항목] — 양끝을 포함한다 */
const NAME_RANGE = {
  playerMale: [0, 17],
  playerFemale: [18, 35],
  rival: [88, 89],
} as const

export type NameKind = keyof typeof NAME_RANGE

export function loadGenericNames(locale: DataLocale): Promise<string[]> {
  return loadDialogueBank(locale, GENERIC_NAMES_BANK)
}

/** 그 종류의 이름들 */
export function namesOf(bank: readonly string[], kind: NameKind): string[] {
  const [first, last] = NAME_RANGE[kind]
  return bank.slice(first, last + 1)
}

/**
 * 하나 고른다.
 *
 * @param roll 0~1. 원작은 `LCRNG_Next() % 개수`로 뽑는다
 */
export function pickName(bank: readonly string[], kind: NameKind, roll: number): string {
  const list = namesOf(bank, kind)
  return list[Math.min(list.length - 1, Math.floor(roll * list.length))] ?? ''
}
