// 배틀 텍스트 — 도메인 이벤트 하나를 한국어 한 줄로.
//
// 원작의 말투를 따른다. 우리 쪽은 이름만 부르고("모부기의 몸통박치기!"), 야생은
// "야생의"를, 트레이너의 것은 "상대"를 앞에 붙인다. 조사는 `korean.ts`가 받침으로
// 고른다 — "찌르꼬이(가)"처럼 병기형이 화면에 나오면 안 된다.
//
// 아직 문장이 없는 이벤트는 null이다. 텍스트 박스가 그냥 건너뛴다.
import type { Actor, BattleEvent, BoostStat } from '../../engine/battle/events'
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

    default:
      return null
  }
}
