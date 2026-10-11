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
// ⚠️ **`gameData`를 정적으로 안 잡는다.** 그 모듈이 `data/schema`(zod)를 끌고
// 오는데, 타이틀이 이 파일을 정적으로 닿아서 그대로 첫 화면 예산에 얹힌다
// (실측 gzip 19.4kB · DEPLOY.md §2). 글은 어차피 비동기로 받는다
import type { DataLocale } from './gameData'

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
  /**
   * `TEXT_BANK_BATTLE_PARTY` — 배틀 안 파티 화면 96줄. 메뉴 화면이 기술 정보의 이름표(위력 · 명중 · 분류 ·
   * 물리/변화/특수 · 「---」)를 여기서 읽는다. 줄 번호는 `battle/romText`의 `PARTY`가 쥔다
   */
  battleParty: 3,
  /**
   * `TEXT_BANK_MOVE_REMINDER` — 기술 되살리기의 물음 · 가르치는 사람의 물음 · 이름표 (34줄).
   *
   * ⚠️ **굽는 쪽 둘이 이 뱅크를 싣기 전에는 설치본에 없다** (P0b). 받는 쪽이 빈 배열을 견뎌야 한다
   */
  moveReminder: 645,
  /** `TEXT_BANK_BATTLE_FACTORY_APP` — 팩토리 화면의 물음과 단추 */
  factoryApp: 364,
  /** `TEXT_BANK_BATTLE_FRONTIER_RECORDS` — 프런티어 기록 이름표 (싱글 · 레벨 50 · 연승…) */
  frontierRecords: 16,
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
  /** `TEXT_BANK_NATURE_NAMES` — 성격 25 (`StringTemplate_SetNatureName`) */
  natureNames: 202,
  /**
   * `TEXT_BANK_CONTEST_ACCESSORY_NAMES` — 장식 100가지 (PARITY §7.16).
   *
   * 61번(컬러풀파라솔)부터가 하나뿐인 장식이다 — 디컴프의
   * `NON_UNIQUE_ACCESSORY_COUNT`와 이 뱅크의 차례가 맞는다
   */
  accessoryNames: 386,
  /**
   * 조사가 붙은 판과 복수형 (`StringTemplate_SetItemNameWithArticle` 등).
   *
   * ⚠️ **미국 롬에만 있다.** 한국·일본 롬의 뱅크 표에는 이 넷의 짝이 없어서
   * `public/data/dialogue/{ko,ja}`에 안 실린다 — 조사도 복수형도 없는 말이라
   * 롬 자체가 표를 안 들고 있는 것이다. 받는 쪽이 빈 배열을 견디고 맨 이름표로
   * 떨어져야 한다 (`fieldServices`의 `orPlain`)
   */
  itemNamesWithArticles: 393,
  accessoryNamesWithArticles: 387,
  /** `TEXT_BANK_BALL_SEAL_NAMES` · `_PLURAL` · `TEXT_BANK_CONTEST_BACKDROP_NAMES` — 씰 · 배경 이름 칸 */
  ballSealNames: 12,
  ballSealNamesPlural: 13,
  backdropNames: 388,
  itemNamesPlural: 394,
  speciesNamesWithArticles: 413,
  trainerClassNamesWithArticles: 620,
  /** `TEXT_BANK_UNK_0543` — 상점 말과 소지금 창. 18번이 이름표, 19번이 문장 틀 */
  shop: 543,
  /** `TEXT_BANK_TRADE` — 교환 장면의 여섯 줄. 넷은 NPC 교환, 둘은 GTS 것이다 */
  trade: 350,
  /**
   * `TEXT_BANK_NPC_TRADE_NAMES` — 여덟 줄이 **별명 넷 + 트레이너 이름 넷**이다.
   * 뒤쪽 넷은 `MAX_NPC_TRADES + id`로 집는다 (`engine/pokemon/npcTrade.ts`)
   */
  npcTradeNames: 370,
  /**
   * `TEXT_BANK_UNK_0548` — 크레딧 237줄 (PARITY §8.12).
   *
   * ⚠️ **어느 언어 롬에서도 스태프 이름은 영문 그대로다.** 색 부호(`{COLOR 1}`)와
   * 앞의 빈칸 넷까지 롬의 것이라 손대지 않는다
   */
  credits: 548,
  /** `TEXT_BANK_MAIL` — 편지 화면의 네 줄. 「결정」·「그만둔다」·「단어를 넣어 주십시오」 */
  mail: 409,
  /** `TEXT_BANK_MAILBOX` — 우편함의 열두 줄 */
  mailbox: 408,
  /** `TEXT_BANK_UNK_0008` — 볼캡슐 편집기의 글 열일곱 (`ov76_0223B870`) */
  capsuleEditor: 8,
  /** `TEXT_BANK_EASY_CHAT` — 낱말 고르기 화면의 열세 줄. 끝 둘이 모드 이름이다 */
  easyChat: 437,
  /** `TEXT_BANK_EASY_CHAT_GROUPS` — 무리 이름 열넷. 앞 열둘이 무리고 뒤 둘은 「???」·「되돌아간다」 */
  easyChatGroups: 436,
  /** 낱말이 든 뱅크 일곱. 종족·기술·타입·특성은 이름표에서 온다 */
  trainerWords: 439,
  peopleWords: 440,
  greetings: 441,
  lifestyleWords: 442,
  feelings: 443,
  toughWords: 444,
  unionWords: 445,
} as const

/**
 * 교환 장면의 네 줄 (`trade` 뱅크 · `overlay095`).
 *
 * 4·5번은 GTS(`TRADE_TYPE_*`가 `NORMAL`이 아닐 때)용이라 NPC 교환에서는 안 뜬다.
 * 칸은 0 내가 주는 마리 · 1 받는 마리 · 2 상대 트레이너다
 * (`StringTemplate_SetNickname` 두 번 + `_SetPlayerName`)
 */
export const TRADE_TEXT = {
  /** "{0}을 {2}에게 보냅니다!" — 10프레임 뒤 */
  willBeSent: 0,
  /** "바이바이! {0}!" — 그 60프레임 뒤. 여기서 보내는 마리가 운다 */
  byeBye: 1,
  /** "{2}로부터 {1} 전송됐다!" — 도착. `SEQ_FANFA5`가 같이 울린다 */
  sentOver: 2,
  /** "{1} 귀여워해 줘!" — 그 60프레임 뒤 */
  takeCare: 3,
} as const

/**
 * 파티 화면의 아래 글 띠와 모드 줄 (`party_menu` 뱅크 453).
 *
 * 29~36은 파티 화면이 어떤 목적으로 열렸는지에 따라 바뀌는 안내문이고(`main.c:305-327`), 175~179는
 * 기술머신 · 진화의돌 모드에서 판마다 HP 자리에 붙는 한 줄이다 (`windows.c:1032-1075`).
 * 35번은 공백뿐이라 적지 않는다
 */
export const PARTY_MENU_TEXT = {
  /** 「포켓몬을 선택해 주십시오」 — 기본 · 스크립트가 고르라고 연 화면 */ choose: 29,
  /** 「어디로 이동할까?」 — 포켓몬을 집었다 */ moveTo: 30,
  /** 「어느 포켓몬에게 건네줄까?」 */ give: 31,
  /** 「어느 포켓몬에게 사용할까?」 — 도구 */ use: 32,
  /** 「어느 포켓몬에게 가르칠까?」 — 기술머신 */ teach: 33,
  /** 「포켓몬을 선택하고 결정」 */ chooseAndConfirm: 34,
  /** 「어느 포켓몬에게 쓸까?」 — 우유마시기 */ milk: 36,
  /** 기술머신 모드 — 「배울 수 있다!」 · 「배울 수 없다」 · 「이미 알고 있다」 */
  canLearn: 175, cannotLearn: 176, alreadyKnows: 177,
  /** 진화의돌 모드 — 「쓸 수 있습니다」 · 「쓸 수 없습니다」 */
  canUse: 178, cannotUse: 179,
  /** 알만 고르는 화면 — 「알을 선택해 주십시오」 */ chooseEgg: 197,
  /** 알의 갈래 물음 — 「알을 어떻게 할까?」 */ eggAsk: 198,
} as const

/**
 * 요약 화면의 이름표 (`pokemon_summary_screen` 뱅크 455).
 *
 * 능력 이름 여섯(110~115)은 HP · 공격 · 방어 · 특수공격 · 특수방어 · 스피드 차례다.
 * `noPp`와 `noValue`는 빈 기술 칸과 위력 없는 기술 칸에 찍는다 — 지은 「???」가 아니다
 */
export const SUMMARY_TEXT = {
  stats: [110, 111, 112, 113, 114, 115],
  /** 「PP」 */ pp: 135,
  /** 「위력」 · 「명중」 */ power: 147, accuracy: 148,
  /** 바꾸기 출발 줄의 작은 표 — 「교체」 */ swap: 152,
  /** 빈 기술 칸의 PP 자리 — 「--」 */ noPp: 153,
  /** 위력 ≤ 1 · 명중 0 — 「---」 */ noValue: 154,
} as const

/** 팩토리 화면의 물음과 단추 (`battle_factory_app` 뱅크 364) */
export const FACTORY_TEXT = {
  /** 「{N}번째 포켓몬을 선택해 주십시오」 · 「이상의 {N}마리로 괜찮겠습니까?」 */
  pickMon: 0, confirmTeam: 1,
  /** 「잠시 기다려 주십시오」 */ wait: 2,
  yes: 3, no: 4,
  /** 「능력치 보기」 — 새 설계는 상세가 옆에 늘 떠 있어서 줄로 안 둔다 */ viewStats: 5,
  /** 「대여받는다」 · 「닫는다」 · 「떼어낸다」 */ rent: 6, close: 7, release: 8,
  /** 「교환할 포켓몬을 선택해 주십시오」 · 「포켓몬 교환을 중지하겠습니까?」 */ pickTrade: 9, stopTrade: 10,
  /** 「받을 포켓몬을 선택해 주십시오」 · 「이 포켓몬을 받겠습니까?」 */ pickReceive: 13, confirmReceive: 14,
} as const

/** 프런티어 기록의 이름표 (`battle_frontier_records` 뱅크 16) */
export const FRONTIER_TEXT = {
  /** 「어떤 성적을 보겠습니까?」 */ ask: 0,
  /** 「싱글」 */ single: 1,
  /** 「레벨 50」 · 「오픈 레벨」 */ level50: 34, openLevel: 35,
  /** 「{N}연승」 — 칸 0이 수다 */ streak: 38,
} as const

/**
 * 기술 되살리기 · 기술 가르치는 사람의 글 (`move_reminder` 뱅크 645).
 *
 * 번호는 디컴프 `res/text/move_reminder.json`의 메시지 순서다. 앞 열한 줄이 되살리기(`Reminder_*`),
 * 다음 열한 줄이 가르치는 사람(`Tutor_*`)이고 같은 차례다. 이름표 열두 줄이 그 뒤다
 */
export const MOVE_REMINDER_TEXT = {
  /** 「어느 기술을 가르칠까?」 */ askTeachWhichToMon: 0,
  /** 「○○을 가르치겠습니까?」 */ askShouldTeachMove: 1,
  /** 「새 기술 가르치는 것을 포기하겠습니까?」 */ askGiveUpTeachingMon: 2,
  /** 「○○ 배웠다」 — 팡파르 없이 */ learnedMoveNoFanfare: 3,
  /** 「네 개를 넘길 수 없다 … 오래된 기술을 잊게 하겠습니까?」 */ askMoreThanFourMoves: 4,
  /** 「1, 2, … 짠!」 + 잊었다 + 「그리고…」 */ twelveAndPoof: 5,
  /** 「○○ 배웠다」 — 팡파르 */ learnedMoveFanfare: 6,
  /** 「그만두겠습니까?」 */ askStopTryingToTeachMove: 7,
  /** 「배우지 않았다」 */ monDidNotLearnMove: 8,
  /** 비용 줄 (가르치는 사람만 쓴다) */ payment: 9,
  /** 「잊어도 괜찮습니까?」 */ askForgetThisMove: 10,
  /** 가르치는 사람 쪽 — 위와 같은 차례에 11을 더한다 */ tutorOffset: 11,
  /** 이름표 — 분류 · 위력 · 명중 · PP · 배틀기 · 어필 · 콘테스트기 */
  category: 22, power: 23, accuracy: 24, pp: 25, battleMoves: 26, appealPoints: 27, contestMoves: 28,
  /** 값 틀 — 위력 · 명중 · PP */ powerValue: 29, accuracyValue: 30, ppValue: 31,
  /** 「그만둔다」 */ cancel: 32,
  /** 값이 없다 — 「---」 */ dashes: 33,
} as const

/** 가이드맵 (`town_map` 뱅크 615) — 날기 모드 머리 오른쪽의 물음과 화면 제목 */
export const TOWN_MAP_TEXT = {
  /** 「어디로 날아갈까요?」 */ ask: 0,
  /** 「가이드맵」 — 화면 제목 */ title: 1,
} as const

/** 소지금 창 (`FieldMenu_CreateMoneyWindow` · `..._PrintMoneyToWindow`) */
export const MONEY_WINDOW_TEXT = { label: 18, amount: 19 } as const

/**
 * 상점에서 사는 흐름의 줄 (`shop` 뱅크 · `overlay007/shop_menu.c`). 번호가 곧 `pl_msg_00000543_000NN`이다.
 *
 * 돈 가게와 BP 가게(프런티어)가 줄을 따로 쓴다 — 고르는 쪽이 `martType`으로 가른다. 기술머신은 확인 줄에 기술
 * 이름이 붙는 판이 따로 있다(`Item_MoveForTMHM`). 칸은 0 도구 · 1 개수 · 2 값 · 3 기술이다
 */
export const MART_TEXT = {
  /** 「돈이 부족하시군요!」 · 「죄송합니다... BP가 부족한 것 같습니다...」 — 고르자마자 (`Shop_SelectBuyMenu`) */
  noMoney: 3, noBP: 37,
  /** 「{0}\n몇 개 구입하시겠습니까?」 · BP판 */
  howMany: 4, bpHowMany: 33,
  /** 「{0} {1}개로군요\n총 {2}원입니다.」 — 결제 전 확인 (`Shop_ShowPurchaseMessage`) */
  confirm: 5, bpConfirm: 35, tmConfirm: 27, bpTmConfirm: 36,
  /** 「네 여기 있습니다 … {0}\n{1} 포켓에 넣었다」 — 칸 1이 주머니 이름이다 (`Shop_SelectConfirmPurchase`) */
  thanks: 6,
  /** 씰 가게의 같은 줄 둘 — 「네 여기 있습니다 … {0}」 · 「그 이상은 가질 수 없다」 (`Shop_SelectConfirmPurchase` · `Shop_SelectPurchaseMenu`의 씰 갈래) */
  sealThanks: 13, sealNoRoom: 14,
  /** 「그 이상은\n가지고 다닐 수 없어요!」 — 개수를 고른 뒤 칸이 모자라면 */
  noRoom: 7,
  /** 「프레미어볼 1개를\n서비스로 드리겠습니다!」 (`Shop_FinishPurchase`) */
  premier: 10,
  /** 목록 끝 줄 — 「그만둔다」 */ closeRow: 8,
  /** 「그 밖에 저희가 뭐 도와드릴 건 없습니까?」 */ more: 2,
  /** 작별 — 「또 오세요!」 · BP 가게는 「BP를 모아서 또 방문해 주십시오!」 */ bye: 1, byeBP: 31,
  /** BP 소지금 창의 값 — 「{n}BP」 */ bpMoney: 38,
  /** 개수 창 셋 — 「{0}개 갖고 있음」 · 「x{0}」 · 「{0}원」 / 「{0}BP」 (`Shop_ShowQtyWithinInventory` · `…TotalItemPurchase`) */
  inBag: 20, quantity: 21, total: 22, bpTotal: 34,
} as const

/**
 * 파티 화면 머리의 한 줄 — 싸울 수 있는 마리와 데리고 있는 마리.
 *
 * ⚠️ **롬 글이 아니다.** 원작 파티 화면에는 이 줄이 없고(판 여섯이 그 자체로 말한다) 우리 창 머리에만 붙는다.
 * 그래서 숫자를 동사 뒤에 매달지 않고 명사구로 둔다 — 「싸울 수 있다 6」은 읽다가 걸린다
 */
export function partyHeader(alive: number, size: number): string {
  return `전투 가능 ${String(alive)}마리 · 파티 ${String(size)}/6`
}

/** 코인 창의 문장 틀 (`FieldMenu_PrintCoinsToWindow` — `menu_entries` 뱅크) */
export const COIN_WINDOW_TEXT = 197

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

/** 요약 뱅크의 「기술」 쪽 이름 — 요약 화면의 탭이고, PC 전당의 기술 쪽 표시도 이 줄이다 */
export const SUMMARY_PAGE_MOVES = 128

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

type UiBank = keyof typeof UI_BANK

/**
 * 뱅크 하나를 받는다. 이름으로 부르므로 번호를 틀릴 자리가 없다.
 *
 * 언어를 안 적으면 **설정에 있는 언어**다. 화면마다 손으로 적게 두면 한 곳만
 * 빠뜨려도 그 화면만 옛 언어로 남는다
 */
export async function loadUiText(
  bank: UiBank, locale: DataLocale = gameLocale(),
): Promise<string[]> {
  const { loadDialogueBank } = await import('./gameData')
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
  /** 사파리존의 「포기한다」와 남은 볼 창 (`StartMenu_Text_Retire` · `_SafariBalls` · `_ParkBalls`) */
  retire: 8, safariBalls: 9, parkBalls: 10,
  /**
   * "{N}개 남음" (`StartMenu_Text_BallStock`).
   *
   * ⚠️ **칸은 0이다.** 부호가 `{STRVAR_1 51, 0, 0}`인데 51은 「수」라는 종류고 칸이
   * 아니다 — 원작도 `StringTemplate_SetNumber(template, 0, …)`로 채운다
   * (`start_menu.c`). `fillMenuText(글, [String(남은 수)])`
   */
  ballStock: 11,
} as const

/**
 * 가방의 갈래 메뉴와 버리기 흐름 (`bag` 뱅크).
 *
 * 무엇이 메뉴에 오르는지는 `applications/bag/main.c`의 `MakeItemActionsMenu`가
 * 정한다 — 쓰는 쪽이 `ui/menu/BagScreen`의 `bagActions`다. 「쓴다」 자리는 물건에
 * 따라 글이 바뀐다(자전거를 타고 있으면 내린다 · 메일 주머니는 본다 · 빈 밭 앞의
 * 나무열매는 심는다 · 포핀케이스는 연다). 예·아니오는 이 뱅크의 82·83이 아니라
 * `YES_NO`다 — 가방도 `Menu_MakeYesNoChoice`(메뉴 뱅크)로 묻는다
 */
export const BAG_MENU = {
  use: 0, trash: 1, register: 2, give: 3, checkTag: 4, walk: 6, cancel: 8,
  check: 16, deselect: 18, plant: 95, open: 96,
  /** "{도구}\n어떻게 할까요?" — 메뉴 위에 뜨는 물음 (`Bag_Text_ItemIsSelected`) */
  selected: 42,
  /** 「건네준다」로 열린 가방에서 중요한 물건을 고르면 (`Bag_Text_ItemCantBeHeld`) */
  cantHold: 46,
  /** 버리기 — 개수 · 다 버렸다 · 괜찮나 · 개수 칸 `x{052}` (`Bag_Text_ThrowAway*`) */
  trashHowMany: 52, trashed: 53, trashOk: 54, trashCount: 84,
} as const

/**
 * 파티 메뉴 뱅크에서 도구·메일을 지니게 할 때의 줄.
 *
 * 가방의 「건네준다」는 원작에서 파티 화면으로 넘어가 `ProcessItemApplication`이
 * 말한다. 메일박스의 「지니게 한다」는 `PartyMenu_GiveMail`이 말한다.
 * 칸은 0 별명 · 1 도구 · 2 새 도구다
 */
export const PARTY_GIVE = {
  /** "어느 포켓몬에게 건네줄까?" (`PartyMenu_Text_GiveToWhichMon`) */
  which: 31,
  mustRemoveMail: 77,
  /** "{0} 이미 {1} 지니고 있습니다 … 교환하겠습니까?" */
  swapAsk: 78,
  /** "{1} 가져오고 {2} 지니게 했습니다!" */
  swapped: 84,
  /** "{0}에게 {1} 지니게 했다!" */
  given: 118,
  /** 메일박스에서 — "박스에서 메일을 옮겼습니다" · "이미 도구를 지니고 있으므로…" */
  mailMoved: 127,
  mailHeld: 128,
  /** 백금옥을 기라티나가 아닌 마리에게 (`PartyMenu_Text_MonCannotHoldItem`) */
  cannotHold: 203,
} as const

/**
 * 볼캡슐 편집기 (`unk_0008` 뱅크 · `overlay076`). 0~6이 단추 일곱이고 7~16이 말 열이다
 */
export const CAPSULE_TEXT = {
  edit: 0, quit: 1, set: 2, remove: 3, shift: 4, confirm: 5, cancel: 6,
  /** "캡슐을 고르십시오" */
  choose: 7,
  /** "어떻게 하겠습니까?" */
  ask: 8,
  /** "캡슐을 뗐다" */
  removed: 9,
  /** "어느 캡슐과 바꾸겠습니까?" */
  shiftWith: 10,
  switched: 11,
  finished: 12,
  confirming: 13,
  /** "캡슐 디자인을 바꾸지 않고 그만둘까요?" */
  quitAsk: 14,
  noRoom: 15,
  noSeals: 16,
} as const

/** 파티 화면의 캡슐 말 (`PartyMenu_Text_BallCapsuleWasSet` 129 · `TwoCapsulsesCantBeSet` 130) */
export const PARTY_CAPSULE = { wasSet: 129, two: 130 } as const

/**
 * 메일박스 (`mailbox` 뱅크 · `unk_020722AC.c`).
 *
 * 1~4가 갈래 넷이고 그 차례가 원작 목록의 반환값(0 읽는다 · 1 지운다 · 2 지니게
 * 한다 · 3 그만둔다)이다. 6~11은 `6 + 번호`로 집어 쓰는 말 여섯이다
 */
export const MAILBOX_TEXT = {
  title: 0, read: 1, erase: 2, give: 3, cancel: 4,
  /** "{주인 이름}의\n메일을 어떻게 하겠습니까?" */
  ask: 6,
  /** "내용은 지워져 버립니다\n괜찮겠습니까?" */
  eraseAsk: 7,
  /** "내용을 지웠습니다\r포켓몬에게 지니게 하겠습니까?" */
  erasedGive: 8,
  toBag: 9, bagFull: 10,
  /** "메일을 지니게 하지 않았습니다" — 지니게 할 마리를 안 고르고 물러났을 때 */
  notGiven: 11,
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
  ask: 13, overwrite: 14, writing: 15, done: 16, failed: 18,
  /** 「리포트에 많은 내용을 기록 중입니다 전원을 끄지 않도록 해주십시오」 — 오래 걸릴 때 */ writingFull: 21,
} as const

/**
 * 예·아니오 (`TEXT_BANK_MENU_ENTRIES` 41·42).
 *
 * ⚠️ **리포트 뱅크(`common_strings`)에는 예·아니오가 없다.** 한동안 그 뱅크의
 * 82·83을 예·아니오로 읽었는데 그 두 줄은 센터 지하 안내원과 포켓치 설명원의
 * 대사다 — 리포트 물음 밑에 「죄송합니다 지하는 조정 중이므로…」가 답으로 떴다
 * (실측 2026-09-21 · 한국·미국 롬 둘 다). 예·아니오는 세 뱅크에 있고
 * (220 옵션 50·51 · 361 메뉴 41·42 · 11 배틀), 옵션 것이 아닌 자리는 이것을 쓴다
 */
export const YES_NO = { yes: 41, no: 42 } as const

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
  /** 닫을 때 한 번 묻는다 — 「선택하신 설정으로 변경하시겠습니까?」 (결정) */ confirmChanges: 49,
  /** 「닫는다」 줄의 설명 — 「게임으로 돌아갑니다」 */ closeHelp: 52,
} as const

/** 타이틀 화면 (`main_menu_options`) */
export const MAIN_MENU = { continue_: 0, newGame: 1, player: 12, playtime: 13, dex: 14, badges: 15 } as const

/**
 * 인트로 (`rowan_intro`). 자리는 디컴프 `res/text/rowan_intro.json`의 줄 순서다.
 *
 * 2~5번(조작 설명)은 **DS 하드웨어 이야기다** — 십자키·터치스크린·X/Y 아이콘.
 * 우리에게는 그 넷 다 없으므로 **하나도 안 쓴다.** 그 자리에서 마박사는 실제로
 * 묶여 있는 키를 말한다 (`engine/intro/controlText`). 원작 글을 고쳐 쓰지는
 * 않는다 — 안 맞는 것을 빼기만 한다.
 */
export const INTRO_TEXT = {
  hello: 0,
  myName: 1,
  /** 2·3번은 십자키와 X·Y, 4·5번은 터치스크린 — 넷 다 우리 화면에 없다 */
  controlsSkipped: [2, 3, 4, 5],
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
export const NAMING_TEXT = {
  player: 0, pokemon: 1, box: 2, rival: 3,
  /** 224번도로 석판 — 「고맙다고 전하고 싶은 상대는?」 */
  tablet: 6,
} as const

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
  /** `box_messages` 뱅크 — 머리 메뉴의 물음 셋 (`BoxText_JumpToBox` · `_PickTheme` · `_Wallpaper`) */
  jumpToBox: 8,
  pickTheme: 9,
  pickWallpaper: 10,
  /** `box_messages` 뱅크 — 마리 상세의 이름표 넷 (`성격` · `Lv.` · `HP` · `기술`) */
  nature: 35, level: 36, hp: 37, moves: 43,
  /** 「데리고 갈 포켓몬을 선택하십시오!」 — 맡긴 마리 꺼내기 */ pickWithdraw: 18,
  /** 「박스를 종료하겠습니까?」 — 결정에 따라 **묻지 않는다.** 번호만 적어 둔다 */ confirmExit: 11,
  /** 「박스 조작을 계속하겠습니까?」 */ continueOps: 12,
  /** 「포켓몬을 쥐고 있습니다!」 */ holding: 17,
  /** 알림 줄 — 「가방이 가득 찼습니다!」 · 「메일은 가져올 수 없습니다!」 · 「알은 도구를 지닐 수 없습니다!」 · 「{도구} 지닐 수 없다!」 */
  bagFull: 14, noMail: 24, eggNoItem: 34, cannotHold: 45,
  /** `box_messages` 뱅크 */
  partyFull: 5,
  lastMon: 6,
  boxFull: 13,
  noItem: 20,
  /** "{별명} 어떻게 하겠습니까?" · "마킹해 주십시오" (`BoxText_MonSelected` · `_MarkMon`) */
  monSelected: 0,
  markMon: 1,
  /**
   * 놓아주기 (`BoxAppMan_ReleaseMonAction`).
   *
   * ⚠️ **원작은 한 번만 묻는다** — "정말 놓아주겠습니까?"에 예·아니오, 커서는
   * **아니오**에서 시작한다(`BoxMenu_FillYesNo(…, 1)`). 놓은 뒤 "{별명} 밖에
   * 놓아주었다" → "바이바이, {별명}!"이 이어진다
   */
  releaseAsk: 2,
  released: 3,
  releasedBye: 4,
  /**
   * 묻기 전에 막는 줄 (`BoxAppMan_CheckReleaseMonValid`) — 알 · 메일 · 볼캡슐.
   * 마지막 마리는 위의 `lastMon`이다
   */
  releaseEgg: 31,
  releaseMail: 30,
  releaseCapsule: 29,
  /**
   * 비전기술 — **묻고 난 뒤에** 갈린다 (`BoxAppMan_CheckShouldMonReturn`).
   * 그 기술(`sReleaseBlockingMoves`)을 아는 마지막 마리면 "되돌아와 버렸다!" →
   * "걱정했었나..."로 놓아주기가 무른다
   */
  releaseReturned: 32,
  releaseWorried: 33,
} as const

/** PC 메뉴의 항목 (`menu_entries`). 65 + 갈래 번호가 보관 시스템의 다섯 갈래다 */
export const PC_MENU = { storageModes: 65 } as const

/**
 * 상점에서 파는 흐름의 줄 (`bag` 뱅크 7의 74~77).
 *
 * 원작은 개수가 하나면 개수를 안 묻고 곧바로 값을 말한다 (`ask`) — 그다음에 확인하면 `done`이다.
 * 가방 화면이 같은 뱅크를 읽으므로 한 자리에 둔다
 */
export const SELL_TEXT = { cannot: 74, howMany: 75, ask: 76, done: 77 } as const

/** 가방 뱅크가 상점 글까지 갖고 있다 (`TEXT_BANK_BAG`) */
export const SHOP_TEXT = {
  /** "{도구}은 {값}원입니다" 대신 우리는 목록에 값을 바로 붙인다. 여기 것은 흐름 글이다 */
  howManySell: 75, money: 78, yes: 82, no: 83, close: 94,
} as const
