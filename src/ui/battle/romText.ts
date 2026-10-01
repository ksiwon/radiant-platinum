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

import type { BoostStat } from '../../engine/battle/events'

/**
 * `TEXT_BANK_BATTLE_PARTY` — 배틀 파티 화면. 60이 「중요한 기술입니다. 잊게 할 수
 * 없습니다!」(`BattleParty_Text_HMMovesCantBeForgotten`)다
 */
export const BATTLE_PARTY_BANK = 3
export const BATTLE_PARTY_HM_CANT_FORGET = 60

/** `TEXT_BANK_BATTLE_STRINGS` — 미국 롬 기준 뱅크 번호 */
export const BATTLE_BANK = 368

/**
 * `TEXT_BANK_MOVES_USED_IN_BATTLE` — 기술을 쓰는 줄만 든 뱅크 (us 0 · 1,404줄).
 *
 * 「{이름}의 줄바꿈 {기술}!」이 **기술마다 통째로** 들어 있다. 우리가 이름과 기술을
 * 따로 붙이면 줄바꿈이 사라지고(원작은 이름 뒤에서 줄을 바꾼다) 기술 이름표가
 * 없는 순간 영어가 샌다
 */
export const MOVE_BANK = 0

/**
 * `TEXT_BANK_POKEMON_STAT_NAMES` — 랭크 이름 아홉 (us 551).
 *
 * 롬의 랭크 줄이 능력 이름을 빈칸으로 받는다. 아홉 줄뿐이라 무게가 없다
 */
export const STAT_BANK = 551

/**
 * 기술 번호 → 그 줄의 자리.
 *
 * 자리는 `번호 × 3`이고 그 다음 둘이 야생·상대 줄이다. 우리는 자리 표시를
 * 이름표가 붙이므로 맨 줄만 쓴다 (`forSide`와 같은 결이지만 여기는 **이름 빈칸이
 * 있어서** 맨 줄 하나로 셋을 덮는다).
 *
 * 규칙이 맞는다는 근거: 기술 이름표 467개 전부가 제 자리 줄 안에 들어 있다
 * (`romText.test.ts`). 0·1·2번은 「!」뿐인 빈 줄이다 — 기술 0번 자리다
 */
export function moveUsedLine(move: number): number {
  return move * 3
}

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

  // ── 판의 뼈대 (PARITY §2.24) ─────────────────────────────────────────────
  //
  // 매 턴 뜨는 줄들이다. 여기도 한동안 손으로 들고 있었고, 롬과 맞대 보니
  // 「효과가 별로인 것 같다…」가 원작에서는 「효과가 별로인 듯하다」였고
  // 「가라!」가 「가랏!」이었다
  /** 등판 — 우리 쪽 */ goPokemon: 979,
  /** 등판 — 야생 */ aWildPokemonAppeared: 965,
  /** 날려버리기·울부짖기로 끌려 나왔다 */ wasDraggedOut: 603,
  /** 쓰러졌다 */ pokemonFainted: 30,
  /** 효과가 굉장 */ itsSuperEffective: 780,
  /** 효과가 별로 */ itsNotVeryEffective: 779,
  /** 효과가 없다 */ itDoesntAffectPokemon: 27,
  /** 급소 */ aCriticalHit: 774,
  /** 겨눈 쪽을 알 때 */ pokemonAvoidedTheAttack: 24,
  /** 겨눈 쪽을 모를 때 — 쓴 쪽 이름이 들어간다 */ pokemonsAttackMissed: 12,
  /** 실패 */ butItFailed: 796,
  /** 체력 회복 */ pokemonRegainedHealth: 184,

  // 상태이상에 걸린 순간
  /** 잠 */ pokemonFellAsleep: 47,
  /** 독 */ pokemonWasPoisoned: 63,
  /** 맹독 */ pokemonWasBadlyPoisoned: 79,
  /** 화상 */ pokemonWasBurned: 85,
  /** 얼음 */ pokemonWasFrozenSolid: 101,
  /** 마비 */ pokemonIsParalyzedItMayBeUnableToMove: 120,

  // 상태이상이 나은 순간
  /** 잠에서 깼다 */ pokemonWokeUp: 1210,
  /** 해독됐다 */ pokemonWasCuredOfItsPoisoning: 1207,
  /** 화상이 나았다 */ pokemonsBurnWasHealed: 1209,
  /** 얼음이 녹았다 */ pokemonThawedOut: 114,
  /** 마비가 풀렸다 */ pokemonWasHealedOfParalysis: 136,

  // 못 움직인 까닭
  /** 자고 있다 */ pokemonIsFastAsleep: 299,
  /** 얼어 있다 */ pokemonIsFrozenSolid: 111,
  /** 몸이 저리다 */ pokemonIsParalyzedItCantMove: 130,
  /** 풀이 죽었다 */ pokemonFlinched: 181,
  /** 반동으로 쉰다 */ pokemonMustRecharge: 360,
  /** 도발당해 못 쓴다. 기술 이름을 빈칸으로 받는다 */ cantUseMoveAfterTheTaunt: 613,
  /** 헤롱헤롱해서 못 움직인다 */ pokemonIsImmobilizedByLove: 172,

  // 랭크. 원작은 한 단계와 두 단계 위만 가른다 — 「쭉쭉」도 「뚝」도 없다
  /** 올라갔다 */ pokemonsStatRose: 750,
  /** 크게 올라갔다 */ pokemonsStatSharplyRose: 753,
  /** 떨어졌다 */ pokemonsStatFell: 762,
  /** 크게 떨어졌다 */ pokemonsStatHarshlyFell: 765,
  /** 흑안개 */ allStatChangesWereEliminated: 817,

  // 날씨. 시작·머무름·그침이 다 따로다
  /** 비 */ itStartedToRain: 799,
  /** 비가 이어진다 */ rainContinuesToFall: 801,
  /** 비가 그쳤다 */ theRainStopped: 803,
  /** 모래바람 */ aSandstormBrewed: 804,
  /** 모래바람이 이어진다 */ theSandstormRages: 805,
  /** 모래바람이 그쳤다 */ theSandstormSubsided: 806,
  /** 햇살 */ theSunlightTurnedHarsh: 807,
  /** 햇살이 이어진다 */ theSunlightIsStrong: 808,
  /** 햇살이 약해졌다 */ theSunlightFaded: 809,
  /** 싸라기눈 */ itStartedToHail: 810,
  /** 싸라기눈이 이어진다 */ hailContinuesToFall: 811,
  /** 싸라기눈이 그쳤다 */ theHailStopped: 812,
  /** 날씨가 때린다. 첫 칸이 **날씨 이름**이다 */ isBuffetedByTheWeather: 285,

  // 매 턴 깎이는 것
  /** 독 데미지 */ pokemonIsHurtByPoison: 73,
  /** 화상 데미지 */ pokemonIsHurtByItsBurn: 95,

  // 볼과 도망. 흔들린 횟수만큼 줄이 이어져 있다 (863 + 흔들린 수)
  /** 붙잡았다 */ gotchaPokemonWasCaught: 867,
  // 잡는 법 강습 둘째 턴 — 동료의 성별로 갈린다 (`+ BattleSystem_GetTrainerGender(…, 0)`: 남자 0 · 여자 1)
  /** 「좋아! 체력을 줄였다…」 (빛나) */ allRightIGotItsHPDownTimeToThrowAPokeBall: 1226,
  /** 「OK! 체력이 줄었어…」 */ okTheGotIsHPDownTimeItsReadyForAPokeBall: 1227,
  /** 0번 흔들렸다 */ ohNoThePokemonBrokeFree: 863,
  /** 무사히 도망쳤다 */ gotAwaySafely: 781,
  /** 못 도망친다 */ cantEscape: 42,

  /** 중력이 풀렸다 */ gravityReturnedToNormal: 1004,
  /** 기술에 매 턴 깎인다. 기술 이름을 빈칸으로 받는다 */ pokemonIsHurtByMove: 262,
  /** 씨뿌리기가 빨아간다 */ healthIsSappedByLeechSeed: 296,
  /** 압정을 밟았다 */ isHurtByTheSpikes: 429,
  /** 스텔스록이 박혔다 */ pointedStonesDugIntoPokemon: 1079,

  // 판이 끝난 뒤
  /** 경험치 */ pokemonGainedExpPoints: 1,
  /** 레벨이 올랐다 */ pokemonGrewToLevel: 3,
  /** 기술을 배웠다 */ pokemonLearnedMove: 4,
  /** 상금 */ playerGotMoneyForWinning: 33,

  // 말을 안 듣는 네 마디 (PARITY §2.18). 828부터 넷이 차례로 이어져 있다
  /** 자면서 무시 */ pokemonIgnoredOrdersWhileAsleep: 825,
  /** 그냥 무시 */ pokemonIgnoredOrders: 826,
  /** 낮잠 */ pokemonBeganToNap: 827,
  /** 아무것도 안 한 네 마디의 첫 자리 */ pokemonIsLoafingAround: 828,
  /** 말을 듣지 않는다 */ pokemonWontObey: 829,
  /** 혼란으로 자기를 때렸다 */ itHurtItselfInItsConfusion: 797,
  /** 야생이 달아났다 */ theWildPokemonFled: 784,

  // 사파리
  /** 먹이를 던졌다 */ playerThrewSomeBaitAtThePokemon: 851,
  /** 먹고 있다 */ pokemonIsEating: 852,
  /** 먹는 데 빠졌다 */ pokemonIsBusyEating: 853,
  /** 진흙을 던졌다 */ playerThrewMudAtThePokemon: 854,
  /** 화내고 있다 */ pokemonIsAngry: 855,
  /** 이성을 잃었다 */ pokemonIsBesideItselfWithAnger: 856,
  /** 상황을 살피고 있다 */ pokemonIsWatchingCarefully: 849,

  /** 가방에서 도구를 썼다 */ playerUsedOneItem: 857,

  // ── 트레이너를 **두 칸으로** 받는 줄 (PARITY §2.24) ─────────────────────────
  //
  // 롬은 분류(「체육관 관장」)와 이름(「동관」)을 따로 받는다. 우리가 한동안
  // 「체육관 관장 동관」으로 **합쳐** 들고 있어서 이 줄들만 손 글이었다.
  // 분류가 없는 상대(통신·배틀팩토리)에게는 롬이 **이름 한 칸짜리 줄**을 따로
  // 들고 있다 — 그 짝이 아래 `…LinkTr…`이다
  /** 「{분류} {이름}은 / 승부를 걸어왔다!」 */ youAreChallengedByTr: 969,
  /** 분류 없는 짝 */ youAreChallengedByLinkTr: 970,
  /** 「{분류} {이름}과의 / 승부에서 이겼다!」 */ playerDefeatedTr: 839,
  /** 분류 없는 짝 */ playerDefeatedLinkTr: 785,
  /** 「{분류} {이름}은 / {포켓몬}을 내보냈다!」 */ trSentOutPokemon: 972,
  /** 분류 없는 짝 */ linkTrSentOutPokemon: 974,
  /** 「{분류} {이름}은 / {도구}를 썼다!」 */ trUsedOneItem: 858,

  // ── 트레이너가 둘 이상인 판 (PARITY §2.2b · `battle_display.c` 5985~6150) ────────
  //
  // 원작은 첫 등판·걸어옴·이김을 **한 창에 두 사람을** 담는 줄로 따로 들고 있다.
  // 한 줄씩 두 번 찍으면 창이 둘로 갈리고 차례도 원작과 어긋난다
  /** 「{분류1} {이름1}과 / {분류2} {이름2}가 / 승부를 걸어왔다!」 */ youAreChallengedByTr1AndTr2: 992,
  /** 「{분류1} {이름1}은 {포켓몬1}을 내보냈다! / {분류2} {이름2}는 {포켓몬2}를…」 */
  tr1SentOutPokemon1Tr2SentOutPokemon2: 991,
  /** 한 사람의 더블 — 「{분류} {이름}은 / {포켓몬1}과 {포켓몬2}를 내보냈다!」 */
  trSentOutPokemon1AndPokemon2: 973,
  /** 편이 있는 판 — 「{분류} {이름}은 {편의 포켓몬}을 내보냈다! / 가랏! {내 포켓몬}!」 */
  trSentOutPokemon1GoPokemon2: 993,
  /** 내가 두 자리를 채우는 더블 — 「가랏! {포켓몬1}! {포켓몬2}!」 */ goPokemon1AndPokemon2: 978,
  /** 편과 함께 만난 야생 둘 — 「앗! 야생 {포켓몬1}과 / {포켓몬2}가 튀어나왔다!」 */
  aWildPokemonAndPokemonAppeared: 967,
  /** 「{분류1} {이름1}과 / {분류2} {이름2}의 / 승부에서 이겼다!」 */ playerBeatTr1AndTr2: 953,
  /**
   * 시합규칙 「교체」 — 세 칸짜리 한 줄에 물음까지 들어 있다.
   *
   * 끝의 `{SCREEN 0}`은 예/아니오 창을 여는 부호다. `tokensToText`가 빈 글자로
   * 지우므로 화면에는 안 남는다 — 묻는 창은 우리 쪽이 따로 띄운다
   */
  willYouSwitchYourPokemon: 835,
  /**
   * 진 판의 세 줄 (`subscript_battle_lost.s`).
   *
   * ⚠️ **원작은 한 줄이 아니라 셋을 잇는다** — 「싸울 수 있는 포켓몬이
   * 없다!」(36) 다음에 잃은 돈 줄(34·35)이 오고, 「... ... ... ...」(38)이 한 창을
   * 다 쓰고 나서야 「눈앞이 캄캄해졌다!」(37)다
   */
  playerIsOutOfUsablePokemon: 36,
  /** 「{이름}은 / 눈앞이 캄캄해졌다!」 */ playerBlackedOut: 37,
  /** 「... ... ... ...」 — 칸이 없는 한 창 */ blackedOutDotDotDot: 38,
  /**
   * 진 판에 잃은 돈 (`BtlCmd_PayPrizeMoney` → `BattleSystem_CalcMoneyPenalty`).
   * 야생에서 지면 「당황해서 … 잃어버렸다!」, 트레이너에게 지면 「… 지불했다」다
   * (`subscript_battle_lost.s` — `BATTLE_TYPE_TRAINER`로 가른다). 0원이면 둘 다 안 뜬다
   */
  playerDroppedMoneyInPanic: 34,
  /** 〃 트레이너에게 졌다 */ playerPaidOutMoneyToTheWinner: 35,
  /**
   * 「{상대}의 / 승부에서 비겼다!」 (789).
   *
   * ⚠️ **롬이 비긴 판을 말하는 자리는 통신뿐이다** (`LoadResultMessage`가
   * `BATTLE_RESULT_DRAW`를 통신에서만 읽는다). 그래서 이름 칸이 하나고,
   * 분류·이름 두 칸짜리 짝(961)은 **어느 스크립트도 안 가리킨다** — 디컴프에
   * 이름표조차 없다. 상대 이름을 아는 판에서만 이 줄을 쓴다
   */
  playerDrewAgainstLinkTr: 789,
  /**
   * 트레이너전에서 볼을 던졌다.
   *
   * ⚠️ **원작 가방은 이걸 안 막는다** — 던지게 두고 배틀 스크립트가 이 줄을
   * 찍는다 (`battle_bag.c`의 `TryUseItem`에는 트레이너 검사가 없다). 우리는
   * 가방에서 미리 막으므로(`BattleBag`) 그 자리에 이 줄을 보여 준다
   */
  theTrainerBlockedTheBall: 859,

  // ── 판 도중 등판 · 회수의 갈래 (`battle_display.c` `LoadSendOutMessage` · `LoadRecallMessage`) ──
  //
  // 원작은 싱글·비통신에서 우리 쪽 「가랏!」을 **상대 첫 자리의 체력**으로 다섯 갈래로
  // 고르고(천분율 100·325·550·775), 「돌아와!」를 **그 마리가 나온 뒤 상대가 잃은
  // 체력**으로 다섯 갈래로 고른다(백분율 0·25·50·75). 더블은 「가랏!」·「돌아와!」 하나다
  /** 상대 천분율 775 미만 — 「널 믿어!」 */ youreInChargePokemon: 980,
  /** 550 미만 — 「힘내!」 */ goForItPokemon: 981,
  /** 100 미만 — 「상대가 약해져 있어! 기회다!」 */ yourFoesWeakGetEmPokemon: 982,
  /** 325 미만 — 「앞으로 조금이야! 힘내!」 */ justALittleMoreHangInTherePokemon: 983,
  /** 상대가 한 점도 안 잃었다 — 「교대! 돌아와!」 */ pokemonSwitchOutComeBack: 984,
  /** 25 미만 · 더블 — 「돌아와!」 */ pokemonComeBack: 985,
  /** 75 미만 — 「좋았어! 돌아와!」 */ pokemonOKComeBack: 986,
  /** 75 이상 — 「좋아! 돌아와!」 */ pokemonEnoughGetBack: 987,
  /** 50 미만 — 「잘했어! 돌아와!」 */ pokemonGoodComeBack: 988,
  /** 상대 트레이너가 거둔다 — 「{분류} {이름}은 {포켓몬}을 넣어버렸다!」 */ trWithdrewPokemon: 989,
  /** 분류 없는 짝 */ linkTrWithdrewPokemon: 990,

  // ── 레벨업 기술 (`battle_script.c` `SEQ_GET_EXP_WANTS_TO_LEARN_MOVE_PRINT` 이후) ──────
  //
  // ⚠️ **뱅크 앞머리(5~10)에 같은 글이 또 있다.** 그쪽은 어느 스크립트도 안 가리키고,
  // 배틀이 실제로 찍는 것은 1178부터의 줄이다 — 이름 끝에 `2`가 붙은 둘도 그쪽이다
  /** 「{이름}은 새로 {기술}을 배우고 싶다...!」 */ pokemonWantsToLearnMove: 1178,
  /** 「그러나 {이름}은 기술을 4개 알고 있으므로…」 — 디컴프 이름은 `…FourMoves2` */
  butPokemonCantLearnMoreThanFourMoves: 1179,
  /** 「다른 기술을 잊게 하겠습니까?」 — 끝의 `{SCREEN 0}`은 물음 창 부호다 */ makeItForgetAnotherMoveYesNo: 1180,
  /** 그 물음의 두 칸 (`BattleSubscreen_DrawForgetMoveMenu`) */ forgetAMove: 1181,
  /** 〃 */ keepOldMoves: 1182,
  /** 「어느 기술을 잊게 하겠습니까?」 — 디컴프 이름은 `…Forgotten2` */ whichMoveShouldBeForgotten: 1183,
  /** 잊을 기술을 안 고르고 물러섰다 — 「그럼...」 */ wellThen: 1184,
  /** 「새로운 기술을 배우는 것을 포기하겠습니까?」 */ shouldPokemonGiveUpOnLearningMove: 1185,
  /** 그 물음의 두 칸. 기술 이름을 빈칸으로 받는다 (`BattleSubscreen_DrawGiveUpMoveMenu`) */
  giveUpOnMove: 1186,
  /** 〃 */ dontGiveUpOnMove: 1187,
  /** 「{이름}은 {기술}을 결국 배우지 않았다!」 */ pokemonDidNotLearnMove2: 1188,
  /** 「1, 2, ... ... 짠!」 — `{PAUSE}`는 `tokensToText`가 지운다 */ battleOneTwoAndPoof: 1189,
  /** 「{이름}은 {기술}을 깨끗이 잊었다!」 */ battlePokemonForgotHowToUseMove: 1190,
  /** 「그리고!」 */ battleAndDotDotDot: 1191,
  /** 「{이름}은 새로 {기술}을 배웠다!」 */ battlePokemonLearnedMove: 1192,
  /** 예/아니오 창의 두 칸 (`BattleSubscreen_DrawYesNoMenu`) */ yes: 940,
  /** 〃 */ no: 941,

  // ── 명령 첫 단 (`battle_subscreen.c`) ────────────────────────────────────
  /**
   * 명령을 묻는 줄 — 「{이름}은 무엇을 할까?」. 끝의 `{SCREEN 0}`은 아래 화면을 여는
   * 부호라 `tokensToText`가 지운다. 원작은 명령 창이 뜰 때마다 글창에 이 줄을 띄우고
   * (`battle_display.c`의 `Task_PlayerSetCommandSelection`), 기술 창에서도 같은 줄을
   * 다시 찍는다 (`Task_PlayerShowMoveSelectMenu`)
   */
  whatWillPokemonDo: 921,
  /** 사파리에서 묻는 줄 — 「{주인공}은 무엇을 던질까?」 */ whatWillPlayerThrow: 922,
  /** 싸운다 */ fight: 924,
  /** 가방 */ bag: 925,
  /** 포켓몬 */ pokemon: 926,
  /** 도망간다 */ run: 927,
  /** 사파리 명령 — 볼 · 먹이 · 진흙 (`battle_subscreen.c` 1467) */ ball: 931,
  /** 〃 */ bait: 932,
  /** 〃 */ mud: 933,

  // ── 도구와 변신 (PARITY §2.24) ──────────────────────────────────────────────
  //
  // 원작은 도구가 일한 자리에서 **도구 이름을 문장에 넣는다**(「{이름}은 {도구}로
  // 체력을 회복했다!」). 어느 줄인지는 홀드 효과마다 스크립트가 정해 두었다
  // (`battle_lib.c`의 `BattleSystem_TriggerHeldItem…` → `subscript_held_item_*`)
  /** 변신 — 둘째 칸은 **종 이름**이다 (`TAG_NICKNAME_POKE`) */ pokemonTransformedIntoPokemon: 345,
  /** 도둑질·탐내다 */ pokemonStolePokemonsItem: 401,
  /** 트릭으로 손에 넣었다 (`subscript_exchange_items`) */ pokemonObtainedOneItem: 513,
  /** 리사이클 (`effect_script_0184`) */ pokemonFoundOneItem: 589,
  /** 탁쳐서떨구기 (`BtlCmd_TryKnockOff`) */ pokemonKnockedOffPokemonsItem: 552,
  /** 도구가 랭크를 올렸다 — 한 단계든 두 단계든 이 줄이다 */ theItemRaisedPokemonsStat: 756,
  /** 스타열매만 (`subscript_held_item_sharply_raise_stat`) */ theItemSharplyRaisedPokemonsStat: 759,
  /** 열매가 마비를 풀었다 */ pokemonsItemCuredItsParalysis: 875,
  /** 〃 독 */ pokemonsItemCuredItsPoison: 878,
  /** 〃 화상 */ pokemonsItemCuredItsBurn: 881,
  /** 〃 얼음 */ pokemonsItemDefrostedIt: 884,
  /** 〃 잠 */ pokemonsItemWokeItUp: 887,
  /** 〃 혼란 */ pokemonsItemSnappedItOutOfConfusion: 890,
  /** 리샘열매 — 무엇이 나았든 이 줄이다 (`subscript_held_item_multi_restore`) */
  pokemonNormalizedItsStatusUsingItsItem: 896,
  /** 과사열매 — 기술 이름을 빈칸으로 받는다 */ pokemonRestoredMovesPPUsingItsItem: 902,
  /** 하양허브 (`subscript_held_item_statdown_restore`) */ pokemonRestoredItsStatusUsingItsItem: 905,
  /** 체력 열매 · 나무열매쥬스 (`subscript_held_item_hp_restore`) */ pokemonRestoredItsHealthUsingItsItem: 899,
  /** 먹다남은음식 · 검은진흙 · 조개껍질방울 (`subscript_restore_a_little_hp`) */
  pokemonRestoredALittleHPUsingItsItem: 908,
  /** 기합의띠 · 기합의머리띠가 1을 남겼다 */ pokemonHungOnUsingItsItem: 912,
  /** 통찰 (`subscript_frisk`) */ pokemonFriskedItsFoeAndFoundOneItem: 1118,
  /** 반감 열매 — 도구와 **막은 기술**을 받는다 (`subscript_type_resist_berry`) */ theItemWeakenedMovesPower: 1131,
  /** 검은진흙 · 끈적끈적바늘 (`subscript_lose_hp_from_item_with_message`) */ pokemonIsHurtByItsItem: 1132,
  /** 쪼아대기 · 벌레먹음 (`subscript_pluck`) */ pokemonStoleAndAteItsFoesItem: 1141,
  /** 내던지기 */ pokemonFlungItsItem: 1144,
  /** 미클열매 */ pokemonsBoostedTheAccuracyOfItsNextMoveUsingItsItem: 1157,
  /** 자보열매 · 애터열매 — 맞힌 쪽이 다친다 (`subscript_held_item_recoil_when_hit`) */
  pokemonIsHurtByPokemonsItem: 1160,
  /** 맹독구슬 (`subscript_badly_poison`) */ pokemonWasBadlyPoisonedByTheItem: 1168,
  /** 화염구슬 (`subscript_burn`) */ pokemonGotABurnFromTheItem: 1171,
  /** 파워풀허브 */ pokemonBecameFullyChargedDueToItsItem: 1251,
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

/**
 * 랭크 이름이 든 자리 (`pokemon_stat_names` · us 551).
 *
 * 롬의 랭크 줄은 능력 이름을 **빈칸으로** 받는다 — 우리가 「공격」을 적어 두면
 * 로케일을 바꾸는 순간 한국어가 남는다. 배틀 로그(`messages.ts`)와 배틀 가방의
 * 「무슨 일이 일어나는가」 줄(`BattleBag.tsx`)이 같은 표를 읽는다
 */
export const STAT_SLOT: Record<BoostStat, number> = {
  atk: 1, def: 2, spe: 3, spa: 4, spd: 5, accuracy: 6, evasion: 7,
}

// ── 배틀 **안**의 두 화면 (PARITY §2.26) ────────────────────────────────────
//
// 배틀 위 화면과 뱅크가 아예 다르다. DS는 아래 화면에 가방과 파티를 띄웠고
// 그 둘이 각자 뱅크를 열었다 (`battle_bag.c` · `battle_party.c`의
// `MessageLoader_Init`). 우리는 화면이 하나라 같은 자리에 겹쳐 띄운다.
//
// ⚠️ **같은 문장이 두 뱅크에 있다.** 「금제의 효과로 …」는 가방 46번과 파티
// 95번이 글자까지 같다 — 원작은 **어느 화면이 떠 있느냐**로 고른다. 우리도
// 그대로 한다: 도구를 고르는 단은 가방 줄, 대상을 고르는 단은 파티 줄이다.

/** `TEXT_BANK_BATTLE_BAG` — 배틀 안 가방 49줄 (us 2) */
export const BAG_BANK = 2

/** `TEXT_BANK_BATTLE_PARTY` — 배틀 안 파티 96줄 (us 3) */
export const PARTY_BANK = 3

/**
 * 배틀 가방 뱅크의 줄 번호.
 *
 * 주머니 이름 넷은 우리가 적어 둔 것과 **글자까지 같았다** — 그래도 롬에서 읽는다.
 * 손으로 든 글은 로케일을 바꾸면 한국어가 남고, 같은지 아닌지도 아무도 다시 안 잰다
 */
export const BAG = {
  /** 회복 (HP·PP 도구가 한 칸이다) */ pocketRestore: 23,
  /** 상태 */ pocketStatus: 24,
  /** 볼 */ pocketBalls: 26,
  /** 배틀용 */ pocketBattleItems: 27,
  /** 금제가 막았다. 빈칸 둘은 기술 이름과 이름 */ embargoBlockingItemUse: 46,
  /**
   * 「안돼! 2마리 있어서 / 목표를 정할 수가 없어...!」 — 편과 함께 만난 야생 둘이
   * 다 서 있을 때 볼을 막는다 (`battle_bag.c` 454 `hasTwoOpponents`)
   */
  cantUseBallTwoPokemon: 44,
} as const

/**
 * 배틀 파티 뱅크의 줄 번호.
 *
 * 도구를 먹인 **뒤**의 열한 줄(82~92)은 안 적는다 — 그 자리는 배틀 로그가
 * `battle_strings`의 같은 문장으로 이미 말한다. 두 뱅크에 같은 글이 있을 때
 * 우리처럼 화면이 하나면 한쪽만 골라야 하고, 로그 쪽이 이미 흐름에 얹혀 있다
 */
export const PARTY = {
  /** 누구를 내보낼지 고르는 줄 */ chooseAPokemon: 6,
  /** 도구를 누구에게 쓸지 고르는 줄 */ useOnWhichPokemon: 7,
  /** 이미 나가 있다 */ cantSwitchWithPokemonAlreadyInBattle: 76,
  /** 기력이 없다 */ cantSwitchWithFaintedPokemon: 77,
  /** 못 돌아오게 한다 (묶기·그림자밟기 따위) */ cantSwitchPokemon: 78,
  /** 써도 효과가 없다 */ itemWontHaveAnyEffect: 81,
  /** 어느 기술을 회복하겠습니까 */ restoreWhichMove: 94,
  /** 기술을 잊는 화면에서 배우려던 칸을 고른 단추 — 「그만둔다」 */ cancelMoveButton: 59,
  /** 금제가 막았다. 빈칸 둘은 기술 이름과 이름 */ embargoPreventsItemUse: 95,
} as const
