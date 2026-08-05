// 메뉴 화면의 글 (DATA.md §2.11)
//
// 우리가 한 글자도 짓지 않는다. "도감"·"가방"·"발견한 수" 전부 롬에서 나온 것을
// 그대로 쓴다 — 번역투가 다르면 그 자리에서 남의 게임이 된다.
//
// 뱅크 번호는 **미국 롬 기준**이다. 로케일별 실제 번호는 추출 때 이미 옮겨져
// 있고(`textBanks.json`), 싣는 파일 이름이 미국 번호다. 아래 상수가 그 표와
// 어긋나지 않는지는 `uiText.test.ts`가 지킨다 — 표 자체(111KB)를 앱에 싣지
// 않으려고 필요한 번호만 여기 적는다.
import { loadDialogueBank, type DataLocale } from './gameData'

export const UI_BANK = {
  /** `TEXT_BANK_START_MENU` — 도감·포켓몬·가방·리포트·설정·닫는다 */
  startMenu: 367,
  /** `TEXT_BANK_BAG_POCKET_NAMES` — 주머니 8개 이름 */
  bagPockets: 395,
  /** `TEXT_BANK_BAG` — 쓴다·버린다·건네준다… */
  bag: 7,
  /** `TEXT_BANK_PARTY_MENU` */
  partyMenu: 453,
  /** `TEXT_BANK_POKEDEX` — 발견한 수·잡은 수·키·몸무게 */
  pokedex: 697,
  /** `TEXT_BANK_MENU_ENTRIES` — 전역 목록 메뉴의 항목 글 */
  menuEntries: 361,
  /** `TEXT_BANK_SPECIES_CATEGORY` — "씨앗포켓몬" */
  speciesCategory: 711,
  /** `TEXT_BANK_SPECIES_POKEDEX_ENTRY_DIAMOND` — 도감 설명문 */
  dexEntry: 698,
  /** `TEXT_BANK_SPECIES_HEIGHT` · `..._WEIGHT` — 이미 단위까지 붙은 글이다 */
  speciesHeight: 709,
  speciesWeight: 707,
} as const

export type UiBank = keyof typeof UI_BANK

/** 뱅크 하나를 받는다. 이름으로 부르므로 번호를 틀릴 자리가 없다 */
export function loadUiText(bank: UiBank, locale: DataLocale = 'ko'): Promise<string[]> {
  return loadDialogueBank(locale, UI_BANK[bank])
}

/**
 * 시작 메뉴의 항목 자리.
 *
 * 3번은 `{STRVAR_1 3, 0, 0}` — 주인공 이름이 들어가는 자리다. 트레이너 카드가
 * 그 이름으로 뜬다
 */
export const START_MENU = {
  pokedex: 0, party: 1, bag: 2, trainerCard: 3, save: 4, options: 5, exit: 6,
} as const

/** 도감 화면의 글 자리 */
export const POKEDEX_TEXT = {
  seen: 0, caught: 1, height: 9, weight: 10, heightUnit: 11, weightUnit: 12,
} as const
