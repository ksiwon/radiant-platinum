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

  // ── 걸림과 풀림 · 개체 (PARITY §2.25 · `-start`·`-end`) ───────────────────
  /** 아쿠아링 */ surroundedItselfWithAVeilOfWater: 1027,
  /** 헤롱헤롱이 걸렸다 */ fellInLove: 162,
  /** 헤롱헤롱이 풀렸다 */ gotOverItsInfatuation: 1213,
  /** 참기가 풀렸다 */ unleashedEnergy: 335,
  /** 조이기 */ wasSqueezedByPokemon: 235,
  /** 충전 */ beganChargingPower: 487,
  /** 조개무지 */ clampedPokemon: 255,
  /** 저주. 첫 칸이 **거는 쪽**이다 */ cutItsOwnHPAndLaidACurseOnPokemon: 417,
  /** 사슬묶기가 걸렸다 */ moveWasDisabled: 366,
  /** 사슬묶기가 풀렸다 */ isNoLongerDisabled: 369,
  /** 파멸의소원 */ choseMoveAsItsDestiny: 478,
  /** 잠금 */ cantUseItemsAnymore: 1135,
  /** 잠금이 풀렸다 */ canUseItemsAgain: 1138,
  /** 앙코르가 걸렸다 */ receivedAnEncore: 372,
  /** 앙코르가 풀렸다 */ encoreEnded: 375,
  /** 회오리불꽃·소용돌이 */ wasTrappedInAVortex: 242,
  /** 기합모으기 */ isGettingPumped: 276,
  /** 미래를읽기 */ foresawAnAttack: 472,
  /** 힐블록이 걸렸다 */ wasPreventedFromHealing: 1051,
  /** 봉인 */ sealedTheOpponentsMoves: 562,
  /** 뿌리박기가 걸렸다 */ plantedItsRoots: 536,
  /** 씨뿌리기가 걸렸다 */ wasSeeded: 290,
  /** 씨뿌리기가 풀렸다. 기술 이름을 빈칸으로 받는다 */ wasFreedFromMove: 265,
  /** 마그마스톰 */ becameTrappedBySwirlingMagma: 1247,
  /** 전자부유가 걸렸다 */ levitatedOnElectromagnetism: 1033,
  /** 전자부유가 풀렸다 */ electromagnetismWoreOff: 1039,
  /** 흉내내기 */ learnedMove2: 836,
  /** 심안·마음의눈이 정체를 꿰뚫었다. 첫 칸이 **쓴 쪽**이다 */ identifiedPokemon: 432,
  /** 악몽 */ beganHavingANightmare: 411,
  /** 파워트릭 */ switchedItsAttackAndDefense: 1009,
  /** 모래지옥 */ wasTrappedBySandTomb: 245,
  /** 비축 */ stockpiledX: 317,
  /** 비축이 풀렸다 */ stockpiledEffectWoreOff: 994,
  /** 대타가 나왔다 */ madeASubstitute: 348,
  /** 대타가 사라졌다 */ substituteFaded: 357,
  /** 도발이 걸렸다 */ fellForTheTaunt: 500,
  /** 도발이 풀렸다. 기술 이름을 빈칸으로 받는다 */ tauntWoreOff: 1257,
  /** 트집 */ wasSubjectedToTorment: 494,
  /** 개체에 걸린 것이 풀렸다. 기술 이름을 빈칸으로 받는다 */ moveWoreOff: 1060,
  /** 시끄럽게 */ causedAnUproar: 308,
  /** 시끄럽게가 그쳤다 */ calmedDown: 314,
  /** 조이기(감기) */ wasWrappedByPokemon: 248,
  /** 하품. 첫 칸이 **건 쪽**이다 */ madePokemonDrowsy: 545,
  /** 혼란이 걸렸다 */ becameConfused: 156,
  /** 혼란이 풀렸다 */ snappedOutOfConfusion: 153,

  // ── 특성이 걸어 둔 것 ─────────────────────────────────────────────────────
  /** 타오르는불꽃 */ abilityRaisedThePowerOfItsFireTypeMoves: 656,
  /** 프레셔 */ isExertingItsAbility: 1238,
  /** 슬로스타트가 걸렸다 */ cantGetItGoingBecauseOfItsAbility: 1112,
  /** 슬로스타트가 풀렸다 */ finallyGotItsActTogether: 1115,

  // ── 걸림과 풀림 · 진영 (`-sidestart`·`-sideend`) ──────────────────────────
  //
  // ⚠️ **두 줄이 한 벌이다.** 롬은 우리 편과 상대를 **다른 줄**로 들고 있고
  // (「우리 편은…」 · 「상대는…」) 이름 빈칸이 없어서 이름표로는 못 덮는다.
  // 그래서 이쪽만 자리에 따라 번호를 고른다
  /** 빛의장막. 기술 이름을 빈칸으로 받는다 */ moveRaisedYourTeamsSpecialDefense: 190,
  /** 리플렉터. 기술 이름을 빈칸으로 받는다 */ moveRaisedYourTeamsDefense: 194,
  /** 신비의부적이 깔렸다 */ yourTeamBecameCloakedInAMysticalVeil: 198,
  /** 신비의부적이 걷혔다 */ yourTeamIsNoLongerProtectedBySafeguard: 203,
  /** 흰안개가 깔렸다 */ yourTeamBecameShroudedInMist: 271,
  /** 진영에 걸린 것이 걷혔다. 기술 이름을 빈칸으로 받는다 */ yourTeamsMoveEffectWoreOff: 288,
  /** 압정뿌리기 */ spikesWereScatteredAllAroundYourTeamsFeet: 427,
  /** 독압정이 깔렸다 */ poisonSpikesWereScatteredAllAroundYourTeamsFeet: 1063,
  /** 독압정이 걷혔다 */ thePoisonSpikesDisappearedFromAroundYourTeamsFeet: 1065,
  /** 스텔스록 */ pointedStonesFloatInTheAirAroundYourTeam: 1077,
  /** 순풍이 불었다 */ theTailwindBlewFromBehindYourTeam: 1230,
  /** 순풍이 멎었다 */ yourTeamsTailwindPeteredOut: 1232,
  /** 행운의부적이 깔렸다 */ theLuckyChantShieldedYourTeamFromCriticalHits: 1241,
  /** 행운의부적이 걷혔다 */ yourTeamsLuckyChantWoreOff: 1085,

  // ── 무대 전체 (`-fieldstart`·`-fieldend`) ─────────────────────────────────
  /** 트릭룸이 걸렸다 */ twistedTheDimensions: 1070,
  /** 트릭룸이 풀렸다 */ restoredTheTwistedDimensions: 1073,
  /** 중력 */ gravityIntensified: 997,
} as const

type MessageKey = keyof typeof MSG

/**
 * 진영 줄은 **두 줄이 한 벌**이다.
 *
 * 롬은 「우리 편은 …」과 「상대는 …」을 아예 다른 줄로 들고 있고 그 줄에는 이름
 * 빈칸이 없다 — 그래서 이쪽만은 이름표로 못 덮고 자리에 따라 번호를 골라야 한다.
 * 열넷 전부 **우리 편 줄 바로 다음이 상대 줄**이고, 그것을 `romText.test.ts`가
 * 이름표로 확인한다 (상대 줄 이름에는 `Foe`나 `Enemy`가 들어 있다).
 */
export const SIDE_KEYS: readonly MessageKey[] = [
  'moveRaisedYourTeamsSpecialDefense', 'moveRaisedYourTeamsDefense',
  'yourTeamBecameCloakedInAMysticalVeil', 'yourTeamIsNoLongerProtectedBySafeguard',
  'yourTeamBecameShroudedInMist', 'yourTeamsMoveEffectWoreOff',
  'spikesWereScatteredAllAroundYourTeamsFeet',
  'poisonSpikesWereScatteredAllAroundYourTeamsFeet',
  'thePoisonSpikesDisappearedFromAroundYourTeamsFeet',
  'pointedStonesFloatInTheAirAroundYourTeam',
  'theTailwindBlewFromBehindYourTeam', 'yourTeamsTailwindPeteredOut',
  'theLuckyChantShieldedYourTeamFromCriticalHits', 'yourTeamsLuckyChantWoreOff',
]

/** 우리 편 줄 번호 → 그 자리의 줄 번호 */
export function forSide(at: number, mine: boolean): number {
  return mine ? at : at + 1
}
