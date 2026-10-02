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
  Actor, BattleEvent, Cause, CuredBy, EffectExtra, EffectRef, ItemRef,
} from '../../engine/battle/events'
import { rewardSteps } from '../../engine/battle/events'
import type { Status } from '../../engine/pokemon/instance'
import { withObject, withTopic } from '../korean'
import { ownerOfKey } from '../../engine/battle/aftermath'
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
  /**
   * 상태 이름 일곱 (`status_condition_names` · us 219). 자리는 디컴프의 `MSGCOND_*`다 —
   * 잠듦 0 · 독 1 · 화상 2 · 마비 3 · 얼음 4 · 혼란 5 · 헤롱헤롱 6.
   *
   * 롬의 「{도구}로 {상태}상태가 나았다!」(893)가 이 이름을 `{STRVAR_1 17, …}` 칸으로
   * 받는다. 없으면 그 줄을 못 채워서 멘탈허브가 헤롱헤롱이 풀린 줄로 떨어진다
   */
  conditions?: readonly string[]
}

/** `MSGCOND_INFATUATION` — 상태 이름표에서 헤롱헤롱의 자리 (`battle/btlcmd.h`) */
const COND_INFATUATION = 6

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
  /**
   * 그 마리를 낸 트레이너 (PARITY §2.2b). 한 쪽에 트레이너가 둘인 판에서 교체·도구
   * 줄의 주어를 가른다 — 원작은 전투원마다 제 트레이너 이름을 넣는다
   * (`LoadSendOutMessage`의 `params[0] = battlerData->battler`). 모르면 null이고,
   * 그때는 `foeClass`·`foeTrainer`다
   */
  trainerOf?: (key: string) => { cls: string | null; name: string | null } | null
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
 * 다만 **특성은 예외**로 `effectText`가 「{이름}의 {특성}!」 띄우개로 떨어진다
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
  // 예지몽 특성. 간파한 기술이 `[move]`로 온다 (`@pkmn/protocol`이 자리 인자를 옮긴다).
  // 원작도 나올 때 이 한 줄뿐이고 특성 이름을 따로 안 띄운다 (`subscript_forewarn`)
  forewarn: (c, s) => (s.extra.move === null
    ? null
    : rom(c, MSG.pokemonsAbilityAlertedItToMove, s.who, s.romLabel, s.extraMove)),
  // ── 도구가 일했다. 도구 이름이 빈칸이다 (`romLabel`이 도구 이름표에서 읽는다) ──
  // 기합의머리띠가 1을 남겼다 — 기합의띠와 같은 줄이다 (`subscript_move_followup_message`)
  focusband: (c, s) => rom(c, MSG.pokemonHungOnUsingItsItem, s.who, s.romLabel),
  // 과사열매. 채운 기술이 `[move]`로 붙어 온다 (`subscript_held_item_pp_restore`)
  leppaberry: (c, s) => (s.extra.move === null
    ? null
    : rom(c, MSG.pokemonRestoredMovesPPUsingItsItem, s.who, s.romLabel, s.extraMove)),
  // ⚠️ **점착은 4세대 뱅크에 줄이 없다.** 「뺏」이 1,269줄에서 0건이다 — 5세대
  // 이후에 생긴 글이라 여기서는 비운다.
  // ⚠️ **선제공격손톱도 조용하다.** `subscript_check_quick_claw`가 손톱이면 연출만 틀고
  // 넘어간다 — 「{도구}로 행동이 빨라졌다!」는 **애슈열매**(`BATTLEMON_CUSTAP_BERRY`) 갈래에서만 찍는다
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
 * ⚠️ **여기 없는 것은 조용하다.** 특성 띄우개로도 안 떨어뜨린다 — 날씨부정은
 * 4세대 뱅크에 줄이 없고, 원작이 아무 말도 안 하는 자리에 이름을 띄우면
 * 그것이 지어낸 것이다. 나올 때 말하는 특성(프레셔·틀깨기)은 `-ability` 갈래가 맡는다
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
  // 틀깨기는 걸어 두는 것이 아니다 — 쇼다운은 `-ability`로 보내고 그 줄은 `ABILITY_SHOWN`이 말한다.
  // `-start`로 와도 같은 글이 되게 여기도 둔다 (프레셔와 같다)
  moldbreaker: (c, s) => rom(c, MSG.pokemonWasAbility, s.who, s.romLabel),
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
 * 나올 때 특성이 스스로 알리는 줄 (`-ability` · `BattleSystem_TriggerEffectOnSwitch`).
 *
 * 4세대에는 특성 이름 띄우개가 없다 — 원작은 특성마다 **문장 하나**로 말한다
 * (`subscript_pressure` · `subscript_mold_breaker` · `subscript_anticipation`). 쇼다운이
 * 이 셋에 보내는 `|-ability|`는 이름만 들고 오므로 칸은 자리와 특성 이름 둘이다.
 * 열쇠는 특성 원문 이름을 접은 것이다 — 번호는 롬 표가 있어야 풀린다
 */
const ABILITY_SHOWN: Record<string, (ctx: TextContext, who: string, ability: string | null) => string | null> = {
  pressure: (c, who, ability) => rom(c, MSG.isExertingItsAbility, who, ability),
  moldbreaker: (c, who, ability) => rom(c, MSG.pokemonWasAbility, who, ability),
  anticipation: (c, who, ability) => rom(c, MSG.pokemonsAbilityMadeItShudder, ability, who),
}

/**
 * `-ability`가 와도 **원작은 아무 말도 안 하는** 특성. 에어록·날씨부정은 4세대의
 * 등장 점검(`SwitchInCheckState`)에 갈래가 없고 뱅크에도 줄이 없다 — 이름을 띄우면
 * 그것이 지어낸 것이다
 */
const ABILITY_QUIET = new Set(['airlock', 'cloudnine'])

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
  const table = effect.kind === 'ability' ? names.abilities
    : effect.kind === 'item' ? names.items : names.moves
  return table[effect.num] ?? null
}

/** 도구의 한국어 이름. 못 풀면 null — 조사가 뒤에 붙는 빈칸이라 영어로 안 떨어진다 */
function itemName(item: ItemRef | null | undefined, names: BattleNames): string | null {
  if (!item || item.num === null) return null
  return names.items[item.num] ?? null
}

/** `[from] item: …`의 한국어 이름. 도구가 원인이 아니면 null */
function causeItem(from: Cause | null | undefined, names: BattleNames): string | null {
  if (!from || from.kind !== 'item' || from.id === null) return null
  return names.items[from.id] ?? null
}

/**
 * 판 도중 우리 등판의 다섯 갈래 (`battle_display.c` `LoadSendOutMessage`).
 *
 * 값은 상대 첫 자리의 체력 천분율이다(`BattleController_EmitSendOutMessage` — 0이면
 * 1000). 모르면(첫 등판·더블) 「가랏!」이다
 */
function sendOutLine(permille: number | undefined): number {
  if (permille === undefined) return MSG.goPokemon
  if (permille < 100) return MSG.yourFoesWeakGetEmPokemon
  if (permille < 325) return MSG.justALittleMoreHangInTherePokemon
  if (permille < 550) return MSG.goForItPokemon
  if (permille < 775) return MSG.youreInChargePokemon
  return MSG.goPokemon
}

/**
 * 우리 쪽 회수의 다섯 갈래 (`battle_display.c` `LoadRecallMessage`).
 *
 * ⚠️ **앞 마리의 체력이 아니다.** 원작이 재는 것은 「그 판에 마지막으로 누가 나온 뒤
 * 상대 첫 자리가 잃은 체력의 백분율」이다(`(hpTemp - curHP) * 100 / hpTemp`). 많이
 * 깎았을수록 칭찬이 커진다. 더블은 늘 「돌아와!」다
 */
function recallLine(percent: number | null): number {
  if (percent === null) return MSG.pokemonComeBack
  if (percent === 0) return MSG.pokemonSwitchOutComeBack
  if (percent < 25) return MSG.pokemonComeBack
  if (percent < 50) return MSG.pokemonGoodComeBack
  if (percent < 75) return MSG.pokemonOKComeBack
  return MSG.pokemonEnoughGetBack
}

/**
 * 열매가 상태이상을 고친 줄 — 상태마다 스크립트가 따로다 (`subscript_held_item_*_restore`).
 * 리샘열매도 하나만 고쳤으면 이 줄이다. 상태이상과 혼란을 함께 고쳤을 때만 한 줄로
 * 몰아 말한다 (`CuredBy.all` · `subscript_held_item_multi_restore`)
 */
const ITEM_CURED: Record<Exclude<Status, 'ok'>, number> = {
  par: MSG.pokemonsItemCuredItsParalysis,
  psn: MSG.pokemonsItemCuredItsPoison,
  tox: MSG.pokemonsItemCuredItsPoison,
  brn: MSG.pokemonsItemCuredItsBurn,
  frz: MSG.pokemonsItemDefrostedIt,
  slp: MSG.pokemonsItemWokeItUp,
}

/** 열매가 고친 줄. 함께 고쳤으면 한 줄로 몬다 — 두 사건이 같은 글이 되어 박자가 한 번만 띄운다 */
function curedLine(ctx: TextContext, who: string, by: CuredBy, alone: number): string | null {
  return rom(ctx, by.all ? MSG.pokemonNormalizedItsStatusUsingItsItem : alone, who, itemName(by.item, ctx.names))
}

/**
 * 조금씩 채우는 도구 (`subscript_restore_a_little_hp`) — 먹다남은음식 · 검은진흙 ·
 * 조개껍질방울. 나머지(체력 열매 · 나무열매쥬스)는 「체력을 회복했다」다
 */
const HEALS_A_LITTLE = new Set(['leftovers', 'blacksludge', 'shellbell'])

/**
 * 따로 이유 없이 `|-enditem|`만 오는 도구 중 **원작이 말하는 것** — 도구를 쓴 그 줄에
 * 글이 있다. 나머지(열매를 먹은 자리 등)는 뒤따르는 회복·랭크 줄이 도구를 부른다
 */
const USED_ITEM: Record<string, number> = {
  // 기합의띠가 1을 남겼다 (`subscript_move_followup_message`)
  focussash: MSG.pokemonHungOnUsingItsItem,
  // 하양허브 — 뒤따르는 `-clearnegativeboost`는 글이 없다 (`subscript_held_item_statdown_restore`)
  whiteherb: MSG.pokemonRestoredItsStatusUsingItsItem,
  // 파워풀허브 (`subscript_power_herb_skull_bash` · `subscript_item_skip_charge_turn`)
  powerherb: MSG.pokemonBecameFullyChargedDueToItsItem,
  // 미클열매 (`subscript_held_item_temp_acc_up`)
  micleberry: MSG.pokemonsBoostedTheAccuracyOfItsNextMoveUsingItsItem,
}

/**
 * 기술 하나를 잊고 새 기술을 배운 뒤의 줄 (`battle_script.c` `SEQ_GET_EXP_ONE_TWO_POOF` 이후).
 *
 * 잊으면 「1, 2, ... ... 짠!」 → 「{이름}은 {옛 기술}을 깨끗이 잊었다!」 → 「그리고!」 →
 * 「{이름}은 새로 {새 기술}을 배웠다!」 넷이고, 포기하면 「결국 배우지 않았다!」 한 줄이다
 * (`SEQ_GET_EXP_GIVE_UP_LEARNING_ANSWER`). 묻는 창(`LearnMove`)이 답을 받은 **뒤에** 이 줄들이
 * 글 박자로 이어진다. 칸을 못 채운 줄은 빠진다 — 반쪽 문장을 놓느니 비운다
 */
export function learnResultLines(
  lines: readonly string[],
  result: { who: string; forgot: string; learned: string } | { who: string; declined: string },
): string[] {
  const out = 'declined' in result
    ? [romLine(lines, MSG.pokemonDidNotLearnMove2, result.who, result.declined)]
    : [
        romLine(lines, MSG.battleOneTwoAndPoof),
        romLine(lines, MSG.battlePokemonForgotHowToUseMove, result.who, result.forgot),
        romLine(lines, MSG.battleAndDotDotDot),
        romLine(lines, MSG.battlePokemonLearnedMove, result.who, result.learned),
      ]
  return out.filter((line): line is string => line !== null)
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
      // 싱글 판 도중이면 상대가 얼마나 남았느냐로 말이 갈린다 — 그 값은 박자가 실어 준다
      // (`playback`의 `foeHpPermille`). 첫 등판·더블은 값이 없어 「가랏!」이다
      if (e.actor.side === 'p1') return rom(ctx, sendOutLine(e.foeHpPermille), who)
      // ⚠️ **야생 줄만 이름표를 안 쓴다.** 이 줄은 자리마다 셋으로 갈린 것이
      // 아니라 **한 줄에 「야생 」이 이미 박혀 있어서**, 이름표를 넣으면
      // 「앗! 야생 야생 팬텀이…」가 된다. 그래서 맨 이름을 넣는다
      const bare = ctx.bare?.(e.actor.name) ?? who
      // ⚠️ **트레이너전에서는 「야생」이 아니다.** 한동안 상대 쪽 교체가 전부
      // 이 야생 줄로 떨어져서 체육관 관장이 내보내도 「앗! 야생 켄타로스가
      // 튀어나왔다!」가 떴다. 롬은 그 자리에 분류·이름·포켓몬 세 칸짜리 줄을 쓴다
      const who2 = ctx.trainerOf?.(e.actor.name) ?? null
      const sent = rom(ctx, MSG.trSentOutPokemon,
        who2?.cls ?? ctx.foeClass ?? null, who2?.name ?? ctx.foeTrainer ?? null, bare)
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

    case 'status': {
      if (e.status === 'ok') return null
      // 맹독구슬·화염구슬은 도구를 문장에 넣는다 (`subscript_badly_poison` · `subscript_burn`)
      const item = causeItem(e.from, names)
      if (e.from?.kind === 'item') {
        if (e.status === 'tox') return rom(ctx, MSG.pokemonWasBadlyPoisonedByTheItem, ctx.label(e.actor), item)
        if (e.status === 'brn') return rom(ctx, MSG.pokemonGotABurnFromTheItem, ctx.label(e.actor), item)
      }
      return rom(ctx, STATUS_ONSET[e.status], ctx.label(e.actor))
    }

    case 'curestatus':
      if (e.status === 'ok') return null
      // 열매가 고쳤으면 열매를 부른다 — 무엇을 먹었는지는 박자가 붙여 준다(`playback`)
      if (e.curedBy) return curedLine(ctx, ctx.label(e.actor), e.curedBy, ITEM_CURED[e.status])
      return rom(ctx, STATUS_CURED[e.status], ctx.label(e.actor))

    case 'boost': {
      if (e.amount === 0) return null
      // 도구가 올렸으면 도구가 주어다 — 한 단계든 두 단계든 「올라갔다」고, 스타열매만
      // 「크게」다 (`BtlCmd_ChangeStatStage`의 `SIDE_EFFECT_TYPE_HELD_ITEM` · `subscript_held_item_sharply_raise_stat`)
      if (e.from?.kind === 'item' && e.amount > 0) {
        return rom(ctx,
          e.amount >= 2 ? MSG.theItemSharplyRaisedPokemonsStat : MSG.theItemRaisedPokemonsStat,
          ctx.label(e.actor), causeItem(e.from, names), names.stats[STAT_SLOT[e.stat]] ?? null)
      }
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
      const id = foldName(e.abilityName)
      if (ABILITY_QUIET.has(id)) return null
      const who = ctx.label(e.actor)
      const ko = e.ability !== null ? names.abilities[e.ability] ?? null : null
      // 프레셔·틀깨기·위험예지는 롬 문장이다. 칸을 못 채우면(이름표·뱅크가 없다) 아래로 떨어진다
      const shown = ABILITY_SHOWN[id]?.(ctx, who, ko) ?? null
      if (shown !== null) return shown
      // ⚠️ **나머지는 우리 띄우개다.** 위협·다운로드처럼 랭크를 바꾸는 특성은 원작이 이름을
      // 따로 안 띄우고 랭크 줄 하나에 특성을 넣어 말한다(「{건 쪽}의 {특성} 때문에 {받는 쪽}의
      // {능력}이 떨어졌다!」 · `subscript_intimidate` → `BATTLE_SUBSCRIPT_UPDATE_STAT_STAGE`).
      // 쇼다운은 그 원인을 `-ability`에만 싣고 뒤따르는 `-unboost`에는 안 실어서, 한 사건으로는
      // 그 줄을 못 채운다 — 박자가 원인을 랭크 사건에 옮겨 주기 전까지는 누가 일했는지만 말한다
      return `${who}의 ${ko ?? e.abilityName}!`
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
      if (kind === 'item') {
        const item = causeItem(e.from, names)
        // 자보열매·애터열매 — 맞힌 쪽이 **남의 도구**에 다친다 (`subscript_held_item_recoil_when_hit`)
        if (e.of) return rom(ctx, MSG.pokemonIsHurtByPokemonsItem, who, ctx.label(e.of), item)
        // 생명의구슬은 원작이 아무 말도 안 한다 (`subscript_lose_hp_from_item` — 글 없는 쪽)
        if (name === 'Life Orb') return null
        return rom(ctx, MSG.pokemonIsHurtByItsItem, who, item)
      }
      return null
    }

    case 'heal': {
      // 도구가 채웠으면 도구를 부른다. 먹다남은음식 같은 것은 「조금 회복했다」다
      const item = causeItem(e.from, names)
      if (e.from?.kind === 'item') {
        const little = HEALS_A_LITTLE.has(e.from.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
        return rom(ctx,
          little ? MSG.pokemonRestoredALittleHPUsingItsItem : MSG.pokemonRestoredItsHealthUsingItsItem,
          ctx.label(e.actor), item)
      }
      return rom(ctx, MSG.pokemonRegainedHealth, ctx.label(e.actor))
    }

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
      // ⚠️ **레벨마다 한 줄이다.** 원작은 오른 레벨마다 「레벨 N으로 올랐다!」를 찍고
      // 그 레벨의 기술까지 다 본 뒤에 다음 레벨로 간다 (`SEQ_GET_EXP_CHECK_LEARN_MOVE` →
      // `SEQ_GET_EXP_GAUGE`). 한동안 마지막 레벨 하나만 말해서 5→8이면 6·7이 사라졌다
      for (const part of rewardSteps(e)) {
        if (part.step !== null) push(levelLine(ctx, who, part.step.level))
        for (const move of part.learned) push(learnLine(ctx, who, move, true))
        for (const move of part.pending) push(learnLine(ctx, who, move, false))
      }
      // 창을 하나씩 연다 — 경험치 · 레벨 · 배운 기술은 원작도 따로 띄운다
      return out.length === 0 ? null : out.join('\n\n')
    }

    // 박자가 경험치 하나를 레벨마다 편 조각들 (`playback`)
    case 'levelup':
      return levelLine(ctx, ctx.label({ slot: 'p1a', side: 'p1', name: e.key }), e.level)

    case 'learnmove':
      return learnLine(ctx, ctx.label({ slot: 'p1a', side: 'p1', name: e.key }), e.move, e.learned)

    // 막대만 민다
    case 'expgauge':
      return null

    // ── 교체의 앞 마리 (`LoadRecallMessage`) ─────────────────────────────────
    case 'recall': {
      if (e.actor.side === 'p1') return rom(ctx, recallLine(e.percent), ctx.label(e.actor))
      // 상대는 트레이너가 거둔다. 이 줄도 「상대 」가 아니라 맨 이름이다 — 트레이너
      // 이름이 앞에 있다 (`trSentOutPokemon`과 같은 자리)
      const bare = ctx.bare?.(e.actor.name) ?? ctx.label(e.actor)
      const owner = ctx.trainerOf?.(e.actor.name) ?? null
      const line = rom(ctx, MSG.trWithdrewPokemon,
        owner?.cls ?? ctx.foeClass ?? null, owner?.name ?? ctx.foeTrainer ?? null, bare)
      if (line !== null) return line
      return rom(ctx, MSG.linkTrWithdrewPokemon, ctx.foeName ?? null, bare)
    }

    // ── 도구와 변신 (PARITY §2.24) ───────────────────────────────────────────
    case 'item': {
      const item = itemName(e.item, names)
      const by = e.from
      // 통찰 — 자리가 비어 오고 통찰한 쪽이 `[of]`다 (`subscript_frisk`)
      if (by?.kind === 'ability' && by.name === 'Frisk') {
        return e.of ? rom(ctx, MSG.pokemonFriskedItsFoeAndFoundOneItem, ctx.label(e.of), item) : null
      }
      if (by?.kind !== 'move' || !e.actor) return null
      const move = by.name.toLowerCase().replace(/[^a-z]/g, '')
      // 도둑질 · 탐내다 — 「{빼앗은 쪽}은 {빼앗긴 쪽}으로부터 {도구}를 빼앗았다!」
      if (move === 'thief' || move === 'covet') {
        return e.of ? rom(ctx, MSG.pokemonStolePokemonsItem, ctx.label(e.actor), ctx.label(e.of), item) : null
      }
      // 트릭 · 바꿔치기 — 받은 쪽마다 한 줄 (`subscript_exchange_items`). 차례는 박자가 맞춘다
      if (move === 'trick' || move === 'switcheroo') {
        return rom(ctx, MSG.pokemonObtainedOneItem, ctx.label(e.actor), item)
      }
      // 리사이클 (`effect_script_0184`)
      if (move === 'recycle') return rom(ctx, MSG.pokemonFoundOneItem, ctx.label(e.actor), item)
      return null
    }

    case 'enditem': {
      // 트릭·도둑질이 **넘겨준 쪽** — 받은 쪽의 `-item`이 말한다
      if (e.silent) return null
      const who = ctx.label(e.actor)
      const item = itemName(e.item, names)
      // 애슈열매는 뒤따르는 줄이 없다 — 쇼다운은 이 다음에 사람에게 보이는 영어 한 줄
      // (`|-message|Custap Berry activated.`)만 보내고, 원작은 먹은 그 자리에서 말한다
      // (`subscript_check_quick_claw`의 `BATTLEMON_CUSTAP_BERRY` 갈래)
      if (e.how === 'eat' && e.item.id === 'custapberry') {
        return rom(ctx, MSG.pokemonsItemLetItMoveFirst, who, item)
      }
      // 열매를 먹은 줄은 뒤따르는 회복·치료·랭크 줄이 열매를 부른다 — 여기서 또
      // 말하면 한 번 먹는 데 두 줄이 된다
      if (e.how === 'eat') return null
      // 반감 열매 — 「{열매}가 {기술}의 위력을 약하게 했다!」 (`subscript_type_resist_berry`)
      if (e.how === 'weaken') {
        const move = e.move != null ? names.moves[e.move] ?? null : null
        return rom(ctx, MSG.theItemWeakenedMovesPower, item, move)
      }
      // 쪼아대기 · 벌레먹음 — 빼앗아 먹은 쪽이 `[of]`다 (`subscript_pluck`)
      if (e.how === 'stealeat') {
        return e.of ? rom(ctx, MSG.pokemonStoleAndAteItsFoesItem, ctx.label(e.of), item) : null
      }
      const move = e.from?.kind === 'move' ? e.from.name.toLowerCase().replace(/[^a-z]/g, '') : ''
      // 탁쳐서떨구기 — 「{친 쪽}은 {맞은 쪽}의 {도구}를 탁쳐서 떨구었다!」 (`BtlCmd_TryKnockOff`)
      if (move === 'knockoff') {
        return e.of ? rom(ctx, MSG.pokemonKnockedOffPokemonsItem, ctx.label(e.of), who, item) : null
      }
      // 내던지기 (`effect_script_0233`)
      if (move === 'fling') return rom(ctx, MSG.pokemonFlungItsItem, who, item)
      const at = e.from === null ? USED_ITEM[e.item.id] : undefined
      return at === undefined ? null : rom(ctx, at, who, item)
    }

    case 'transform':
      // 둘째 칸은 별명이 아니라 **종 이름**이다 (`TAG_NICKNAME_POKE`). 박자가 따라 한
      // 쪽의 종을 붙여 준다
      return rom(ctx, MSG.pokemonTransformedIntoPokemon, ctx.label(e.actor),
        e.species != null ? names.species[e.species] ?? null : null)

    // 하양허브의 글은 앞의 `enditem`이 냈다
    case 'clearnegativeboosts':
      return null

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
      // 트레이너가 둘이면 **그 마리의 트레이너**가 쓴 것이다 (`aiContext.usedItem[battler >> 1]`)
      const user = ctx.trainerOf?.(e.key) ?? null
      const line = rom(ctx, MSG.trUsedOneItem,
        user?.cls ?? ctx.foeClass ?? null, user?.name ?? ctx.foeTrainer ?? null, item)
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
      // 열매가 혼란을 풀었으면 열매를 부른다 (`subscript_held_item_cnf_restore` · 리샘열매는 `…_multi_restore`)
      if (!e.start && e.curedBy && e.effect.id === 'confusion') {
        return curedLine(ctx, ctx.label(e.actor), e.curedBy, MSG.pokemonsItemSnappedItOutOfConfusion)
      }
      // 멘탈허브가 헤롱헤롱을 풀었다 — 상태 이름이 칸이다 (`subscript_held_item_heal_infatuation`
      // · `msgTemp = MSGCOND_INFATUATION`). 이름표가 없으면 아래 「헤롱헤롱이 풀렸다」로 떨어진다
      if (!e.start && e.curedBy && e.effect.id === 'attract') {
        const cured = rom(ctx, MSG.pokemonCuredItsStatusUsingItsItem, ctx.label(e.actor),
          itemName(e.curedBy.item, names), names.conditions?.[COND_INFATUATION] ?? null)
        if (cured !== null) return cured
      }
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

/**
 * 첫 등판의 두 줄을 **한 창**으로 (PARITY §2.2b · `LoadLeadMonMessage`).
 *
 * 더블의 첫 등판은 한 쪽에 공이 둘 날아가도 글은 한 줄이다 — 원작이 쪽마다
 * `PrintFirstSendOutMessage` 한 번을 부르고, 형식에 따라 줄이 갈린다
 * (`battle_display.c` 6028~6150):
 *
 *   상대 쪽  트레이너 둘 → `Tr1SentOutPokemon1Tr2SentOutPokemon2`
 *            한 사람의 더블 → `TrSentOutPokemon1AndPokemon2`
 *            야생 둘(편과 함께) → `AWildPokemonAndPokemonAppeared`
 *   우리 쪽  편이 있다 → `TrSentOutPokemon1GoPokemon2` (편이 첫 칸)
 *            내가 둘을 낸다 → `GoPokemon1AndPokemon2`
 *
 * 돌려주는 것은 사건 → 그 자리의 글이다. 한 쪽의 두 등판 중 **한 사건에만** 줄을
 * 싣고 다른 하나는 null로 비운다 — 재생기는 글 없는 사건을 공만 던지는 박자로
 * 편다(`buildBeats`). 등판은 몸이 먼저 서고 글이 뒤라서 **뒤 사건에** 싣는다 — 두 마리가 다 선 뒤에 한 줄이 뜬다.
 *
 * 롬 줄을 못 채우면(뱅크가 안 왔다) 아무것도 안 돌려준다 — 사건마다의 줄로 떨어진다
 */
export function leadLines(
  events: readonly BattleEvent[],
  ctx: TextContext,
  setup: {
    /** 트레이너전인가. 아니면 야생이다 */
    trainer: boolean
    /** 편. 있으면 우리 쪽 첫 줄의 첫 칸이다 */
    partner: { cls: string | null; name: string | null } | null
  },
): Map<BattleEvent, string | null> {
  const out = new Map<BattleEvent, string | null>()
  let from = 0
  while (from < events.length && events[from]!.kind !== 'switch') from++
  let to = from
  while (to < events.length && events[to]!.kind === 'switch') to++
  const lead = events.slice(from, to)
    .filter((e): e is Extract<BattleEvent, { kind: 'switch' }> => e.kind === 'switch')
  const bare = (key: string): string => ctx.bare?.(key) ?? key

  const foe = lead.filter((e) => e.actor.side === 'p2')
  if (foe.length === 2) {
    const [a, b] = foe[0]!.actor.slot === 'p2a' ? [foe[0]!, foe[1]!] : [foe[1]!, foe[0]!]
    let line: string | null
    if (!setup.trainer) {
      line = rom(ctx, MSG.aWildPokemonAndPokemonAppeared, bare(a.actor.name), bare(b.actor.name))
    } else {
      const ta = ctx.trainerOf?.(a.actor.name) ?? null
      const tb = ctx.trainerOf?.(b.actor.name) ?? null
      // ⚠️ **991은 배틀 형식으로 고른다** (`battle_display.c` 6073 — `BATTLE_TYPE_TAG`나
      // `2vs2`면 무조건). 두 마리의 주인이 다르면 트레이너 둘이다 — 이름을 견주면 안 된다:
      // 조무래기 둘(521·527 · 514·522 · 414·415 · 848·849)은 분류도 이름도 같아서
      // 「조무래기는 A와 B를 내보냈다」(973)로 떨어졌다
      const two = ownerOfKey(a.actor.name) !== ownerOfKey(b.actor.name)
      line = ta !== null && tb !== null && two
        ? rom(ctx, MSG.tr1SentOutPokemon1Tr2SentOutPokemon2,
          ta.cls, ta.name, bare(a.actor.name), tb.cls, tb.name, bare(b.actor.name))
        : rom(ctx, MSG.trSentOutPokemon1AndPokemon2,
          ta?.cls ?? ctx.foeClass ?? null, ta?.name ?? ctx.foeTrainer ?? null,
          bare(a.actor.name), bare(b.actor.name))
    }
    if (line !== null) {
      // 서 있는 둘 **뒤에** 글이 뜬다 — 뒤 사건에 싣는다. 원작은 트레이너전만 글이 먼저지만, 등판은 몸이 먼저 서고 글이
      // 뒤다(사용자 결정 · `engine/battle/playback`의 `switch`)
      out.set(foe[1]!, line)
      out.set(foe[0]!, null)
    }
  }

  const ours = lead.filter((e) => e.actor.side === 'p1')
  if (ours.length === 2) {
    const ally = setup.partner
    const line = ally !== null
      ? rom(ctx, MSG.trSentOutPokemon1GoPokemon2, ally.cls, ally.name,
        bare(ours[0]!.actor.name), ctx.label(ours[1]!.actor))
      : rom(ctx, MSG.goPokemon1AndPokemon2, ctx.label(ours[0]!.actor), ctx.label(ours[1]!.actor))
    if (line !== null) {
      out.set(ours[1]!, line)
      out.set(ours[0]!, null)
    }
  }
  return out
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

/** 「{이름}은 레벨 {N}으로 올랐다!」 */
function levelLine(ctx: TextContext, who: string, level: number): string | null {
  return rom(ctx, MSG.pokemonGrewToLevel, who, String(level))
}

/**
 * 레벨업 기술 한 줄. 빈 칸에 들어갔으면 「배웠다!」, 칸이 차 있으면 원작 차례대로
 * 「배우고 싶다...!」 → 「그러나 … 기술을 4개 알고 있으므로 …」 두 창이다
 * (`SEQ_GET_EXP_WANTS_TO_LEARN_MOVE_PRINT` → `SEQ_GET_EXP_CANT_LEARN_MORE_MOVES_PRINT`)
 */
function learnLine(ctx: TextContext, who: string, move: number, learned: boolean): string | null {
  const name = ctx.names.moves[move] ?? null
  if (learned) return rom(ctx, MSG.pokemonLearnedMove, who, name)
  const want = rom(ctx, MSG.pokemonWantsToLearnMove, who, name)
  const full = rom(ctx, MSG.butPokemonCantLearnMoreThanFourMoves, who)
  return want === null || full === null ? null : want + '\n\n' + full
}

/**
 * 효과 표에서 한 줄을 찾는다. 없으면 조용하다 — **특성만 빼고**.
 *
 * ⚠️ **특성은 띄우개로 떨어진다.** 문구를 못 댄 특성은 `-ability`의 띄우개와 같은
 * 「{이름}의 {특성}!」으로 적어도 **누가 일했는지**는 말한다. 원작 문장이 아니므로
 * 롬 줄이 있는 특성은 표에 올린다(예지몽 특성처럼). 기술은 이렇게 못 한다 —
 * `모부기의 방어!`는 기술을 **쓴** 줄의 문장이라 막은 자리에 놓으면 거짓말이 된다
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
