// 메뉴 화면의 글 (DATA.md §2.11)
//
// 우리가 한 글자도 짓지 않는다. "도감"·"가방"·"발견한 수" 전부 롬에서 나온 것을
// 그대로 쓴다 — 번역투가 다르면 그 자리에서 남의 게임이 된다.
//
// 뱅크 번호는 **미국 롬 기준**이다. 로케일별 실제 번호는 추출 때 이미 옮겨져
// 있고(`textBanks.json`), 싣는 파일 이름이 미국 번호다. 아래 상수가 그 표와
// 어긋나지 않는지는 `uiText.test.ts`가 지킨다 — 표 자체(111KB)를 앱에 싣지
// 않으려고 필요한 번호만 여기 적는다.
import { formatMessage, MESSAGE_SLOTS, MessageSlots } from '../engine/script/text'
import { gameLocale } from '../state/optionsStore'
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
  /** `TEXT_BANK_ROWAN_INTRO` — 인트로 45줄. 마박사의 말부터 라이벌 이름 후보까지 */
  intro: 389,
  /** `TEXT_BANK_NAMING_SCREEN` — "당신의 이름은?" */
  naming: 422,
  /** `TEXT_BANK_MOVE_DESCRIPTIONS` — 기술 468개의 설명. 줄 바꿈까지 원작 것이다 */
  moveDescriptions: 646,
  /** `TEXT_BANK_POKEMON_STORAGE_SYSTEM` — 박스 이름 18개와 벽지 이름 32개 */
  storageSystem: 18,
  /** `TEXT_BANK_BOX_MESSAGES` — 박스 화면이 띄우는 말과 능력 이름표 */
  boxMessages: 19,
  /** `TEXT_BANK_POKEMON_SUMMARY_SCREEN` — 쪽 이름표부터 트레이너 메모의 문장 틀까지 187줄 */
  summary: 455,
  /** `TEXT_BANK_SPECIAL_MET_LOCATION_NAMES` — 지도에 없는 만난 자리 열셋 */
  specialMetLocations: 435,
  /** ⚠️ `TEXT_BANK_MONTH_NAMES` — **일본 롬에는 없다.** 받는 쪽이 빈 배열을 견뎌야 한다 */
  monthNames: 414,
  /** `TEXT_BANK_TOWN_MAP` — 격자 칸마다의 이름 130줄 */
  townMap: 615,
  /** `TEXT_BANK_JOURNAL_ENTRIES` — 모험노트 103줄 */
  journal: 366,
  /** `TEXT_BANK_GYM_NAMES` — 체육관 여덟. 노트가 관장 줄에서 쓴다 */
  gymNames: 378,
  /** `TEXT_BANK_TIMES_OF_DAY` — 아침·낮·저녁·밤·심야 */
  timesOfDay: 608,
  /** `TEXT_BANK_POKETCH_APP_NAMES` — 앱 25개 이름 */
  poketchApps: 457,
  /** `TEXT_BANK_POKETCH_MOVE_TESTER` — 기술효과체커의 일곱 줄 */
  poketchMoveTester: 456,
  /** `TEXT_BANK_DIPLOMA` — 도감 완성 상장 네 줄 */
  diploma: 1,
  /** `TEXT_BANK_BERRY_TAGS` — 나무열매 태그의 이름표 열여섯 */
  berryTags: 398,
  /** `TEXT_BANK_BERRY_NAMES` · `..._DESCRIPTIONS` — 열매 64종 */
  berryNames: 424,
  berryText: 423,
  /** `TEXT_BANK_HALL_OF_FAME` — 전당 장면의 열네 줄 */
  hallOfFame: 351,
  /** `TEXT_BANK_PC_HALL_OF_FAME` — PC로 다시 보는 화면의 여섯 줄 */
  pcHallOfFame: 352,
} as const

/**
 * 명예의 전당 장면 (`hall_of_fame` 뱅크).
 *
 * 5~11번 일곱 줄이 「만난 자리」다. `MET_KIND`가 그 차례 그대로라 `metAt + 갈래`로
 * 집는다 (`HallOfFame_Text_MetAt + metStringIndex`)
 */
export const HALL_OF_FAME_TEXT = {
  welcome: 0,
  /** 1 수 · 2 암 · 3 없음 — `{종족} ♂ Lv.{레벨}` */
  info: [1, 2, 3],
  ot: 4,
  metAt: 5,
  congratulations: 12,
  playerInfo: 13,
} as const

/** PC로 다시 보는 화면 (`pc_hall_of_fame` 뱅크) */
export const PC_HALL_OF_FAME_TEXT = {
  title: 0, level: 1, ot: 2, male: 3, female: 4, slash: 5,
} as const

/** 나무열매 태그의 글 자리 (`berry_tags` 뱅크) */
export const BERRY_TAG = {
  title: 0, spicy: 1, dry: 2, sweet: 3, bitter: 4, sour: 5,
  size: 8, firm: 10,
  /** 11~15가 단단함 다섯. **1부터 센다** */
  firmness: 11,
} as const

export type UiBank = keyof typeof UI_BANK

/**
 * 뱅크 하나를 받는다. 이름으로 부르므로 번호를 틀릴 자리가 없다.
 *
 * 언어를 안 적으면 **설정에 있는 언어**다. 화면마다 손으로 적게 두면 한 곳만
 * 빠뜨려도 그 화면만 옛 언어로 남는다
 */
export function loadUiText(bank: UiBank, locale: DataLocale = gameLocale()): Promise<string[]> {
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
  // 표 크기는 **부르는 쪽이 준 만큼**이다. 8로 굳히면 요약 화면의 아홉째 칸
  // (알을 받은 자리)이 조용히 버려진다
  const slots = new MessageSlots(Math.max(values.length, MESSAGE_SLOTS))
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

/**
 * 인트로 (`rowan_intro`). 자리는 디컴프 `res/text/rowan_intro.json`의 줄 순서다.
 *
 * 2~5번(조작 설명)은 **DS 하드웨어 이야기다** — 십자키·터치스크린·X/Y 아이콘.
 * 그중 2·3번은 우리에게도 맞는 말이라 쓰고, 4·5번(터치스크린)은 안 쓴다.
 * 원작 글을 고쳐 쓰지는 않는다 — 안 맞는 것을 빼기만 한다.
 */
export const INTRO_TEXT = {
  hello: 0,
  myName: 1,
  controls: [2, 3],
  /** 4·5번은 터치스크린 설명이라 뺐다 */
  controlsSkipped: [4, 5],
  understood: 7,
  anythingElse: 9,
  adventure: [10, 11, 12, 13, 14, 15],
  widelyInhabited: 16,
  havePokeBall: 17,
  wrongButton: 18,
  liveAlongside: 19,
  aboutYourself: 20,
  genderAsk: 21,
  confirmBoy: 22,
  confirmGirl: 23,
  nameAsk: 24,
  confirmNameMale: 25,
  confirmNameFemale: 26,
  soYoure: 27,
  rivalNameAsk: 28,
  confirmRivalName: 29,
  end: 30,
  choiceControls: 31,
  choiceAdventure: 32,
  choiceNoInfo: 33,
  yes: 34,
  no: 35,
  /** 36 = "스스로 결정한다!", 37~44 = 후보 여덟 */
  rivalChoiceOwn: 36,
  rivalChoices: [37, 38, 39, 40, 41, 42, 43, 44],
} as const

/** 이름 짓기 화면 (`naming_screen`) */
export const NAMING_TEXT = { player: 0, pokemon: 1, box: 2, rival: 3 } as const

/**
 * 보관 시스템의 글 자리.
 *
 * `boxName`은 **첫 박스의 자리**다 — 앞 여섯 칸은 빈 글과 `{STRVAR_1 11}`이고
 * 원작도 `PokemonStorageSystem_Text_Box1 + boxID`로 센다
 */
export const BOX_TEXT = {
  /** `pokemon_storage_system` 뱅크 */
  boxName: 6,
  wallpaperName: 28,
  /** `box_messages` 뱅크 */
  partyFull: 5,
  lastMon: 6,
  boxFull: 13,
  noItem: 20,
} as const

/** PC 메뉴의 항목 (`menu_entries`). 65 + 갈래 번호가 보관 시스템의 다섯 갈래다 */
export const PC_MENU = { storageModes: 65 } as const

/** 가방 뱅크가 상점 글까지 갖고 있다 (`TEXT_BANK_BAG`) */
export const SHOP_TEXT = {
  /** "{도구}은 {값}원입니다" 대신 우리는 목록에 값을 바로 붙인다. 여기 것은 흐름 글이다 */
  howManySell: 75, money: 78, yes: 82, no: 83, close: 94,
} as const
