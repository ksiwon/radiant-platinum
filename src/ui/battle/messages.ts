// 배틀 텍스트 — 도메인 이벤트 하나를 한국어 한 줄로.
//
// 원작의 말투를 따른다. 우리 쪽은 이름만 부르고("모부기의 몸통박치기!"), 야생은
// "야생의"를, 트레이너의 것은 "상대"를 앞에 붙인다. 조사는 `korean.ts`가 받침으로
// 고른다 — "찌르꼬이(가)"처럼 병기형이 화면에 나오면 안 된다.
//
// 아직 문장이 없는 이벤트는 null이다. 텍스트 박스가 그냥 건너뛴다.
import type {
  Actor, BattleEvent, BoostStat, EffectExtra, EffectRef,
} from '../../engine/battle/events'
import type { Status } from '../../engine/pokemon/instance'
import { withObject, withSubject, withTopic } from '../korean'

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
 * 확정했고(`protocolLines.test.ts`가 그 아홉을 다시 센다), 그래서 여기 표가
 * 그 줄의 전부다. 원작도 기술마다 다른 한 줄을 찍는다
 */
const PREPARE: Record<string, string> = {
  fly: '하늘 높이 날아올랐다!',
  dig: '땅속으로 파고들었다!',
  dive: '물속으로 숨었다!',
  bounce: '높이 뛰어올랐다!',
  razorwind: '회오리를 일으켰다!',
  skullbash: '머리를 움츠렸다!',
  skyattack: '강렬한 빛에 휩싸였다!',
  solarbeam: '빛을 흡수했다!',
  shadowforce: '순식간에 모습을 감췄다!',
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

/**
 * 효과 id → 문장 (PARITY §2.24 · `-activate`·`-block`).
 *
 * ⚠️ **접두사로도 갈래로도 안 가른다.** 같은 효과가 `move: Protect`로도
 * `Protect`로도 오고, 그중 여섯(방어·뿌리박기·흰안개·신비의부적·점착·흡반)은
 * `@pkmn/protocol`이 `-block`으로 다시 써서 보낸다. 그래서 열쇠는
 * `EffectRef.id` 하나고 표도 하나다 (`sim/protocol`의 `effectRef`).
 *
 * ⚠️ **여기 없는 효과는 조용하다.** 지어낸 문장을 놓느니 아무 말도 안 하는 편이
 * 낫다 — 아직 글이 없는 효과가 무엇인지는 PARITY §2.24에 낱낱이 적혀 있다.
 * 다만 **특성은 예외**로 아래 `effectText`가 원작의 특성 배너로 떨어진다
 */
const ACTIVATE: Record<string, (s: EffectSay) => string | null> = {
  // 방어·판별이 공격을 막았다. **쓰는 줄과 막는 줄이 서로 다른 문장이다** —
  // 쓰는 쪽은 `-singleturn`이고 원작도 「방어 태세를 취했다!」로 따로 찍는다
  protect: (s) => `${withTopic(s.who ?? '')} 공격을 막았다!`,
  // 대타출동이 대신 맞았다. 원작도 맞은 쪽 이름을 부른다
  substitute: (s) => `대타가 ${s.who ?? ''} 대신 공격을 받았다!`,
  // 버티기가 걸려 1 남기고 버텼다
  endure: (s) => `${withTopic(s.who ?? '')} 공격을 버텨냈다!`,
  // 치유방울. 4세대에서는 이쪽이 `-activate`고 아로마테라피만 `-cureteam`이다
  healbell: () => '종소리가 울려퍼졌다!',
  aromatherapy: () => '기분 좋은 향기가 감돌았다!',
  // 흰안개·신비의부적이 막는 자리
  mist: (s) => `${withTopic(s.who ?? '')} 흰안개에 보호받고 있다!`,
  safeguard: (s) => `${withTopic(s.who ?? '')} 신비의부적에 보호받고 있다!`,
  // 트릭·바꿔치기는 한 줄로 서로의 도구가 오간다
  trick: (s) => `${withTopic(s.who ?? '')} 서로의 도구를 바꿨다!`,
  switcheroo: (s) => `${withTopic(s.who ?? '')} 서로의 도구를 바꿨다!`,
  // 매그니튜드는 굴린 수가 `[number]`로 온다
  magnitude: (s) => (s.extra.num === null ? null : `매그니튜드 ${s.extra.num}!`),
  // 참기가 힘을 모으는 두 턴
  bide: (s) => `${withTopic(s.who ?? '')} 힘을 모으고 있다!`,
  // 헤롱헤롱은 상대가 `[of]`로 온다
  attract: (s) => `${withTopic(s.who ?? '')} ${s.of ?? '상대'}에게 헤롱헤롱해졌다!`,
  // 길동무가 실제로 걸린 순간
  destinybond: (s) => `${withTopic(s.who ?? '')} 상대를 길동무로 삼았다!`,
  snatch: (s) => `${withTopic(s.who ?? '')} 상대의 기술을 가로챘다!`,
  // 혼란은 걸린 줄(`-start`)과 매 턴 도는 줄이 따로다. 이쪽이 도는 쪽이고,
  // 바로 뒤에 자기를 때린 데미지가 `[from] confusion`으로 온다
  confusion: (s) => `${withTopic(s.who ?? '')} 혼란에 빠져 있다!`,
  // 뿌리박기·흡반은 날려버리기를 버틴다
  ingrain: (s) => `${withTopic(s.who ?? '')} 뿌리를 내려 버티고 있다!`,
  suctioncups: (s) => `${withTopic(s.who ?? '')} 흡반으로 버티고 있다!`,
  // 점착으로 도구를 못 뺏는다
  stickyhold: (s) => `${s.who ?? ''}의 도구는 뺏을 수 없다!`,
  // 록온·마음의눈이 조준한다. 겨눈 쪽이 `[of]`로 온다
  lockon: (s) => `${withTopic(s.who ?? '')} ${withObject(s.of ?? '상대')} 조준했다!`,
  mindreader: (s) => `${withTopic(s.who ?? '')} ${withObject(s.of ?? '상대')} 조준했다!`,
  // 선제공격손톱이 돌았다
  quickclaw: (s) => `${withTopic(s.who ?? '')} 선제공격손톱으로 행동이 빨라졌다!`,
  // 스케치가 베낀 기술은 `[move]`로 온다.
  //
  // ⚠️ **한국어 이름이 안 풀리면 조용하다.** 다른 자리는 못 찾은 이름을 영어로
  // 떨어뜨리지만(`모부기의 Tackle!`) 여기는 뒤에 조사가 붙는 자리라, 떨어뜨리면
  // 화면에 「Tackle을(를) 스케치했다!」가 뜬다 — 이 파일이 첫 줄에서 금지한
  // 병기형이 바로 그것이다
  sketch: (s) => (s.extra.move === null
    ? null
    : `${withTopic(s.who ?? '')} ${withObject(s.extraMove)} 스케치했다!`),
  // 튀어오르기. sim은 `-nothing`을 내고 `@pkmn/protocol`이 이 줄로 다시 쓴다 —
  // 그래서 **자리가 비어 있다**(`|-activate||move: Splash`)
  splash: () => '하지만 아무 일도 일어나지 않았다!',
}

/**
 * 무대 전체에 걸린 효과 (`-fieldactivate`). 4세대에서는 둘뿐이다 —
 * 멸망의노래와 페이데이
 */
const FIELD_ACTIVATE: Record<string, string> = {
  perishsong: '모든 포켓몬이 멸망의노래를 들었다!',
  payday: '주위에 동전이 흩어졌다!',
}

/**
 * 이번 턴에만 걸리는 것 (`-singleturn`). 4세대에서 이 줄을 내는 기술은 여덟이다.
 *
 * ⚠️ **회복지령(`roost`)은 여기 없다.** 그 줄은 쇼다운이 타입이 바뀐 것을 스스로
 * 적어 두는 자리고 원작은 아무 말도 안 한다
 */
const SINGLE_TURN: Record<string, (s: EffectSay) => string | null> = {
  protect: (s) => `${withTopic(s.who ?? '')} 방어 태세를 취했다!`,
  focuspunch: (s) => `${withTopic(s.who ?? '')} 기합을 모으고 있다!`,
  endure: (s) => `${withTopic(s.who ?? '')} 버틸 태세를 취했다!`,
  magiccoat: (s) => `${withTopic(s.who ?? '')} 매직코트에 둘러싸였다!`,
  snatch: (s) => `${withTopic(s.who ?? '')} 상대가 기술을 쓰기를 기다리고 있다!`,
  followme: (s) => `${withTopic(s.who ?? '')} 주목을 모으고 있다!`,
  // ⚠️ **자리가 뒤집혀 있다.** 이 줄의 자리는 **도움을 받는 쪽**이고 도운 쪽이
  // `[of]`로 온다 (`add('-singleturn', target, 'Helping Hand', '[of] ' + source)`)
  helpinghand: (s) => `${withTopic(s.of ?? '')} ${withObject(s.who ?? '')} 도울 준비를 했다!`,
}

/** 다음 기술 한 번에만 걸리는 것 (`-singlemove`). 분노는 원작이 아무 말도 안 한다 */
const SINGLE_MOVE: Record<string, (s: EffectSay) => string | null> = {
  destinybond: (s) => `${withTopic(s.who ?? '')} 상대를 길동무로 만들려 하고 있다!`,
  grudge: (s) => `${withTopic(s.who ?? '')} 상대가 원한을 품기를 바라고 있다!`,
}

/** 랭크 변화 폭 → 부사. 원작은 1단계와 2단계 이상을 다르게 말한다 */
function boostAdverb(amount: number): string {
  const n = Math.abs(amount)
  if (amount > 0) return n >= 3 ? '엄청나게 올라갔다!' : n === 2 ? '쭉쭉 올라갔다!' : '올라갔다!'
  return n >= 3 ? '엄청나게 떨어졌다!' : n === 2 ? '뚝 떨어졌다!' : '떨어졌다!'
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
      return effectText(ACTIVATE, e.effect, {
        who: e.actor ? ctx.label(e.actor) : null,
        of: e.of ? ctx.label(e.of) : null,
        extra: e.extra,
        extraMove: moveLabel(e.extra, names),
        label: effectLabel(e.effect, names),
      })

    case 'singleturn':
      return effectText(SINGLE_TURN, e.effect, {
        who: ctx.label(e.actor),
        of: e.of ? ctx.label(e.of) : null,
        extra: NO_EXTRA,
        extraMove: '',
        label: effectLabel(e.effect, names),
      })

    case 'singlemove':
      return effectText(SINGLE_MOVE, e.effect, {
        who: ctx.label(e.actor),
        of: null,
        extra: NO_EXTRA,
        extraMove: '',
        label: effectLabel(e.effect, names),
      })

    case 'prepare': {
      // 기술 번호가 아니라 **이름을 접어** 찾는다 — 번호는 롬 표가 있어야 풀리는데
      // 이 줄은 표가 아직 안 왔을 때도 와서, 번호로 찾으면 조용히 비는 자리가 생긴다
      const line = PREPARE[foldName(e.moveName)]
      return line ? `${withTopic(ctx.label(e.actor))} ${line}` : null
    }

    case 'hitcount':
      // `BattleStrings_Text_HitNTimes` — 원작도 수만 갈아 끼운다
      return `${e.count}번 맞았다!`

    case 'notarget':
      return '하지만 상대가 없다!'

    case 'ohko':
      return '일격필살!'

    case 'fieldactivate':
      return FIELD_ACTIVATE[e.effect.id] ?? null

    case 'cureteam':
      // 4세대에서 이 줄을 내는 것은 아로마테라피 하나다
      return '기분 좋은 향기가 감돌았다!'

    case 'endability':
      // 4세대에서는 위장약 하나가 이 줄을 낸다
      return `${ctx.label(e.actor)}의 특성이 사라졌다!`

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
  table: Record<string, (s: EffectSay) => string | null>,
  effect: EffectRef,
  say: EffectSay,
): string | null {
  const line = table[effect.id]
  if (line) return line(say)
  if (effect.kind === 'ability' && say.who !== null) return `${say.who}의 ${say.label}!`
  return null
}
