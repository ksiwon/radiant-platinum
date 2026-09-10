// 배틀 글의 줄 번호 (PARITY §2.24 · DATA.md §2.11)
//
// **배틀 글은 우리가 짓지 않는다.** 롬의 배틀 글 뱅크(`battle_strings` · us 368)에
// 1,269줄이 들어 있고, 화면에 뜨는 것은 그 줄 자체다. 이 파일이 드는 것은 그
// 안의 **줄 번호**뿐이다.
//
// ⚠️ **왜 이렇게 바꿨나.** 한동안 이 글을 `messages.ts`가 한국어로 손수 들고
// 있었다. 롬이 있는 기계에서 마흔여덟 줄을 처음 맞대 보니 **일곱만 맞았다** —
// 「목을 움츠렸다」가 「머리를」이 되고, 「분신」이 「대타」가 되고, 「신비의 베일」이
// 「신비의부적」이 되고, 롬에 아예 없는 문장이 둘 섞여 있었다.
//
// 줄 번호가 어느 줄인지는 **디컴프의 이름표와 맞대 본다** (`romText.test.ts`).
// 그 시험은 롬이 없어도 돈다 — 이름표(`import/platinum/battleStrings`)는 이름의
// 순서일 뿐 롬에서 읽은 값이 아니라서 저장소 안에 있다.
//
// ⚠️ **자리 표시는 이름표가 만든다.** 롬은 「우리 편·야생·상대」를 세 줄로 따로
// 들고 있는데(`_Ally`·`_Wild`·`_Foe`가 나란히 붙어 있다) 우리는 **맨 줄 하나만**
// 쓰고 「야생 」·「상대 」를 이름에 붙여 넣는다. 뱅크 1,269줄에 「야생의」는
// **0건**이고 「야생 」이 344건이라, 이름표를 롬의 말로 맞추면 두 길이 같은 글이
// 된다.

/** `TEXT_BANK_BATTLE_STRINGS` — 미국 롬 기준 뱅크 번호 */
export const BATTLE_BANK = 368

/**
 * 뱅크 안의 줄 번호. 키는 디컴프의 `BattleStrings_Text_…` 이름을 낮춰 쓴 것이고,
 * `romText.test.ts`가 키마다 그 이름을 다시 적어 번호와 맞대 본다.
 *
 * ⚠️ **여기 없는 효과는 조용하다.** 롬에 줄이 없는 것(점착·선제공격손톱·
 * 틀깨기·날씨부정·하늘의은총 특성 계통)은 지어내지 않고 비운다 — 그 목록은
 * PARITY §2.24가 센다.
 */
export const MSG = {
  // ── 모으는 기술의 첫 턴 (`-prepare`) ──────────────────────────────────────
  /** 날아오르기 */ flewUpHigh: 223,
  /** 구멍파기 */ burrowedUnderTheGround: 226,
  /** 다이빙 */ hidUnderwater: 229,
  /** 튀어오르기(기술) */ sprangUp: 232,
  /** 칼바람 */ whippedUpAWhirlwind: 211,
  /** 로케트박치기 */ tuckedInItsHead: 217,
  /** 하늘의은총 */ becameCloakedInAHarshLight: 220,
  /** 솔라빔 */ absorbedLight: 214,
  /** 섀도다이브 */ vanishedInstantly: 1082,

  // ── 효과가 일한 줄 (`-activate` · `-block`) ───────────────────────────────
  /** 방어·판별이 **막은** 줄. 쓰는 줄은 `protectedItself2`다 */ protectedItself: 15,
  /** 대타출동이 대신 맞았다 */ theSubstituteTookDamageForPokemon: 354,
  /** 버티기가 1을 남겼다 */ enduredTheHit: 445,
  /** 치유방울 */ aBellChimed: 821,
  /** 아로마테라피 (`-cureteam`도 이 줄이다) */ aSoothingAromaWaftedThroughTheArea: 592,
  /** 흰안개가 막았다 */ isProtectedByMist: 273,
  /** 신비의부적이 막았다 — 롬은 이 기술을 「신비의 베일」이라 부른다 */
  isProtectedBySafeguard: 200,
  /** 트릭·바꿔치기 */ switchedItemsWithItsTarget: 510,
  /** 매그니튜드. 느낌표가 **둘**이다 */ magnitudeX: 448,
  /** 참기 */ isStoringEnergy: 332,
  /** 헤롱헤롱이 발이 묶은 턴 */ isInLoveWithPokemon: 165,
  /** 길동무가 실제로 데려갔다 */ tookPokemonDownWithIt: 391,
  /** 가로챈다가 실제로 가로챘다 */ snatchedPokemonsMove: 580,
  /** 혼란이 도는 턴 */ isConfused: 150,
  /** 뿌리박기가 날려버리기를 버텼다 */ anchoredItselfWithItsRoots: 542,
  /** 흡반이 버텼다 */ anchorsItselfWithAbility: 659,
  /** 록온·마음의눈 */ tookAimAtPokemon: 378,
  /** 스케치 */ sketchedMove: 385,
  /** 튀어오르기(효과) */ butNothingHappened: 795,

  // ── 무대 전체 (`-fieldactivate`) ──────────────────────────────────────────
  /** 멸망의노래 */ allPokemonHearingTheSongWillFaintInThreeTurns: 822,
  /** 페이데이 */ coinsScatteredEverywhere: 818,

  // ── 이번 턴에만 (`-singleturn`) ───────────────────────────────────────────
  /** 방어·판별을 **쓴** 줄 */ protectedItself2: 282,
  /** 기합펀치 */ isTighteningItsFocus: 497,
  /** 버티기를 쓴 줄 */ bracedItself: 442,
  /** 매직코트 */ shroudedItselfWithMagicCoat: 571,
  /** 가로챈다를 건 줄 */ waitsForATargetToMakeAMove: 577,
  /** 나를따라와 */ becameTheCenterOfAttention: 484,
  /** 도우미. 첫 칸이 **돕는 쪽**이다 */ isReadyToHelpPokemon: 503,

  // ── 다음 기술 한 번만 (`-singlemove`) ─────────────────────────────────────
  /** 길동무를 건 줄 */ isTryingToTakeItsFoeWithIt: 388,
  /** 원한 */ wantsTheFoeToBearAGrudge: 565,

  // ── 낱줄 ──────────────────────────────────────────────────────────────────
  /** 연타 (`-hitcount`) */ hitXTimes: 46,
  /** 겨눌 자리가 없다 (`-notarget`) */ butThereWasNoTarget: 1234,
  /** 일격필살 (`-ohko`) */ itsAOneHitKO: 775,
  /** 위장약 (`-endability`) */ pokemonsAbilityWasSuppressed: 1012,
} as const

export type MessageKey = keyof typeof MSG
