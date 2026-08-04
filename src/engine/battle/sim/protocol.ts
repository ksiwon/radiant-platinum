// 프로토콜 줄 → 도메인 이벤트 (PLAN §7.2 ②)
//
// 여기가 이름 체계의 끝이다. 나가는 이벤트는 전부 롬 번호를 달고 있어서, 위쪽
// 계층은 `Turtwig`라는 문자열을 다시 볼 일이 없다.
//
// ⚠️ 지연 로딩 경계 (bridge.ts 주석 참고).
import { Protocol } from '@pkmn/protocol'
import type {
  Actor, BattleEvent, BattleRequest, BoostStat, Cause, Effectiveness,
} from '../events'
import { conditionId, parseActor, parseCondition, parseDetails, parseSide } from '../events'
import type { Status } from '../../pokemon/instance'
import { romAbility, romMove, romSpecies } from './bridge'

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
      return {
        kind: 'switch',
        actor,
        species: romSpecies(d.speciesName),
        speciesName: d.speciesName,
        level: d.level,
        gender: d.gender,
        shiny: d.shiny,
        condition: parseCondition(rest[2] ?? ''),
        forced: cmd === 'drag',
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
      // -setboost는 절대값이라 여기서 합치면 거짓이 된다. other로 넘긴다
      if (cmd === '-setboost') break
      return { kind: 'boost', actor, stat, amount: cmd === '-boost' ? n : -n }
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
      const condition = conditionId(rest[1] ?? '')
      if (!side || !condition) break
      return { kind: 'sidecondition', side, condition, start: cmd === '-sidestart' }
    }

    // `|-fieldstart|move: Trick Room|[of] p2a: 난천`
    case '-fieldstart':
    case '-fieldend': {
      const condition = conditionId(rest[0] ?? '')
      if (!condition) break
      return { kind: 'fieldcondition', condition, start: cmd === '-fieldstart' }
    }

    // `|-start|p1a: 빛나|Substitute`, `|-end|p2a: 난천|move: Leech Seed`
    case '-start':
    case '-end': {
      const actor = need(0)
      const volatile = conditionId(rest[1] ?? '')
      if (!actor || !volatile) break
      return { kind: 'volatile', actor, volatile, start: cmd === '-start' }
    }
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
