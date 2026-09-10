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
  Actor, BattleEvent, BoostStat, EffectExtra, EffectRef,
} from '../../engine/battle/events'
import type { Status } from '../../engine/pokemon/instance'
import { formatMessage, MESSAGE_SLOTS, MessageSlots } from '../../engine/script/text'
import { withObject, withSubject, withTopic } from '../korean'
import { MSG } from './romText'

export interface BattleNames {
  /** 종족 번호로 색인 */
  species: string[]
  /** 기술 번호로 색인 */
  moves: string[]
  /** 특성 번호로 색인 */
  abilities: string[]
  /** 도구 번호로 색인. 트레이너가 도구를 쓸 때만 본다 */
  items: string[]
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
  /** 자리 → 화면에 쓸 이름. "모부기" / "야생의 찌르꼬" / "상대 찌르꼬" */
  label: (actor: Actor) => string
  /** 상대 트레이너 이름("체육관 관장 동관"). 야생이면 null */
  foeName?: string | null
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

/** 상태이상의 이름씨. "마비가 나았다"처럼 명사로 쓰이는 자리 */
const STATUS_NOUN: Record<Exclude<Status, 'ok'>, string> = {
  slp: '잠', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
}

/** 상태이상에 걸린 순간 */
const STATUS_ONSET: Record<Exclude<Status, 'ok'>, string> = {
  slp: '잠들어 버렸다!',
  psn: '독을 입었다!',
  tox: '맹독을 입었다!',
  brn: '화상을 입었다!',
  frz: '얼어붙었다!',
  par: '마비되어 기술이 나오기 어려워졌다!',
}

/** 상태이상 때문에 못 움직인 이유 */
const CANT_REASON: Record<string, string> = {
  slp: '쿨쿨 자고 있다.',
  frz: '얼어붙어서 움직일 수 없다!',
  par: '몸이 저려서 움직일 수 없다!',
  flinch: '풀이 죽어서 기술이 안 나왔다!',
  recharge: '움직일 수 없다!',
  'move: Taunt': '도발당해서 그 기술을 쓸 수 없다!',
}

/**
 * 명령을 안 듣고 **아무것도 안 했을 때**의 네 마디
 * (`subscript_disobey_do_nothing`). 차례가 원작의 뽑은 값 0~3과 같아야 한다
 */
const IDLE_FLAVOR: readonly string[] = [
  '빈둥거리고 있다!',
  '말을 안 듣는다!',
  '외면했다!',
  '못 들은 척했다!',
]

const STAT_NOUN: Record<BoostStat, string> = {
  atk: '공격', def: '방어', spa: '특수공격', spd: '특수방어',
  spe: '스피드', accuracy: '명중률', evasion: '회피율',
}

/** 날씨 이름 → 시작·유지 문구 */
const WEATHER: Record<string, { start: string; upkeep: string }> = {
  Sandstorm: { start: '모래바람이 불기 시작했다!', upkeep: '모래바람이 휘몰아친다!' },
  Hail: { start: '싸라기눈이 내리기 시작했다!', upkeep: '싸라기눈이 휘몰아친다!' },
  RainDance: { start: '비가 내리기 시작했다!', upkeep: '비가 계속 내리고 있다.' },
  SunnyDay: { start: '햇살이 강해졌다!', upkeep: '햇살이 강하다.' },
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

/** 랭크 변화 폭 → 부사. 원작은 1단계와 2단계 이상을 다르게 말한다 */
function boostAdverb(amount: number): string {
  const n = Math.abs(amount)
  if (amount > 0) return n >= 3 ? '엄청나게 올라갔다!' : n === 2 ? '쭉쭉 올라갔다!' : '올라갔다!'
  return n >= 3 ? '엄청나게 떨어졌다!' : n === 2 ? '뚝 떨어졌다!' : '떨어졌다!'
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
  const raw = ctx.lines[at]
  if (raw === undefined || raw === '') return null
  const filled: string[] = []
  for (const value of values) {
    if (value === null || value === '') return null
    filled.push(value)
  }
  const slots = new MessageSlots(Math.max(filled.length, MESSAGE_SLOTS))
  filled.forEach((value, i) => { slots.set(i, value) })
  return onePage(formatMessage(raw, slots))
}

/**
 * 한 쪽으로 편다.
 *
 * 롬은 창을 비우고 새로 찍는 자리를 `\r`로, 한 줄 올리고 잇는 자리를 `\f`로
 * 적어 둔다. 우리 로그는 **박자 하나가 곧 한 쪽**이라(글은 한 자씩 안 찍는다)
 * 둘 다 줄바꿈으로 눕히고 끝의 빈 줄을 턴다
 */
function onePage(text: string): string {
  return text.replace(/[\r\f]/g, '\n').replace(/\n+$/, '')
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
      if (e.forced) return `${withSubject(who)} 끌려나왔다!`
      // 야생은 "나타났다", 우리 쪽은 "가라!"
      return e.actor.side === 'p1' ? `가라! ${who}!` : `앗! ${withSubject(who)} 나타났다!`
    }

    case 'move': {
      const move = (e.move !== null ? names.moves[e.move] : null) ?? e.moveName
      return `${ctx.label(e.actor)}의 ${move}!`
    }

    case 'effectiveness':
      if (e.level === 'super') return '효과가 굉장했다!'
      if (e.level === 'resisted') return '효과가 별로인 것 같다…'
      return `${ctx.label(e.actor)}에게는 효과가 없는 것 같다…`

    case 'crit':
      return '급소에 맞았다!'

    case 'miss':
      return e.actor ? `${withTopic(ctx.label(e.actor))} 맞지 않았다!` : '하지만 빗나갔다!'

    case 'fail':
      return '하지만 실패했다!'

    case 'faint':
      return `${withTopic(ctx.label(e.actor))} 쓰러졌다!`

    case 'status':
      if (e.status === 'ok') return null
      return `${withTopic(ctx.label(e.actor))} ${STATUS_ONSET[e.status]}`

    case 'curestatus':
      if (e.status === 'ok') return null
      return `${ctx.label(e.actor)}의 ${withSubject(STATUS_NOUN[e.status])} 나았다!`

    case 'boost':
      if (e.amount === 0) return null
      return `${ctx.label(e.actor)}의 ${withSubject(STAT_NOUN[e.stat])} ${boostAdverb(e.amount)}`

    case 'cant': {
      const why = CANT_REASON[e.reason]
      const who = withTopic(ctx.label(e.actor))
      return why ? `${who} ${why}` : `${who} 기술을 쓸 수 없다!`
    }

    case 'ability': {
      const ability = (e.ability !== null ? names.abilities[e.ability] : null) ?? e.abilityName
      return `${ctx.label(e.actor)}의 ${ability}!`
    }

    case 'weather': {
      if (!e.weather) return e.upkeep ? null : '날씨가 원래대로 돌아왔다!'
      const w = WEATHER[e.weather]
      if (!w) return null
      return e.upkeep ? w.upkeep : w.start
    }

    case 'damage': {
      // 기술에 맞은 데미지는 따로 말하지 않는다 — 바로 앞에 기술 줄이 이미 있다
      if (!e.from) return null
      const { kind, id, name } = e.from
      const who = withTopic(ctx.label(e.actor))
      if (kind === 'status') {
        if (name === 'psn' || name === 'tox') return `${who} 독으로 데미지를 입었다!`
        if (name === 'brn') return `${who} 화상으로 데미지를 입었다!`
        return `${who} 데미지를 입었다!`
      }
      if (name === 'Sandstorm') return `${who} 모래바람에 시달리고 있다!`
      if (name === 'Hail') return `${who} 싸라기눈에 시달리고 있다!`
      if (kind === 'move') {
        const move = (id !== null ? names.moves[id] : null) ?? name
        return `${who} ${withObject(move)} 맞았다!`
      }
      return `${who} 데미지를 입었다!`
    }

    case 'heal':
      return `${withTopic(ctx.label(e.actor))} 체력을 회복했다!`

    case 'ball': {
      const who = ctx.label(e.actor)
      if (e.caught) return `신난다! ${withObject(who)} 잡았다!`
      // 흔들린 횟수만큼 아깝다. 원작도 세 번에서 빠져나오면 따로 말한다
      if (e.shakes >= 3) return '앗! 아깝다! 조금만 더 하면 잡을 수 있었는데!'
      if (e.shakes === 2) return '아깝다! 조금만 더 하면 잡을 수 있었는데!'
      if (e.shakes === 1) return `앗! ${withSubject(who)} 볼에서 나와 버렸다!`
      return '앗! 볼에 넣지 못했다!'
    }

    case 'escape':
      // 배회 포켓몬이 달아난 자리 (PARITY §6.3). 우리가 도망친 것과 글이 다르다
      if (e.foe) {
        return e.actor ? `${withSubject(ctx.label(e.actor))} 도망쳤다!` : '상대가 도망쳤다!'
      }
      return e.success ? '무사히 도망쳤다!' : '도망칠 수 없다!'

    case 'reward': {
      // 숫자 뒤에는 조사를 붙이지 않는다 — 읽는 소리로 갈리기 때문에(5는 "오가",
      // 6은 "육이") 받침 규칙으로는 못 고른다. 문장을 그렇게 안 쓰면 그만이다
      const who = ctx.label({ slot: 'p1a', side: 'p1', name: e.key })
      const lines = [`${withTopic(who)} 경험치를 ${e.exp} 얻었다!`]
      const top = e.levels[e.levels.length - 1]
      if (top !== undefined) lines.push(`${who}의 레벨이 올랐다! (Lv.${top})`)
      // 빈 칸에 그냥 들어간 것과, 무엇을 지울지 물어야 하는 것은 다른 문장이다
      for (const move of e.learned) {
        lines.push(`${withTopic(who)} 새로 ${withObject(names.moves[move] ?? `#${move}`)} 배웠다!`)
      }
      for (const move of e.pending) {
        lines.push(`${withTopic(who)} ${withObject(names.moves[move] ?? `#${move}`)} 배우고 싶어 한다!`)
      }
      return lines.join('\n')
    }

    case 'prize':
      return `상금으로 ${e.money}엔을 받았다!`

    case 'shift': {
      const who = ctx.bare?.(e.key) ?? ctx.label({ slot: 'p2a', side: 'p2', name: e.key })
      const trainer = ctx.foeName ?? '상대'
      return `${withTopic(trainer)} ${withObject(who)} 내보내려고 한다.`
    }

    case 'trainerItem': {
      const trainer = ctx.foeName ?? '상대'
      const item = names.items[e.item] ?? `#${e.item}`
      return `${withTopic(trainer)} ${withObject(item)} 썼다!`
    }

    case 'bagItem': {
      // `BattleStrings_Text_UsedTheItem` — "{플레이어}는 {도구}를 썼다!"
      const item = names.items[e.item] ?? `#${e.item}`
      return `${withTopic(ctx.playerName ?? '나')} ${withObject(item)} 썼다!`
    }

    case 'disobey': {
      const who = ctx.label(e.actor)
      if (e.reason === 'ignoredAsleep') return `${withTopic(who)} 자면서 명령을 무시했다!`
      if (e.reason === 'otherMove') return `${withTopic(who)} 명령을 무시했다!`
      if (e.reason === 'nap') return `${withTopic(who)} 꾸벅꾸벅 졸기 시작했다!`
      // 자기를 때리는 자리는 두 줄이다 — 원작도 "말을 안 듣는다"를 먼저 찍는다
      if (e.reason === 'hitSelf') {
        return `${withTopic(who)} 말을 안 듣는다!\n혼란에 빠져 자신을 공격했다!`
      }
      return `${withTopic(who)} ${IDLE_FLAVOR[e.flavor ?? 0] ?? IDLE_FLAVOR[0]!}`
    }

    case 'safari': {
      const who = ctx.label(e.actor)
      const me = ctx.playerName ?? '나'
      switch (e.beat) {
        // `BattleStrings_Text_PlayerThrewSomeBaitAtThePokemon`
        case 'bait': return `${withTopic(me)} ${who}에게 미끼를 던졌다!`
        case 'eating': return `${withTopic(who)} 먹고 있다!`
        case 'busyEating': return `${withTopic(who)} 먹느라 정신이 없다!`
        // `BattleStrings_Text_PlayerThrewMudAtThePokemon`
        case 'mud': return `${withTopic(me)} ${who}에게 진흙을 던졌다!`
        case 'angry': return `${withTopic(who)} 화가 났다!`
        case 'veryAngry': return `${withTopic(who)} 몹시 화가 났다!`
        // `subscript_safari_escape` — 이름이 「도망」이지만 **안 달아난** 턴의 줄이다
        default: return `${withTopic(who)} 주의깊게 보고 있다!`
      }
    }

    case 'tie':
      return '무승부다!'

    // ── 글만 내는 열둘 (PARITY §2.24) ────────────────────────────────────────
    case 'activate':
    case 'block':
      return effectText(ACTIVATE, e.effect, ctx, {
        who: e.actor ? ctx.label(e.actor) : null,
        of: e.of ? ctx.label(e.of) : null,
        extra: e.extra,
        extraMove: moveLabel(e.extra, names),
        label: effectLabel(e.effect, names),
      })

    case 'singleturn':
      return effectText(SINGLE_TURN, e.effect, ctx, {
        who: ctx.label(e.actor),
        of: e.of ? ctx.label(e.of) : null,
        extra: NO_EXTRA,
        extraMove: '',
        label: effectLabel(e.effect, names),
      })

    case 'singlemove':
      return effectText(SINGLE_MOVE, e.effect, ctx, {
        who: ctx.label(e.actor),
        of: null,
        extra: NO_EXTRA,
        extraMove: '',
        label: effectLabel(e.effect, names),
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
