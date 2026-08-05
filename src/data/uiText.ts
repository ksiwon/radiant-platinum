// 메뉴 화면의 글 (DATA.md §2.11)
//
// 우리가 한 글자도 짓지 않는다. "도감"·"가방"·"발견한 수" 전부 롬에서 나온 것을
// 그대로 쓴다 — 번역투가 다르면 그 자리에서 남의 게임이 된다.
//
// 뱅크 번호는 **미국 롬 기준**이다. 로케일별 실제 번호는 추출 때 이미 옮겨져
// 있고(`textBanks.json`), 싣는 파일 이름이 미국 번호다. 아래 상수가 그 표와
// 어긋나지 않는지는 `uiText.test.ts`가 지킨다 — 표 자체(111KB)를 앱에 싣지
// 않으려고 필요한 번호만 여기 적는다.
import { formatMessage, MessageSlots } from '../engine/script/text'
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
  /** `TEXT_BANK_OPTIONS_MENU` — 설정 항목과 그 설명 */
  options: 220,
  /** `TEXT_BANK_SAVE_INFO_WINDOW` — 리포트 요약창의 이름표 */
  saveInfo: 534,
  /** `TEXT_BANK_MAIN_MENU_OPTIONS` — "모험을 계속한다"·"새로운 모험을 시작한다" */
  mainMenu: 550,
  /** `TEXT_BANK_COMMON_STRINGS` — 리포트 작성 흐름의 물음과 대답 */
  common: 213,
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

/**
 * 메뉴 글의 빈칸을 채운다.
 *
 * 롬에서 나온 글에는 제어 부호가 그대로 들어 있다. 시작 메뉴 3번이
 * `{STRVAR_1 3, 0, 0}`인데 원본은 화면을 열 때 0번 칸에 주인공 이름을 넣는다.
 * 안 채우고 그리면 **부호가 글자 그대로 화면에 뜬다** — 실제로 그렇게 떴다.
 *
 * 대사창과 같은 인쇄기를 쓰므로 조사도 같이 붙는다
 */
export function fillMenuText(raw: string, values: readonly string[]): string {
  if (!raw.includes('{')) return raw
  const slots = new MessageSlots()
  values.forEach((value, i) => { slots.set(i, value) })
  return formatMessage(raw, slots)
}

/** 도감 화면의 글 자리 */
export const POKEDEX_TEXT = {
  seen: 0, caught: 1, height: 9, weight: 10, heightUnit: 11, weightUnit: 12,
} as const

/** 리포트 흐름 (`common_strings`). 16번은 `{STRVAR_1 3, 0, 1}` — 주인공 이름 + 은/는 */
export const SAVE_TEXT = {
  ask: 13, overwrite: 14, writing: 15, done: 16,
} as const

/** 리포트 요약창의 이름표 (`save_info_window`) */
export const SAVE_INFO = {
  player: 1, badges: 2, pokedex: 3, playtime: 4,
} as const

/** 설정 화면 (`options_menu`). 43~48이 항목별 설명이다 */
export const OPTIONS_TEXT = {
  title: 0,
  labels: { speed: 3, battleScene: 4, battleRule: 5, sound: 6, buttons: 7, frame: 8 },
  speed: [10, 11, 12],
  battleScene: [13, 14],
  battleRule: [15, 16],
  sound: [17, 18],
  help: { speed: 43, battleScene: 44, battleRule: 45, sound: 46, buttons: 47, frame: 48 },
  confirm: 9, yes: 50, no: 51, close: 42,
} as const

/** 타이틀 화면 (`main_menu_options`) */
export const MAIN_MENU = { continue_: 0, newGame: 1, player: 12, playtime: 13, dex: 14, badges: 15 } as const

/** 가방 뱅크가 상점 글까지 갖고 있다 (`TEXT_BANK_BAG`) */
export const SHOP_TEXT = {
  /** "{도구}은 {값}원입니다" 대신 우리는 목록에 값을 바로 붙인다. 여기 것은 흐름 글이다 */
  howManySell: 75, money: 78, yes: 82, no: 83, close: 94,
} as const
