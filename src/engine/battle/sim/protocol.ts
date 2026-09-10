// 프로토콜 줄 → 도메인 이벤트 (PLAN §7.2 ②)
//
// 여기가 이름 체계의 끝이다. 나가는 이벤트는 전부 롬 번호를 달고 있어서, 위쪽
// 계층은 `Turtwig`라는 문자열을 다시 볼 일이 없다.
//
// ⚠️ 지연 로딩 경계 (bridge.ts 주석 참고).
import { Protocol } from '@pkmn/protocol'
import type {
  Actor, BattleEvent, BattleRequest, BoostStat, Cause, EffectExtra, EffectRef, Effectiveness,
} from '../events'
import { conditionId, parseActor, parseCondition, parseDetails, parseSide } from '../events'
import type { Status } from '../../pokemon/instance'
import { romAbility, romMove, romSpeciesForm } from './bridge'

const STATUS_CAUSES = new Set(['psn', 'tox', 'brn', 'frz', 'par', 'slp'])

/**
 * `[from] ability: Sand Stream` → 종류·번호·이름.
 *
 * 번호까지 여기서 푼다. 위층은 sim을 모르므로 `Leech Seed`를 한국어 이름으로
 * 바꿀 방법이 없다 — 문구도 연출도 번호로 골라야 한다
 */
function from(kw: Record<string, unknown>): Cause | null {
  const v = kw['from']
  if (typeof v !== 'string' || !v) return null
  const colon = v.indexOf(':')
  if (colon < 0) {
    const name = v.trim()
    return {
      kind: STATUS_CAUSES.has(name) ? 'status' : 'other',
      id: null,
      name,
    }
  }
  const kind = v.slice(0, colon).trim()
  const name = v.slice(colon + 1).trim()
  if (kind === 'move') return { kind: 'move', id: romMove(name), name }
  if (kind === 'ability') return { kind: 'ability', id: romAbility(name), name }
  if (kind === 'item') return { kind: 'item', id: null, name }
  return { kind: 'other', id: null, name }
}

/**
 * 효과 뒤에 붙어 온 값. 자리가 아니라 **이름 있는 칸**에서 읽는다.
 *
 * 매그니튜드는 `[number] 7`로, 스케치가 베낀 기술은 `[move] Tackle`로 온다 —
 * sim이 자리 인자로 보낸 것을 `@pkmn/protocol`이 여기로 옮겨 놓는다
 */
function extra(kw: Record<string, unknown>): EffectExtra {
  const n = Number(kw['number'])
  const raw = kw['move']
  const moveName = typeof raw === 'string' && raw ? raw : null
  return {
    num: Number.isFinite(n) ? n : null,
    // 번호까지 여기서 푼다 — 위층은 sim을 모르므로 `Tackle`을 한국어로 못 바꾼다
    move: moveName === null ? null : romMove(moveName),
    moveName,
  }
}

/**
 * `[of] p2a: 난천` → 그 자리. 효과를 **건 쪽**이라 발동한 쪽과 다르다.
 *
 * 흉내내기·가로챈다처럼 두 마리가 한 줄에 나오는 자리에서 필요하다
 */
function of(kw: Record<string, unknown>): Actor | null {
  const v = kw['of']
  return typeof v === 'string' ? parseActor(v) : null
}

/**
 * `move: Protect` · `Protect` · `ability: Sticky Hold` → 효과 하나 (PARITY §2.24).
 *
 * ⚠️ **접두사가 있을 때와 없을 때가 같은 효과다.** 방어는 쓸 때 접두사 없이
 * (`|-singleturn|…|Protect`) 막을 때 붙여서(`|-activate|…|move: Protect`) 온다.
 * `id`를 `conditionId`로 접어 그 둘을 한자리로 모은다 — 지속 효과 세 갈래가
 * 이미 같은 접기를 쓰고 있다
 */
function effectRef(raw: string): EffectRef {
  const colon = raw.indexOf(':')
  const prefix = colon < 0 ? '' : raw.slice(0, colon).trim()
  const name = (colon < 0 ? raw : raw.slice(colon + 1)).trim()
  const kind = prefix === 'move' || prefix === 'ability' || prefix === 'item' ? prefix : 'other'
  return {
    id: conditionId(raw),
    kind,
    num: kind === 'move' ? romMove(name) : kind === 'ability' ? romAbility(name) : null,
    name,
  }
}

/**
 * 지속 효과 세 갈래(`-start`·`-sidestart`·`-fieldstart`)의 효과 이름.
 *
 * ⚠️ **이 줄들은 `move:` 접두사를 자주 뺀다** — `|-sidestart|p1: 빛나|Reflect`는
 * 접두사가 없고 `|-sidestart|p2: 난천|move: Light Screen`은 있다. 같은 일인데
 * 한쪽만 번호가 풀리면 「우리 편은 {기술}로 물리 공격에 강해졌다!」의 빈칸이
 * 반만 채워진다. 그래서 접두사가 없어도 롬의 기술 표를 한 번 뒤진다.
 *
 * ⚠️ **`kind`는 안 건드린다.** 접두사가 없다는 사실 자체가 자료고, 접두사 없이
 * 오는 이름 중에는 기술이 아닌 것도 있다(`confusion`은 상태지만 롬 기술 표에는
 * 같은 이름의 기술이 있다). 그래서 `num`은 **롬 문장에 기술 빈칸이 있는 자리에서만**
 * 읽는다 (`ui/battle/messages`).
 */
function conditionRef(raw: string): EffectRef {
  const base = effectRef(raw)
  if (base.num !== null || base.kind !== 'other') return base
  return { ...base, num: romMove(base.name) }
}

const BOOST_STATS: BoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']
const EFFECTIVENESS: Record<string, Effectiveness> = {
  '-supereffective': 'super',
  '-resisted': 'resisted',
  '-immune': 'immune',
}

/**
 * 한 줄을 이벤트로. 배틀과 무관한 줄(`|t:|`, `|debug|`, 빈 줄)이면 null.
 *
 * 모르는 줄은 null이 아니라 `other`로 나간다 — 조용히 버리면 연출이 빠진 것을
 * 알아챌 방법이 없다.
 */
export function parseLine(line: string): BattleEvent | null {
  if (!line.startsWith('|')) return null
  const { args, kwArgs } = Protocol.parseBattleLine(line)
  const cmd = args[0] as string
  const rest = args.slice(1).map(String)
  const kw = kwArgs as unknown as Record<string, unknown>

  /** n번째 인자를 자리로. 자리 표기가 아니면 null */
  const who = (i: number): Actor | null => parseActor(rest[i] ?? '')
  /** 자리가 반드시 있어야 하는 줄. 없으면 `other`로 떨어뜨린다 */
  const need = (i: number): Actor | null => who(i)

  switch (cmd) {
    // 진행에 아무 정보도 없는 줄들. 타임스탬프·디버그·구분선, 그리고 `done`처럼
    // "이번 갱신 끝"을 알리는 스트림 표시 — 배틀에서 일어난 일이 아니다
    case 't:': case 'debug': case 'upkeep': case '': case 'gametype':
    case 'gen': case 'tier': case 'rule': case 'teamsize': case 'player':
    case 'poke': case 'teampreview': case 'clearpoke': case 'inactive':
    case 'inactiveoff': case 'seed': case 'error': case 'raw': case 'j':
    case 'l': case 'c': case 'chat': case 'html': case 'uhtml': case 'done':
      return null

    case 'start':
      return { kind: 'start' }
    case 'turn':
      return { kind: 'turn', turn: Number(rest[0]) }
    case 'win':
      return { kind: 'win', winner: rest[0] ?? '' }
    case 'tie':
      return { kind: 'tie' }

    case 'request': {
      const body = rest.join('|')
      return {
        kind: 'request',
        request: body ? (JSON.parse(body) as BattleRequest) : null,
      }
    }

    case 'switch':
    case 'drag': {
      const actor = need(0)
      if (!actor) break
      const d = parseDetails(rest[1] ?? '')
      const resolved = romSpeciesForm(d.speciesName)
      return {
        kind: 'switch',
        actor,
        species: resolved?.species ?? null,
        form: resolved?.form ?? 0,
        speciesName: d.speciesName,
        level: d.level,
        gender: d.gender,
        shiny: d.shiny,
        condition: parseCondition(rest[2] ?? ''),
        forced: cmd === 'drag',
      }
    }


    case '-formechange':
    case 'detailschange': {
      const actor = need(0)
      if (!actor) break
      const details = parseDetails(rest[1] ?? '')
      const resolved = romSpeciesForm(details.speciesName)
      return {
        kind: 'form', actor,
        species: resolved?.species ?? null,
        speciesName: details.speciesName,
        form: resolved?.form ?? 0,
      }
    }
    case 'move': {
      const actor = need(0)
      if (!actor) break
      const moveName = rest[1] ?? ''
      return {
        kind: 'move',
        actor,
        move: romMove(moveName),
        moveName,
        target: who(2),
        miss: 'miss' in kw,
        from: from(kw),
      }
    }

    case '-damage':
    case '-heal':
    case '-sethp': {
      const actor = need(0)
      if (!actor) break
      // -sethp는 절대값을 꽂는 줄이다(고통나누기). 늘거나 줄 수 있으므로 damage로
      // 부르면 연출이 거짓말을 한다 — 뷰는 어차피 절대값을 그대로 쓴다
      return {
        kind: cmd === '-heal' ? 'heal' : 'damage',
        actor,
        condition: parseCondition(rest[1] ?? ''),
        from: from(kw),
      }
    }

    case 'faint': {
      const actor = need(0)
      if (!actor) break
      return { kind: 'faint', actor }
    }

    case '-status':
    case '-curestatus': {
      const actor = need(0)
      if (!actor) break
      return {
        kind: cmd === '-status' ? 'status' : 'curestatus',
        actor,
        status: (rest[1] ?? 'ok') as Status,
      }
    }

    case '-boost':
    case '-unboost':
    case '-setboost': {
      const actor = need(0)
      const stat = rest[1] as BoostStat
      if (!actor || !BOOST_STATS.includes(stat)) break
      const n = Number(rest[2])
      if (!Number.isFinite(n)) break
      // ⚠️ **-setboost는 절대값이다.** 더하면 거짓이 되므로 갈래를 따로 낸다 —
      // 한동안 `other`로 흘려 버렸고, 배북을 쓴 뒤 화면과 AI가 랭크 0을 봤다
      if (cmd === '-setboost') return { kind: 'setboost', actor, stat, amount: n }
      return { kind: 'boost', actor, stat, amount: cmd === '-boost' ? n : -n }
    }

    // 흑안개. **양쪽 자리 전부**를 되돌린다
    case '-clearallboost':
      return { kind: 'clearboosts' }

    // 심리전. `|-copyboost|베끼는 쪽|베껴지는 쪽`
    case '-copyboost': {
      const actor = need(0)
      const from = who(1)
      if (!actor || !from) break
      return { kind: 'copyboosts', actor, from }
    }

    case '-supereffective':
    case '-resisted':
    case '-immune': {
      const actor = need(0)
      if (!actor) break
      return { kind: 'effectiveness', actor, level: EFFECTIVENESS[cmd]! }
    }

    case '-crit': {
      const actor = need(0)
      if (!actor) break
      return { kind: 'crit', actor }
    }

    // `|-miss|공격자|대상`. 대상이 없는 줄도 있다(대상이 이미 사라진 경우)
    case '-miss':
      return { kind: 'miss', actor: who(1) ?? who(0) }
    case '-fail':
      return { kind: 'fail', actor: who(0) }

    case 'cant': {
      const actor = need(0)
      if (!actor) break
      return { kind: 'cant', actor, reason: rest[1] ?? '' }
    }

    case '-ability': {
      const actor = need(0)
      if (!actor) break
      const abilityName = rest[1] ?? ''
      return { kind: 'ability', actor, ability: romAbility(abilityName), abilityName }
    }

    case '-weather': {
      const w = rest[0] ?? ''
      return {
        kind: 'weather',
        weather: w === 'none' || !w ? null : w,
        upkeep: 'upkeep' in kw,
      }
    }

    // `|-sidestart|p1: 빛나|Reflect`. 쪽 표기가 `p1a`가 아니라 `p1`이라 parseActor는 못 쓴다
    case '-sidestart':
    case '-sideend': {
      const side = parseSide(rest[0] ?? '')
      const effect = conditionRef(rest[1] ?? '')
      if (!side || !effect.id) break
      return { kind: 'sidecondition', side, effect, start: cmd === '-sidestart' }
    }

    // `|-fieldstart|move: Trick Room|[of] p2a: 난천`
    case '-fieldstart':
    case '-fieldend': {
      const effect = conditionRef(rest[0] ?? '')
      if (!effect.id) break
      return { kind: 'fieldcondition', effect, start: cmd === '-fieldstart', of: of(kw) }
    }

    // `|-start|p1a: 빛나|Substitute`, `|-end|p2a: 난천|move: Leech Seed`
    case '-start':
    case '-end': {
      const actor = need(0)
      const effect = conditionRef(rest[1] ?? '')
      if (!actor || !effect.id) break
      return {
        kind: 'volatile', actor, effect, start: cmd === '-start', of: of(kw), extra: extra(kw),
      }
    }

    // ── 글만 내는 열둘 (PARITY §2.24) ────────────────────────────────────────
    //
    // `|-activate|p1a: 모부기|Substitute|[damage]`, `|-block|p1a: 모부기|move: Protect`
    //
    // ⚠️ **자리 인자를 세지 않는다.** `@pkmn/protocol`이 이 줄을 다시 쓰면서
    // 넷째 자리를 `[of]`로 못 박기 때문에, 자리로 읽으면 매그니튜드의 수 자리에
    // 조용히 상대 이름이 들어온다 (`upgradeBattleArgs`). 붙어 오는 값은 전부
    // 이름 있는 칸으로 옮겨져 있다
    case '-activate':
    case '-block': {
      const effect = effectRef(rest[1] ?? '')
      if (!effect.id) break
      return {
        kind: cmd === '-activate' ? 'activate' : 'block',
        actor: who(0),
        effect,
        of: of(kw),
        extra: extra(kw),
      }
    }

    // `|-singleturn|p1a: 모부기|Protect`, `|-singlemove|p2a: 팬텀|Destiny Bond`
    case '-singleturn':
    case '-singlemove': {
      const actor = need(0)
      const effect = effectRef(rest[1] ?? '')
      if (!actor || !effect.id) break
      return cmd === '-singleturn'
        ? { kind: 'singleturn', actor, effect, of: of(kw) }
        : { kind: 'singlemove', actor, effect }
    }

    // `|-prepare|p1a: 모부기|Fly|p2a: 팬텀`. 대상 자리는 없을 수도 있다
    case '-prepare': {
      const actor = need(0)
      if (!actor) break
      const moveName = rest[1] ?? ''
      return { kind: 'prepare', actor, move: romMove(moveName), moveName, target: who(2) }
    }

    // `|-hitcount|p2a: 팬텀|3`
    case '-hitcount': {
      const count = Number(rest[1])
      if (!Number.isFinite(count)) break
      return { kind: 'hitcount', actor: who(0), count }
    }

    // `|-notarget|p2a: 팬텀` — 자리가 아예 없는 줄도 있다
    case '-notarget':
      return { kind: 'notarget', actor: who(0) }

    // `|-ohko|` — 자리 인자가 없다
    case '-ohko':
      return { kind: 'ohko' }

    case '-mustrecharge': {
      const actor = need(0)
      if (!actor) break
      return { kind: 'mustrecharge', actor }
    }

    // `|-endability|p1a: 모부기` — 특성 이름은 안 붙어 오는 것이 보통이다
    case '-endability': {
      const actor = need(0)
      if (!actor) break
      const abilityName = rest[1] ?? ''
      return {
        kind: 'endability',
        actor,
        ability: abilityName ? romAbility(abilityName) : null,
        abilityName,
      }
    }

    // `|-fieldactivate|move: Perish Song` — 자리가 없다. 무대 전체의 줄이다
    case '-fieldactivate': {
      const effect = effectRef(rest[0] ?? '')
      if (!effect.id) break
      return { kind: 'fieldactivate', effect }
    }

    // `|-cureteam|p1a: 모부기|[from] move: Aromatherapy`
    case '-cureteam': {
      const actor = need(0)
      if (!actor) break
      return { kind: 'cureteam', actor, from: from(kw) }
    }

    // 쇼다운이 사람에게 규칙을 설명하는 줄. 원작에 없어서 글은 안 놓는다
    case '-hint':
      return { kind: 'hint', text: rest.join('|') }
  }

  return { kind: 'other', cmd, args: rest }
}

/** 줄 묶음을 이벤트 줄기로. 의미 없는 줄은 빠진다 */
export function parseLines(lines: readonly string[]): BattleEvent[] {
  const out: BattleEvent[] = []
  for (const line of lines) {
    const e = parseLine(line)
    if (e) out.push(e)
  }
  return out
}
