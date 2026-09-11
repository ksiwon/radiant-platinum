// 배틀 텍스트 — 도메인 이벤트 하나를 한 줄로.
//
// ⚠️ **글은 롬에서 온다.** 배틀 글 뱅크(`battle_strings` · us 368)의 1,269줄이
// 원작이 배틀에서 찍는 글 전부고, 화면에 뜨는 것은 그 줄 자체다. 우리가 하는 일은
// **빈칸에 이름을 넣는 것**뿐이다 — 줄 번호는 `romText.ts`가 든다.
//
// 그렇게 바꾼 까닭: 한동안 이 글을 손으로 들었는데, 롬이 있는 기계에서 마흔여덟
// 줄을 처음 맞대 보니 **일곱만 맞았다.** 「목을 움츠렸다」가 「머리를」이 되고
// 「분신」이 「대타」가 되고, 롬에 아예 없는 문장이 둘 섞여 있었다.
//
// **조사도 롬이 든다** — `{STRVAR_1 1, 0, 2}`의 마지막 2가 을/를이다. 그래서
// 「찌르꼬이(가)」 같은 병기형이 그 줄들에서는 원리적으로 안 난다. 아직 손으로
// 드는 줄만 `korean.ts`가 받침으로 고른다 (그 목록은 PARITY §2.24가 센다).
//
// ⚠️ **자리 표시는 이름표가 붙인다.** 롬은 「우리 편·야생·상대」를 세 줄로 따로
// 들고 있는데 우리는 맨 줄 하나만 쓰고 「야생 」·「상대 」를 이름 앞에 붙여 넣는다.
// 뱅크 1,269줄에 「야생의」는 **0건**이고 「야생 」이 344건이라, 이름표가 롬의 말을
// 쓰면 두 길이 같은 글이 된다 (`BattleScreen`의 `label`).
//
// 아직 문장이 없는 이벤트는 null이다. 텍스트 박스가 그냥 건너뛴다.
import type {
  Actor, BattleEvent, EffectExtra, EffectRef,
} from '../../engine/battle/events'
import type { Status } from '../../engine/pokemon/instance'
import { withObject, withTopic } from '../korean'
import { romLine } from './romLine'
import { forSide, moveUsedLine, MSG, STAT_SLOT } from './romText'

export interface BattleNames {
  /** 종족 번호로 색인 */
  species: string[]
  /** 기술 번호로 색인 */
  moves: string[]
  /** 특성 번호로 색인 */
  abilities: string[]
  /** 도구 번호로 색인. 트레이너가 도구를 쓸 때만 본다 */
  items: string[]
  /**
   * 랭크 이름 아홉 (`pokemon_stat_names` · us 551). 자리는 `STAT_SLOT`이 안다.
   *
   * 롬의 랭크 줄이 이 이름을 **빈칸으로** 받는다 — 우리가 「공격」을 적어 두면
   * 로케일을 바꿔도 한국어가 남는다
   */
  stats: string[]
}

export interface TextContext {
  names: BattleNames
  /**
   * 롬의 배틀 글 뱅크 (`battle_strings` · us 368). **자리가 곧 줄 번호**다.
   *
   * ⚠️ **비면 그 줄들이 통째로 조용해진다.** 이름표와 같은 묶음으로 받으므로
   * (`BattleScreen`의 `useNames`) 화면에서는 늘 차 있다
   */
  lines: readonly string[]
  /**
   * 기술을 쓰는 줄만 든 뱅크 (`moves_used_in_battle` · us 0). 자리는
   * `기술번호 × 3`이다 (`moveUsedLine`).
   *
   * ⚠️ **따로 받는 까닭.** 이 줄은 기술 이름이 **문장 안에 박혀 있다** —
   * 빈칸이 아니다. 그래서 이름표가 없어도 영어가 샐 데가 없고, 원작이 이름
   * 뒤에서 줄을 바꾸는 것도 그대로 온다
   */
  moveLines: readonly string[]
  /**
   * 자리 → 화면에 쓸 이름. "모부기" / "야생 찌르꼬" / "상대 찌르꼬".
   *
   * ⚠️ **「야생의」가 아니라 「야생 」이다** — 배틀 글 1,269줄에 「야생의」는
   * 0건이고 「야생 」이 344건이다. 롬은 자리마다 줄을 셋 들고 있는데
   * 이름표가 롬의 말을 쓰면 **맨 줄 하나로 셋을 다 덮는다**
   */
  label: (actor: Actor) => string
  /** 상대 트레이너 이름("체육관 관장 동관"). 야생이면 null */
  foeName?: string | null
  /**
   * 그 이름을 가른 두 조각 — 분류("체육관 관장")와 이름("동관").
   *
   * ⚠️ **롬의 네 줄이 트레이너를 두 칸으로 받는다.** 합친 이름으로는 그 두
   * 칸을 못 채워서 한동안 그 줄들만 손 글이었다. 분류가 없는 상대(통신·
   * 배틀팩토리)에게는 롬이 이름 한 칸짜리 줄을 따로 들고 있다
   */
  foeClass?: string | null
  foeTrainer?: string | null
  /** 내 이름. 가방 도구를 쓴 주어다 — 원작도 플레이어 이름으로 부른다 */
  playerName?: string | null
  /**
   * 자리 표시 없는 이름. "상대 자철석"이 아니라 그냥 "자철석"이다.
   *
   * 아직 안 나온 마리를 가리킬 때 쓴다 — 「교체」의 "○○를 내보내려고 한다"가
   * 그렇다. 그 자리에 "상대"를 또 붙이면 트레이너 이름과 겹쳐 읽힌다
   */
  bare?: (key: string) => string
}

/**
 * 상태이상에 걸린 순간 · 나은 순간 (PARITY §2.24).
 *
 * ⚠️ **나은 줄은 상태마다 다르다.** 롬에 「상태이상이 나았다」 하나로 때우는 줄도
 * 있지만(1229) 그것은 도구가 여러 상태를 한 번에 고칠 때 쓰는 자리다 — 하나씩
 * 나을 때는 「눈을 떴다!」·「얼음이 녹았다!」처럼 저마다 말한다
 */
const STATUS_ONSET: Record<Exclude<Status, 'ok'>, number> = {
  slp: MSG.pokemonFellAsleep,
  psn: MSG.pokemonWasPoisoned,
  tox: MSG.pokemonWasBadlyPoisoned,
  brn: MSG.pokemonWasBurned,
  frz: MSG.pokemonWasFrozenSolid,
  par: MSG.pokemonIsParalyzedItMayBeUnableToMove,
}

const STATUS_CURED: Record<Exclude<Status, 'ok'>, number> = {
  slp: MSG.pokemonWokeUp,
  psn: MSG.pokemonWasCuredOfItsPoisoning,
  tox: MSG.pokemonWasCuredOfItsPoisoning,
  brn: MSG.pokemonsBurnWasHealed,
  frz: MSG.pokemonThawedOut,
  par: MSG.pokemonWasHealedOfParalysis,
}

/**
 * 못 움직인 까닭 (`cant`).
 *
 * ⚠️ **도발은 못 쓴 기술 이름이 들어간다.** 그래서 표가 아니라 갈래로 다룬다 —
 * 아래 `battleText`의 `cant`를 보라
 */
const CANT_REASON: Record<string, number> = {
  slp: MSG.pokemonIsFastAsleep,
  frz: MSG.pokemonIsFrozenSolid,
  par: MSG.pokemonIsParalyzedItCantMove,
  flinch: MSG.pokemonFlinched,
  recharge: MSG.pokemonMustRecharge,
  'move: Attract': MSG.pokemonIsImmobilizedByLove,
}

/**
 * 날씨 세 자리 — 시작·머무름·그침.
 *
 * ⚠️ **그치는 줄도 날씨마다 다르다.** 손으로 들 때는 「날씨가 원래대로
 * 돌아왔다!」 하나였는데 롬은 「비가 그쳤다!」·「햇살이 약해졌다!」로 갈라 말한다
 */
const WEATHER: Record<string, { start: number; upkeep: number; stop: number }> = {
  Sandstorm: {
    start: MSG.aSandstormBrewed,
    upkeep: MSG.theSandstormRages,
    stop: MSG.theSandstormSubsided,
  },
  Hail: {
    start: MSG.itStartedToHail,
    upkeep: MSG.hailContinuesToFall,
    stop: MSG.theHailStopped,
  },
  RainDance: {
    start: MSG.itStartedToRain,
    upkeep: MSG.rainContinuesToFall,
    stop: MSG.theRainStopped,
  },
  SunnyDay: {
    start: MSG.theSunlightTurnedHarsh,
    upkeep: MSG.theSunlightIsStrong,
    stop: MSG.theSunlightFaded,
  },
}

/**
 * 모으는 기술의 첫 턴 (PARITY §2.24 · `-prepare`).
 *
 * 4세대에서 이 줄을 내는 기술이 **정확히 아홉**이다 — sim의 4세대 덱스로 세어
 * 확정했고(`protocolLines.test.ts`가 그 아홉을 다시 센다), 원작도 기술마다
 * 다른 한 줄을 찍는다. 그 아홉 줄이 롬의 214~232·1082번이다
 */
const PREPARE: Record<string, number> = {
  fly: MSG.flewUpHigh,
  dig: MSG.burrowedUnderTheGround,
  dive: MSG.hidUnderwater,
  bounce: MSG.sprangUp,
  razorwind: MSG.whippedUpAWhirlwind,
  skullbash: MSG.tuckedInItsHead,
  skyattack: MSG.becameCloakedInAHarshLight,
  solarbeam: MSG.absorbedLight,
  shadowforce: MSG.vanishedInstantly,
}

/** 효과 한 줄을 쓸 때 필요한 것. 자리가 없는 줄이면 `who`가 null이다 */
interface EffectSay {
  /** 발동한 자리의 이름 ("모부기") */
  who: string | null
  /** `[of]` 쪽 이름. 효과를 건 상대다 */
  of: string | null
  /** 효과 뒤에 붙어 온 값. 뜻은 효과마다 다르다 */
  extra: EffectExtra
  /** `extra.move`의 한국어 이름. 번호를 못 찾았으면 원문 */
  extraMove: string
  /** 효과가 기술·특성이면 그 한국어 이름. 번호를 못 찾으면 원문 */
  label: string
  /**
   * 같은 이름이되 **못 풀면 null**이다.
   *
   * 롬 문장의 빈칸에 들어가는 것은 이쪽이다 — `label`처럼 영어로 떨어뜨리면
   * 화면에 「Reflect로 물리 공격에 강해졌다!」가 뜬다. 빈칸이 못 채워지면
   * `rom()`이 문장 자체를 비운다
   */
  romLabel: string | null
}

/** 효과 표의 한 줄. 롬의 줄 하나를 골라 칸을 채운다 */
type EffectLine = (ctx: TextContext, s: EffectSay) => string | null

/**
 * 효과 id → 롬의 줄 (PARITY §2.24 · `-activate`·`-block`).
 *
 * ⚠️ **접두사로도 갈래로도 안 가른다.** 같은 효과가 `move: Protect`로도
 * `Protect`로도 오고, 그중 여섯(방어·뿌리박기·흰안개·신비의부적·점착·흡반)은
 * `@pkmn/protocol`이 `-block`으로 다시 써서 보낸다. 그래서 열쇠는
 * `EffectRef.id` 하나고 표도 하나다 (`sim/protocol`의 `effectRef`).
 *
 * ⚠️ **여기 없는 효과는 조용하다.** 롬에 줄이 없는 것은 지어내지 않는다 —
 * 4세대 뱅크에 없는 것이 확인된 자리는 아래 주석이 그 근거를 적어 둔다.
 * 다만 **특성은 예외**로 `effectText`가 원작의 특성 배너로 떨어진다
 */
const ACTIVATE: Record<string, EffectLine> = {
  // 방어·판별이 공격을 **막았다**. 쓰는 줄(`-singleturn`)과 문장이 다르다
  protect: (c, s) => rom(c, MSG.protectedItself, s.who),
  // 대타출동이 대신 맞았다. 롬은 「대타」가 아니라 **「분신」**이라 부른다
  substitute: (c, s) => rom(c, MSG.theSubstituteTookDamageForPokemon, s.who),
  endure: (c, s) => rom(c, MSG.enduredTheHit, s.who),
  // 치유방울. 4세대에서는 이쪽이 `-activate`고 아로마테라피만 `-cureteam`이다
  healbell: (c) => rom(c, MSG.aBellChimed),
  aromatherapy: (c) => rom(c, MSG.aSoothingAromaWaftedThroughTheArea),
  // 흰안개·신비의부적이 막는 자리. 롬은 신비의부적을 「신비의 베일」이라 쓴다
  mist: (c, s) => rom(c, MSG.isProtectedByMist, s.who),
  safeguard: (c, s) => rom(c, MSG.isProtectedBySafeguard, s.who),
  // 트릭·바꿔치기는 한 줄로 서로의 도구가 오간다
  trick: (c, s) => rom(c, MSG.switchedItemsWithItsTarget, s.who),
  switcheroo: (c, s) => rom(c, MSG.switchedItemsWithItsTarget, s.who),
  // 매그니튜드는 굴린 수가 `[number]`로 온다. 롬은 느낌표를 **둘** 찍는다
  magnitude: (c, s) => (s.extra.num === null
    ? null
    : rom(c, MSG.magnitudeX, String(s.extra.num))),
  bide: (c, s) => rom(c, MSG.isStoringEnergy, s.who),
  // 헤롱헤롱으로 발이 묶인 턴. 홀린 상대가 `[of]`로 온다
  attract: (c, s) => rom(c, MSG.isInLoveWithPokemon, s.who, s.of),
  // ⚠️ **길동무가 실제로 데려간 줄은 비어 있다.** 롬의 그 줄은 이름을 둘 부르는데
  // (`{건 쪽}는 {끌려간 쪽}를 길동무로 삼았다!`) sim은 `-activate`에 **한 자리만**
  // 준다 (`add('-activate', target, 'move: Destiny Bond')` — `[of]`가 없다).
  // 반쪽만 채운 문장을 놓느니 비운다. 거는 줄(`-singlemove`)은 아래에 있다
  snatch: (c, s) => rom(c, MSG.snatchedPokemonsMove, s.who, s.of),
  // 혼란은 걸린 줄(`-start`)과 매 턴 도는 줄이 따로다. 이쪽이 도는 쪽이고,
  // 바로 뒤에 자기를 때린 데미지가 `[from] confusion`으로 온다
  confusion: (c, s) => rom(c, MSG.isConfused, s.who),
  // 뿌리박기가 날려버리기를 버텼다
  ingrain: (c, s) => rom(c, MSG.anchoredItselfWithItsRoots, s.who),
  // 흡반. 롬은 특성 이름을 빈칸으로 받는다
  suctioncups: (c, s) => rom(c, MSG.anchorsItselfWithAbility, s.who, s.label),
  // 록온·마음의눈. 겨눈 쪽이 `[of]`로 온다
  // (`add('-activate', source, 'move: Lock-On', '[of] ' + target)`)
  lockon: (c, s) => rom(c, MSG.tookAimAtPokemon, s.who, s.of),
  mindreader: (c, s) => rom(c, MSG.tookAimAtPokemon, s.who, s.of),
  // 스케치가 베낀 기술은 `[move]`로 온다. 한국어 이름이 안 풀리면 `rom`이
  // 문장 자체를 비운다 — 조사가 뒤에 붙는 자리라 영어를 떨어뜨리면
  // 「Tackle을(를) 스케치했다!」가 뜬다
  sketch: (c, s) => (s.extra.move === null
    ? null
    : rom(c, MSG.sketchedMove, s.who, s.extraMove)),
  // 튀어오르기. sim은 `-nothing`을 내고 `@pkmn/protocol`이 이 줄로 다시 쓴다 —
  // 그래서 **자리가 비어 있다** (`|-activate||move: Splash`)
  splash: (c) => rom(c, MSG.butNothingHappened),
  // ⚠️ **점착과 선제공격손톱은 4세대 뱅크에 줄이 없다.** 「손톱」·「뺏」이
  // 1,269줄에서 0건이다 — 5세대 이후에 생긴 글이라 여기서는 비운다
}

/**
 * 무대 전체에 걸린 효과 (`-fieldactivate`). 4세대에서는 둘뿐이다 —
 * 멸망의노래와 페이데이
 */
const FIELD_ACTIVATE: Record<string, number> = {
  perishsong: MSG.allPokemonHearingTheSongWillFaintInThreeTurns,
  payday: MSG.coinsScatteredEverywhere,
}

/**
 * 이번 턴에만 걸리는 것 (`-singleturn`). 4세대에서 이 줄을 내는 기술은 여덟이다.
 *
 * ⚠️ **회복지령(`roost`)은 여기 없다.** 그 줄은 쇼다운이 타입이 바뀐 것을 스스로
 * 적어 두는 자리고 원작은 아무 말도 안 한다
 */
const SINGLE_TURN: Record<string, EffectLine> = {
  protect: (c, s) => rom(c, MSG.protectedItself2, s.who),
  focuspunch: (c, s) => rom(c, MSG.isTighteningItsFocus, s.who),
  endure: (c, s) => rom(c, MSG.bracedItself, s.who),
  magiccoat: (c, s) => rom(c, MSG.shroudedItselfWithMagicCoat, s.who),
  snatch: (c, s) => rom(c, MSG.waitsForATargetToMakeAMove, s.who),
  followme: (c, s) => rom(c, MSG.becameTheCenterOfAttention, s.who),
  // ⚠️ **자리가 뒤집혀 있다.** 이 줄의 자리는 **도움을 받는 쪽**이고 도운 쪽이
  // `[of]`로 온다 (`add('-singleturn', target, 'Helping Hand', '[of] ' + source)`).
  // 롬의 첫 칸은 **돕는 쪽**이라 둘을 바꿔 넣는다
  helpinghand: (c, s) => rom(c, MSG.isReadyToHelpPokemon, s.of, s.who),
}

/** 다음 기술 한 번에만 걸리는 것 (`-singlemove`). 분노는 원작이 아무 말도 안 한다 */
const SINGLE_MOVE: Record<string, EffectLine> = {
  destinybond: (c, s) => rom(c, MSG.isTryingToTakeItsFoeWithIt, s.who),
  grudge: (c, s) => rom(c, MSG.wantsTheFoeToBearAGrudge, s.who),
}

/**
 * 표에 놓인 효과 id. `messages.test.ts`가 표를 통째로 돌려
 * **빈칸이 남는 줄이 없는지** 본다 — 남으면 화면에 제어 부호가 글자로 뜬다
 */
export const ACTIVATE_IDS: readonly string[] = Object.keys(ACTIVATE)
export const SINGLE_TURN_IDS: readonly string[] = Object.keys(SINGLE_TURN)
export const SINGLE_MOVE_IDS: readonly string[] = Object.keys(SINGLE_MOVE)

/**
 * 개체에 **걸린** 줄 (PARITY §2.25 · `-start`).
 *
 * ⚠️ **모양은 진작에 있었다.** 트레이너 AI가 리플렉터·대타출동·트릭룸을 보라고
 * 준 것이라 「아직 모양 안 준 명령」 목록에 안 잡혔는데, `battleText`에는 이
 * 갈래가 **아예 없었다** — 씨뿌리기가 걸려도 대타가 나타나도 도발에 넘어가도
 * 화면이 한 마디도 안 했다.
 *
 * ⚠️ **여기 없는 것은 조용하다.** 특성 배너로도 안 떨어뜨린다 — 날씨부정·틀깨기는
 * 4세대 뱅크에 줄이 없고, 원작이 아무 말도 안 하는 자리에 배너를 띄우면
 * 그것이 지어낸 것이다
 */
const VOLATILE_ON: Record<string, EffectLine> = {
  aquaring: (c, s) => rom(c, MSG.surroundedItselfWithAVeilOfWater, s.who),
  attract: (c, s) => rom(c, MSG.fellInLove, s.who),
  bide: (c, s) => rom(c, MSG.isStoringEnergy, s.who),
  charge: (c, s) => rom(c, MSG.beganChargingPower, s.who),
  confusion: (c, s) => rom(c, MSG.becameConfused, s.who),
  destinybond: (c, s) => rom(c, MSG.isTryingToTakeItsFoeWithIt, s.who),
  disable: (c, s) => rom(c, MSG.moveWasDisabled, s.who, s.extraMove || null),
  doomdesire: (c, s) => rom(c, MSG.choseMoveAsItsDestiny, s.who, s.romLabel),
  embargo: (c, s) => rom(c, MSG.cantUseItemsAnymore, s.who),
  encore: (c, s) => rom(c, MSG.receivedAnEncore, s.who),
  endure: (c, s) => rom(c, MSG.bracedItself, s.who),
  focusenergy: (c, s) => rom(c, MSG.isGettingPumped, s.who),
  focuspunch: (c, s) => rom(c, MSG.isTighteningItsFocus, s.who),
  followme: (c, s) => rom(c, MSG.becameTheCenterOfAttention, s.who),
  futuresight: (c, s) => rom(c, MSG.foresawAnAttack, s.who),
  gastroacid: (c, s) => rom(c, MSG.pokemonsAbilityWasSuppressed, s.who),
  grudge: (c, s) => rom(c, MSG.wantsTheFoeToBearAGrudge, s.who),
  healblock: (c, s) => rom(c, MSG.wasPreventedFromHealing, s.who),
  imprison: (c, s) => rom(c, MSG.sealedTheOpponentsMoves, s.who),
  ingrain: (c, s) => rom(c, MSG.plantedItsRoots, s.who),
  leechseed: (c, s) => rom(c, MSG.wasSeeded, s.who),
  magiccoat: (c, s) => rom(c, MSG.shroudedItselfWithMagicCoat, s.who),
  magmastorm: (c, s) => rom(c, MSG.becameTrappedBySwirlingMagma, s.who),
  magnetrise: (c, s) => rom(c, MSG.levitatedOnElectromagnetism, s.who),
  mimic: (c, s) => rom(c, MSG.learnedMove2, s.who, s.extraMove || null),
  nightmare: (c, s) => rom(c, MSG.beganHavingANightmare, s.who),
  powertrick: (c, s) => rom(c, MSG.switchedItsAttackAndDefense, s.who),
  sandtomb: (c, s) => rom(c, MSG.wasTrappedBySandTomb, s.who),
  snatch: (c, s) => rom(c, MSG.waitsForATargetToMakeAMove, s.who),
  stockpile: (c, s) => (s.extra.num === null
    ? null
    : rom(c, MSG.stockpiledX, s.who, String(s.extra.num))),
  substitute: (c, s) => rom(c, MSG.madeASubstitute, s.who),
  taunt: (c, s) => rom(c, MSG.fellForTheTaunt, s.who),
  torment: (c, s) => rom(c, MSG.wasSubjectedToTorment, s.who),
  uproar: (c, s) => rom(c, MSG.causedAnUproar, s.who),
  // 회오리불꽃·소용돌이·조이기·감기·조개무지는 **가둔 쪽 이름**이 붙는다.
  // 못 받으면 `rom`이 문장 자체를 비운다
  firespin: (c, s) => rom(c, MSG.wasTrappedInAVortex, s.who),
  whirlpool: (c, s) => rom(c, MSG.wasTrappedInAVortex, s.who),
  bind: (c, s) => rom(c, MSG.wasSqueezedByPokemon, s.who, s.of),
  wrap: (c, s) => rom(c, MSG.wasWrappedByPokemon, s.who, s.of),
  clamp: (c, s) => rom(c, MSG.clampedPokemon, s.who, s.of),
  // ⚠️ **첫 칸이 건 쪽인 줄 넷.** 저주·심안·도우미·하품은 롬 문장이
  // 「{건 쪽}는 {받는 쪽}…」이고 sim은 **받는 쪽**을 자리로 준다
  curse: (c, s) => rom(c, MSG.cutItsOwnHPAndLaidACurseOnPokemon, s.of, s.who),
  foresight: (c, s) => rom(c, MSG.identifiedPokemon, s.of, s.who),
  miracleeye: (c, s) => rom(c, MSG.identifiedPokemon, s.of, s.who),
  helpinghand: (c, s) => rom(c, MSG.isReadyToHelpPokemon, s.of, s.who),
  yawn: (c, s) => rom(c, MSG.madePokemonDrowsy, s.of, s.who),
  lockon: (c, s) => rom(c, MSG.tookAimAtPokemon, s.of, s.who),
  mindreader: (c, s) => rom(c, MSG.tookAimAtPokemon, s.of, s.who),
  // 특성이 걸어 두는 것 셋. 롬은 특성 이름을 빈칸으로 받는다
  flashfire: (c, s) => rom(c, MSG.abilityRaisedThePowerOfItsFireTypeMoves, s.who, s.romLabel),
  pressure: (c, s) => rom(c, MSG.isExertingItsAbility, s.who, s.romLabel),
  slowstart: (c, s) => rom(c, MSG.cantGetItGoingBecauseOfItsAbility, s.who, s.romLabel),
}

/**
 * 개체에서 **풀린** 줄 (PARITY §2.25 · `-end`).
 *
 * ⚠️ **두루 쓰는 줄이 있어도 표를 안 접는다.** 롬의 `moveWoreOff`는 기술 이름을
 * 빈칸으로 받아 무엇에나 쓸 수 있게 생겼지만, 그 줄을 기본값으로 깔면 **원작이
 * 아무 말도 안 하는 자리까지** 말하게 된다. 접두사 없이 오는 이름 중에는
 * 기술이 아닌 것도 섞여 있어(`confusion`) 엉뚱한 기술 이름이 들어가기도 한다
 */
const VOLATILE_OFF: Record<string, EffectLine> = {
  attract: (c, s) => rom(c, MSG.gotOverItsInfatuation, s.who),
  bide: (c, s) => rom(c, MSG.unleashedEnergy, s.who),
  confusion: (c, s) => rom(c, MSG.snappedOutOfConfusion, s.who),
  disable: (c, s) => rom(c, MSG.isNoLongerDisabled, s.who),
  embargo: (c, s) => rom(c, MSG.canUseItemsAgain, s.who),
  encore: (c, s) => rom(c, MSG.encoreEnded, s.who),
  magnetrise: (c, s) => rom(c, MSG.electromagnetismWoreOff, s.who),
  powertrick: (c, s) => rom(c, MSG.switchedItsAttackAndDefense, s.who),
  slowstart: (c, s) => rom(c, MSG.finallyGotItsActTogether, s.who),
  stockpile: (c, s) => rom(c, MSG.stockpiledEffectWoreOff, s.who),
  substitute: (c, s) => rom(c, MSG.substituteFaded, s.who),
  uproar: (c, s) => rom(c, MSG.calmedDown, s.who),
  // 기술 이름을 빈칸으로 받는 둘. 이름이 안 풀리면 문장을 비운다
  leechseed: (c, s) => rom(c, MSG.wasFreedFromMove, s.who, s.romLabel),
  taunt: (c, s) => rom(c, MSG.tauntWoreOff, s.who, s.romLabel),
  torment: (c, s) => rom(c, MSG.moveWoreOff, s.who, s.romLabel),
  healblock: (c, s) => rom(c, MSG.moveWoreOff, s.who, s.romLabel),
}

/**
 * 진영에 깔리고 걷히는 줄 (PARITY §2.25 · `-sidestart`·`-sideend`).
 *
 * ⚠️ **여기만 자리에 따라 번호를 고른다.** 롬이 「우리 편은…」과 「상대는…」을
 * 아예 다른 줄로 들고 있고 그 줄에는 이름 빈칸이 없어서, 이름표로는 못 덮는다.
 * 우리 편 줄 바로 다음이 상대 줄이다 (`forSide` · `romText.test.ts`가 열넷 전부 잰다)
 */
const SIDE_ON: Record<string, number> = {
  reflect: MSG.moveRaisedYourTeamsDefense,
  lightscreen: MSG.moveRaisedYourTeamsSpecialDefense,
  mist: MSG.yourTeamBecameShroudedInMist,
  safeguard: MSG.yourTeamBecameCloakedInAMysticalVeil,
  spikes: MSG.spikesWereScatteredAllAroundYourTeamsFeet,
  toxicspikes: MSG.poisonSpikesWereScatteredAllAroundYourTeamsFeet,
  stealthrock: MSG.pointedStonesFloatInTheAirAroundYourTeam,
  tailwind: MSG.theTailwindBlewFromBehindYourTeam,
  luckychant: MSG.theLuckyChantShieldedYourTeamFromCriticalHits,
}

const SIDE_OFF: Record<string, number> = {
  safeguard: MSG.yourTeamIsNoLongerProtectedBySafeguard,
  toxicspikes: MSG.thePoisonSpikesDisappearedFromAroundYourTeamsFeet,
  tailwind: MSG.yourTeamsTailwindPeteredOut,
  luckychant: MSG.yourTeamsLuckyChantWoreOff,
  // 나머지 넷은 롬도 두루 쓰는 줄 하나로 말한다 — 기술 이름이 빈칸이다
  reflect: MSG.yourTeamsMoveEffectWoreOff,
  lightscreen: MSG.yourTeamsMoveEffectWoreOff,
  mist: MSG.yourTeamsMoveEffectWoreOff,
  spikes: MSG.yourTeamsMoveEffectWoreOff,
  stealthrock: MSG.yourTeamsMoveEffectWoreOff,
}

/** 그 줄이 기술 이름을 빈칸으로 받는가. 받으면 이름이 안 풀릴 때 조용해진다 */
const SIDE_NEEDS_MOVE = new Set<number>([
  MSG.moveRaisedYourTeamsDefense,
  MSG.moveRaisedYourTeamsSpecialDefense,
  MSG.yourTeamsMoveEffectWoreOff,
])

/**
 * 무대 전체 (`-fieldstart`·`-fieldend`). 4세대에서 글이 붙는 것은 트릭룸과
 * 중력 둘뿐이다 — 중력은 걸릴 때만 말한다
 */
const FIELD_ON: Record<string, number> = {
  trickroom: MSG.twistedTheDimensions,
  gravity: MSG.gravityIntensified,
}

const FIELD_OFF: Record<string, number> = {
  trickroom: MSG.restoredTheTwistedDimensions,
}

/** 트릭룸은 **비튼 쪽 이름**이 붙는다. 중력은 자리가 없는 줄이다 */
const FIELD_NEEDS_WHO = new Set<number>([
  MSG.twistedTheDimensions, MSG.restoredTheTwistedDimensions,
])

/**
 * 날씨가 때리는 줄의 첫 칸은 **날씨 이름**인데, 롬은 그것을 기술 이름표에서
 * 읽는다. 모래바람 201 · 싸라기눈 258이 그 기술 번호다
 */
const WEATHER_MOVE: Record<string, number> = { Sandstorm: 201, Hail: 258 }

/** 매 턴 깎는 기술 중 **저만의 줄**이 있는 것. 나머지는 두루 쓰는 줄로 간다 */
const DAMAGE_BY_MOVE: Record<number, number> = {
  73: MSG.healthIsSappedByLeechSeed,
  191: MSG.isHurtByTheSpikes,
  446: MSG.pointedStonesDugIntoPokemon,
}

/**
 * 명령을 안 듣고 **아무것도 안 했을 때**의 네 마디
 * (`subscript_disobey_do_nothing`). 차례가 원작의 뽑은 값 0~3과 같아야 한다.
 *
 * ⚠️ **롬도 넷을 나란히 들고 있다** — 828부터 「게으름을 피우고 있다!」·
 * 「말을 듣지 않는다!」·「외면했다!」·「모른 체했다!」다. 손으로 들 때는 첫 마디가
 * 「빈둥거리고 있다!」였고 넷째가 「못 들은 척했다!」였다
 */
const idleLine = (flavor: number): number =>
  MSG.pokemonIsLoafingAround + Math.min(Math.max(flavor, 0), 3)

/**
 * 효과의 **한국어** 이름. 못 풀면 null이다.
 *
 * `effectLabel`과 다른 점이 그 하나다 — 저쪽은 못 찾으면 프로토콜의 영어 원문을
 * 주는데, 그 값이 조사가 뒤에 붙는 빈칸에 들어가면 병기형보다 나쁜 것이 뜬다
 */
function romName(effect: EffectRef, names: BattleNames): string | null {
  if (effect.num === null) return null
  const table = effect.kind === 'ability' ? names.abilities : names.moves
  return table[effect.num] ?? null
}

/**
 * 롬의 줄 하나를 칸을 채워 낸다 (PARITY §2.24).
 *
 * 칸은 **온 차례대로** 0번부터 들어간다. 롬의 배틀 글은 빈칸을 0·1·2로 이어
 * 쓰므로 자리를 따로 적을 일이 없다.
 *
 * ⚠️ **칸 하나라도 비면 문장 자체를 비운다.** 조사가 뒤에 붙는 자리라 못 푼
 * 이름을 그냥 넣으면 「Tackle을(를) 스케치했다!」가 화면에 뜬다 — 실제로 그랬다.
 *
 * ⚠️ **뱅크가 안 왔으면 조용하다.** 던지지 않는다 — 글 한 줄 때문에 배틀이
 * 서면 그것이 더 나쁘다
 */
function rom(
  ctx: TextContext, at: number, ...values: readonly (string | null)[]
): string | null {
  return romLine(ctx.lines, at, ...values)
}

/**
 * 이벤트 하나 → 텍스트 한 줄. 문장이 없는 이벤트면 null.
 *
 * 이름을 못 찾으면 프로토콜의 영어 이름으로 떨어진다 — 빈칸이 뜨는 것보다 낫다.
 */
export function battleText(e: BattleEvent, ctx: TextContext): string | null {
  const { names } = ctx

  switch (e.kind) {
    case 'switch': {
      const who = ctx.label(e.actor)
      // 날려버리기·울부짖기로 억지로 나온 자리는 원작이 따로 말한다
      if (e.forced) return rom(ctx, MSG.wasDraggedOut, who)
      if (e.actor.side === 'p1') return rom(ctx, MSG.goPokemon, who)
      // ⚠️ **야생 줄만 이름표를 안 쓴다.** 이 줄은 자리마다 셋으로 갈린 것이
      // 아니라 **한 줄에 「야생 」이 이미 박혀 있어서**, 이름표를 넣으면
      // 「앗! 야생 야생 팬텀이…」가 된다. 그래서 맨 이름을 넣는다
      const bare = ctx.bare?.(e.actor.name) ?? who
      // ⚠️ **트레이너전에서는 「야생」이 아니다.** 한동안 상대 쪽 교체가 전부
      // 이 야생 줄로 떨어져서 체육관 관장이 내보내도 「앗! 야생 켄타로스가
      // 튀어나왔다!」가 떴다. 롬은 그 자리에 분류·이름·포켓몬 세 칸짜리 줄을 쓴다
      const sent = rom(ctx, MSG.trSentOutPokemon, ctx.foeClass ?? null, ctx.foeTrainer ?? null, bare)
      if (sent !== null) return sent
      // 분류가 없는 상대(통신·배틀팩토리)는 이름 한 칸짜리 짝을 쓴다
      const link = rom(ctx, MSG.linkTrSentOutPokemon, ctx.foeName ?? null, bare)
      if (link !== null) return link
      return rom(ctx, MSG.aWildPokemonAppeared, bare)
    }

    case 'move': {
      // 롬은 이 줄을 **기술마다 통째로** 들고 있다 (`moves_used_in_battle`).
      // 이름 빈칸 하나만 채우면 되고, 줄바꿈 자리도 원작 것이다
      const line = e.move === null
        ? null
        : romLine(ctx.moveLines, moveUsedLine(e.move), ctx.label(e.actor))
      if (line !== null) return line
      // ⚠️ **번호를 못 풀면 영어로 떨어진다.** 여기는 조사가 뒤에 안 붙는
      // 자리라 병기형이 안 나고, 빈 줄이 뜨는 것보다 낫다
      return `${ctx.label(e.actor)}의 ${e.moveName}!`
    }

    case 'effectiveness':
      if (e.level === 'super') return rom(ctx, MSG.itsSuperEffective)
      if (e.level === 'resisted') return rom(ctx, MSG.itsNotVeryEffective)
      return rom(ctx, MSG.itDoesntAffectPokemon, ctx.label(e.actor))

    case 'crit':
      return rom(ctx, MSG.aCriticalHit)

    case 'miss':
      // 겨눈 자리를 알면 그쪽 이름으로, 모르면 쓴 쪽 이름으로 — 원작이 두 문장을
      // 따로 들고 있다
      if (e.actor) return rom(ctx, MSG.pokemonAvoidedTheAttack, ctx.label(e.actor))
      return e.source ? rom(ctx, MSG.pokemonsAttackMissed, ctx.label(e.source)) : null

    case 'fail':
      return rom(ctx, MSG.butItFailed)

    case 'faint':
      return rom(ctx, MSG.pokemonFainted, ctx.label(e.actor))

    case 'status':
      if (e.status === 'ok') return null
      return rom(ctx, STATUS_ONSET[e.status], ctx.label(e.actor))

    case 'curestatus':
      if (e.status === 'ok') return null
      return rom(ctx, STATUS_CURED[e.status], ctx.label(e.actor))

    case 'boost': {
      if (e.amount === 0) return null
      // 원작은 한 단계와 **두 단계 위**만 가른다 — 「쭉쭉」도 「뚝」도 없다
      const big = Math.abs(e.amount) >= 2
      const at = e.amount > 0
        ? (big ? MSG.pokemonsStatSharplyRose : MSG.pokemonsStatRose)
        : (big ? MSG.pokemonsStatHarshlyFell : MSG.pokemonsStatFell)
      return rom(ctx, at, ctx.label(e.actor), names.stats[STAT_SLOT[e.stat]] ?? null)
    }

    case 'cant': {
      // 도발·사슬묶기·봉인은 **못 쓴 기술 이름**이 문장에 들어간다
      if (e.reason === 'move: Taunt') {
        const move = e.move !== null ? names.moves[e.move] ?? null : null
        return rom(ctx, MSG.cantUseMoveAfterTheTaunt, ctx.label(e.actor), move)
      }
      const at = CANT_REASON[e.reason]
      return at === undefined ? null : rom(ctx, at, ctx.label(e.actor))
    }

    case 'ability': {
      // ⚠️ **이 한 줄만 우리 것이다.** 원작은 특성이 일한 자리에 이름을 띄우는데
      // 그것이 글이 아니라 화면 부품이라 뱅크에 줄이 없다 (PARITY §2.24)
      const ability = (e.ability !== null ? names.abilities[e.ability] : null) ?? e.abilityName
      return `${ctx.label(e.actor)}의 ${ability}!`
    }

    case 'weather': {
      // 그치는 줄도 날씨마다 다르다. `|-weather|none`은 무엇이 그쳤는지를
      // 안 들고 오므로 `buildBeats`가 직전 뷰에서 읽어 `ended`로 실어 준다.
      // 그것까지 없으면 비운다 — 「날씨가 원래대로 돌아왔다!」 같은 문장은
      // 롬에 없다 (PARITY §2.24)
      if (e.weather === null) {
        const was = e.ended ? WEATHER[e.ended] : undefined
        return was ? rom(ctx, was.stop) : null
      }
      const w = WEATHER[e.weather]
      if (!w) return null
      return rom(ctx, e.upkeep ? w.upkeep : w.start)
    }

    case 'damage': {
      // 기술에 맞은 데미지는 따로 말하지 않는다 — 바로 앞에 기술 줄이 이미 있다
      if (!e.from) return null
      const { kind, id, name } = e.from
      const who = ctx.label(e.actor)
      if (kind === 'status') {
        if (name === 'psn' || name === 'tox') return rom(ctx, MSG.pokemonIsHurtByPoison, who)
        if (name === 'brn') return rom(ctx, MSG.pokemonIsHurtByItsBurn, who)
        return null
      }
      // 날씨는 **날씨 이름이 첫 칸**이다 — 롬은 그것을 기술 이름표에서 읽는다
      const weather = WEATHER_MOVE[name]
      if (weather !== undefined) {
        return rom(ctx, MSG.isBuffetedByTheWeather, names.moves[weather] ?? null, who)
      }
      if (kind === 'move') {
        const at = DAMAGE_BY_MOVE[id ?? -1]
        if (at !== undefined) return rom(ctx, at, who)
        const move = id !== null ? names.moves[id] ?? null : null
        return rom(ctx, MSG.pokemonIsHurtByMove, who, move)
      }
      return null
    }

    case 'heal':
      return rom(ctx, MSG.pokemonRegainedHealth, ctx.label(e.actor))

    case 'ball': {
      if (e.caught) return rom(ctx, MSG.gotchaPokemonWasCaught, ctx.label(e.actor))
      // ⚠️ **흔들린 횟수만큼 줄이 이어져 있다.** 863부터 넷이 차례로
      // 「안돼! 볼에서 나와버렸다!」·「아아! 잡았다고 생각했는데!」·
      // 「아쉽다!…」·「아깝다!…」다. 자리가 곧 아까움의 크기다
      return rom(ctx, MSG.ohNoThePokemonBrokeFree + Math.min(Math.max(e.shakes, 0), 3))
    }

    case 'escape':
      // 배회 포켓몬이 달아난 자리 (PARITY §6.3). 우리가 도망친 것과 글이 다르다.
      // 이 줄도 「야생 」이 문장에 박혀 있어 맨 이름을 넣는다
      if (e.foe) {
        if (!e.actor) return null
        return rom(ctx, MSG.theWildPokemonFled, ctx.bare?.(e.actor.name) ?? ctx.label(e.actor))
      }
      return rom(ctx, e.success ? MSG.gotAwaySafely : MSG.cantEscape)

    case 'reward': {
      // 숫자 뒤에는 조사를 붙이지 않는다 — 읽는 소리로 갈리기 때문에(5는 "오가",
      // 6은 "육이") 받침 규칙으로는 못 고른다. 문장을 그렇게 안 쓰면 그만이다
      const who = ctx.label({ slot: 'p1a', side: 'p1', name: e.key })
      const out: string[] = []
      const push = (line: string | null) => { if (line !== null) out.push(line) }
      push(rom(ctx, MSG.pokemonGainedExpPoints, who, String(e.exp)))
      const top = e.levels[e.levels.length - 1]
      if (top !== undefined) push(rom(ctx, MSG.pokemonGrewToLevel, who, String(top)))
      // 빈 칸에 그냥 들어간 것과, 무엇을 지울지 물어야 하는 것은 다른 문장이다
      for (const move of e.learned) {
        push(rom(ctx, MSG.pokemonLearnedMove, who, names.moves[move] ?? null))
      }
      for (const move of e.pending) {
        push(rom(ctx, MSG.pokemonIsTryingToLearnMove, who, names.moves[move] ?? null))
      }
      // 창을 하나씩 연다 — 경험치 · 레벨 · 배운 기술은 원작도 따로 띄운다
      return out.length === 0 ? null : out.join('\n\n')
    }

    case 'prize':
      // 롬은 주인공 이름을 부르고 **원**으로 센다 — 「엔」은 우리가 적어 둔 것이었다
      return rom(ctx, MSG.playerGotMoneyForWinning, ctx.playerName ?? null, String(e.money))

    case 'shift': {
      const who = ctx.bare?.(e.key) ?? ctx.label({ slot: 'p2a', side: 'p2', name: e.key })
      // 롬은 물음까지 한 줄에 담아 두었다 — 「…내보내려 하고 있다 / 포켓몬을
      // 교체하시겠습니까?」. 예/아니오 창은 우리 쪽이 따로 띄운다
      return rom(ctx, MSG.willYouSwitchYourPokemon, ctx.foeClass ?? null, ctx.foeTrainer ?? null, who)
    }

    case 'trainerItem': {
      const item = names.items[e.item] ?? null
      const line = rom(ctx, MSG.trUsedOneItem, ctx.foeClass ?? null, ctx.foeTrainer ?? null, item)
      if (line !== null) return line
      // ⚠️ **분류가 없는 상대에게는 롬이 이 줄을 안 들고 있다** (통신·배틀팩토리).
      // 「내보냈다」·「걸어왔다」·「이겼다」 셋은 이름 한 칸짜리 짝이 있는데 이
      // 줄만 없다 — 그래서 여기만 우리 말로 떨어진다
      const trainer = ctx.foeName ?? '상대'
      return `${withTopic(trainer)} ${withObject(item ?? `#${String(e.item)}`)} 썼다!`
    }

    case 'bagItem':
      return rom(ctx, MSG.playerUsedOneItem, ctx.playerName ?? null, names.items[e.item] ?? null)

    case 'disobey': {
      const who = ctx.label(e.actor)
      if (e.reason === 'ignoredAsleep') return rom(ctx, MSG.pokemonIgnoredOrdersWhileAsleep, who)
      if (e.reason === 'otherMove') return rom(ctx, MSG.pokemonIgnoredOrders, who)
      if (e.reason === 'nap') return rom(ctx, MSG.pokemonBeganToNap, who)
      // 자기를 때리는 자리는 두 줄이다 — 원작도 「말을 듣지 않는다!」를 먼저 찍는다
      if (e.reason === 'hitSelf') {
        const first = rom(ctx, MSG.pokemonWontObey, who)
        const second = rom(ctx, MSG.itHurtItselfInItsConfusion)
        return first === null || second === null ? null : first + '\n\n' + second
      }
      return rom(ctx, idleLine(e.flavor ?? 0), who)
    }

    case 'safari': {
      // ⚠️ **사파리 줄은 이름표를 안 쓴다.** 롬의 그 줄들은 종족 이름 칸을 쓰고
      // 「야생 」을 안 붙인다 — 사파리는 어차피 야생뿐이라서다
      const who = ctx.bare?.(e.actor.name) ?? ctx.label(e.actor)
      const me = ctx.playerName ?? null
      switch (e.beat) {
        case 'bait': return rom(ctx, MSG.playerThrewSomeBaitAtThePokemon, me, who)
        case 'eating': return rom(ctx, MSG.pokemonIsEating, who)
        case 'busyEating': return rom(ctx, MSG.pokemonIsBusyEating, who)
        case 'mud': return rom(ctx, MSG.playerThrewMudAtThePokemon, me, who)
        case 'angry': return rom(ctx, MSG.pokemonIsAngry, who)
        case 'veryAngry': return rom(ctx, MSG.pokemonIsBesideItselfWithAnger, who)
        // `subscript_safari_escape` — 이름이 「도망」이지만 **안 달아난** 턴의 줄이다
        default: return rom(ctx, MSG.pokemonIsWatchingCarefully, who)
      }
    }

    case 'tie':
      // 롬이 비긴 판을 말하는 자리는 통신뿐이라(`LoadResultMessage`)
      // 이름 칸이 하나다. 상대를 아는 판에서만 그 줄을 쓰고,
      // 야생전처럼 부를 이름이 없으면 우리 한 줄로 남긴다
      return rom(ctx, MSG.playerDrewAgainstLinkTr, ctx.foeName ?? null) ?? '무승부다!'

    // ── 걸림과 풀림 (PARITY §2.25) ───────────────────────────────────────────
    //
    // 모양은 진작에 있었다 — 트레이너 AI가 리플렉터·대타출동·트릭룸을 보라고 준
    // 것이다. 없던 것은 **글**이고, 그래서 씨뿌리기가 걸려도 대타가 나타나도
    // 압정이 깔려도 화면이 한 마디도 안 했다
    case 'volatile': {
      const line = (e.start ? VOLATILE_ON : VOLATILE_OFF)[e.effect.id]
      return line === undefined ? null : line(ctx, {
        who: ctx.label(e.actor),
        of: e.of ? ctx.label(e.of) : null,
        extra: e.extra,
        extraMove: moveLabel(e.extra, names),
        label: effectLabel(e.effect, names),
        romLabel: romName(e.effect, names),
      })
    }

    case 'sidecondition': {
      const at = (e.start ? SIDE_ON : SIDE_OFF)[e.effect.id]
      if (at === undefined) return null
      // 우리 쪽이면 「우리 편은…」, 상대 쪽이면 바로 다음 줄인 「상대는…」이다
      const line = forSide(at, e.side === 'p1')
      return SIDE_NEEDS_MOVE.has(at)
        ? rom(ctx, line, romName(e.effect, names))
        : rom(ctx, line)
    }

    case 'fieldcondition': {
      const at = (e.start ? FIELD_ON : FIELD_OFF)[e.effect.id]
      if (at === undefined) return null
      return FIELD_NEEDS_WHO.has(at)
        ? rom(ctx, at, e.of ? ctx.label(e.of) : null)
        : rom(ctx, at)
    }
    // ── 글만 내는 열둘 (PARITY §2.24) ────────────────────────────────────────
    case 'activate':
    case 'block':
      return effectText(ACTIVATE, e.effect, ctx, {
        who: e.actor ? ctx.label(e.actor) : null,
        of: e.of ? ctx.label(e.of) : null,
        extra: e.extra,
        extraMove: moveLabel(e.extra, names),
        label: effectLabel(e.effect, names),
        romLabel: romName(e.effect, names),
      })

    case 'singleturn':
      return effectText(SINGLE_TURN, e.effect, ctx, {
        who: ctx.label(e.actor),
        of: e.of ? ctx.label(e.of) : null,
        extra: NO_EXTRA,
        extraMove: '',
        label: effectLabel(e.effect, names),
        romLabel: romName(e.effect, names),
      })

    case 'singlemove':
      return effectText(SINGLE_MOVE, e.effect, ctx, {
        who: ctx.label(e.actor),
        of: null,
        extra: NO_EXTRA,
        extraMove: '',
        label: effectLabel(e.effect, names),
        romLabel: romName(e.effect, names),
      })

    case 'prepare': {
      // 기술 번호가 아니라 **이름을 접어** 찾는다 — 번호는 롬 표가 있어야 풀리는데
      // 이 줄은 표가 아직 안 왔을 때도 와서, 번호로 찾으면 조용히 비는 자리가 생긴다
      const at = PREPARE[foldName(e.moveName)]
      return at === undefined ? null : rom(ctx, at, ctx.label(e.actor))
    }

    case 'hitcount':
      return rom(ctx, MSG.hitXTimes, String(e.count))

    case 'notarget':
      return rom(ctx, MSG.butThereWasNoTarget)

    case 'ohko':
      return rom(ctx, MSG.itsAOneHitKO)

    case 'fieldactivate': {
      const at = FIELD_ACTIVATE[e.effect.id]
      return at === undefined ? null : rom(ctx, at)
    }

    case 'cureteam':
      // 4세대에서 이 줄을 내는 것은 아로마테라피 하나다. 치유방울은 같은 일을
      // 하면서도 `-activate|move: Heal Bell`로 나가고 글도 다르다
      return rom(ctx, MSG.aSoothingAromaWaftedThroughTheArea)

    case 'endability':
      // 4세대에서는 위장약 하나가 이 줄을 낸다
      return rom(ctx, MSG.pokemonsAbilityWasSuppressed, ctx.label(e.actor))

    // 다음 턴에 「움직일 수 없다!」를 찍는 것은 `cant|recharge`다. 여기서 또 찍으면
    // 한 번 쉬는 데 글이 두 줄이 된다
    case 'mustrecharge':
      return null

    // 쇼다운이 사람에게 규칙을 설명하는 줄이라 원작에 없다
    case 'hint':
      return null

    default:
      return null
  }
}

/** `Focus Punch` · `move: Focus Punch` → `focuspunch`. `conditionId`와 같은 접기다 */
function foldName(raw: string): string {
  const colon = raw.indexOf(':')
  const body = colon < 0 ? raw : raw.slice(colon + 1)
  return body.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** 붙어 온 값이 없는 줄 (`-singleturn`·`-singlemove`)이 쓰는 빈 칸 */
const NO_EXTRA: EffectExtra = { num: null, move: null, moveName: null }

/** 붙어 온 기술의 한국어 이름. 번호가 안 풀리면 원문 */
function moveLabel(extra: EffectExtra, names: BattleNames): string {
  if (extra.moveName === null) return ''
  return (extra.move !== null ? names.moves[extra.move] : null) ?? extra.moveName
}

/** 효과의 한국어 이름. 롬 번호가 풀리면 그것을, 아니면 원문을 쓴다 */
function effectLabel(effect: EffectRef, names: BattleNames): string {
  if (effect.num === null) return effect.name
  const table = effect.kind === 'ability' ? names.abilities : names.moves
  return table[effect.num] ?? effect.name
}

/**
 * 효과 표에서 한 줄을 찾는다. 없으면 조용하다 — **특성만 빼고**.
 *
 * ⚠️ **특성은 배너로 떨어진다.** 원작은 특성이 일한 자리에서 특성 이름을 먼저
 * 띄우고(`모부기의 위협!`) 그 다음 문장을 찍는다. 우리 `-ability` 줄이 이미
 * 그 문장을 쓰고 있으므로, 문구를 못 댄 특성은 적어도 **누가 일했는지**까지는
 * 원작과 같은 말로 말한다. 기술은 이렇게 못 한다 — `모부기의 방어!`는 기술을
 * **쓴** 줄의 문장이라 막은 자리에 놓으면 거짓말이 된다
 */
function effectText(
  table: Record<string, EffectLine>,
  effect: EffectRef,
  ctx: TextContext,
  say: EffectSay,
): string | null {
  const line = table[effect.id]
  if (line) return line(ctx, say)
  if (effect.kind === 'ability' && say.who !== null) return `${say.who}의 ${say.label}!`
  return null
}
