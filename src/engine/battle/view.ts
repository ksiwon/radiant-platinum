// 배틀 화면 상태 (PLAN §7.2) — 이벤트를 접어서 만든다.
//
// **프로토콜만 보고 만든다.** 우리가 sim에 넣은 값을 그대로 베껴 쓰지 않는다 —
// 그러면 sim이 실제로 무슨 일을 했는지와 화면이 어긋나도 아무도 모른다.
// `view.test.ts`가 실전 배틀에서 이 뷰의 HP와 sim의 `|request|`를 매 턴 대조한다.
//
// sim을 import 하지 않으므로 UI가 마음대로 가져다 써도 지연 로딩 경계가 안 깨진다.
import type { Gender, Status } from '../pokemon/instance'
import type { BattleEvent, BoostStat, Condition, SideId } from './events'

export const BOOST_STATS: readonly BoostStat[] = [
  'atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion',
]

export type Boosts = Record<BoostStat, number>

export function noBoosts(): Boosts {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }
}

/** 지금 나와 있는 한 마리. 화면이 그리는 데 필요한 전부 */
export interface ViewMon {
  slot: string
  side: SideId
  /**
   * 세션에 넣은 고유 키(`SideMon.key`). **표시 이름이 아니다** — 화면에 쓸 이름은
   * `species`로 찾는다. 같은 종을 둘 데리고 있어도 여기서는 구분된다
   */
  key: string
  /** 롬 종족 번호. 모델·한국어 이름·도감이 전부 이걸로 돈다 */
  species: number | null
  speciesName: string
  level: number
  gender: Gender
  shiny: boolean
  hp: number
  maxHp: number
  status: Status
  boosts: Boosts
  fainted: boolean
}

export interface BattleView {
  turn: number
  active: Record<SideId, ViewMon | null>
  weather: string | null
  ended: boolean
  /** 이긴 쪽 이름. 무승부면 null인 채로 `ended`만 선다 */
  winner: string | null
}

export function emptyView(): BattleView {
  return { turn: 0, active: { p1: null, p2: null }, weather: null, ended: false, winner: null }
}

/** 한 마리만 바꾼 새 뷰. zustand가 변화를 감지해야 하므로 전부 새 객체로 만든다 */
function patch(
  view: BattleView,
  side: SideId,
  change: (mon: ViewMon) => ViewMon,
): BattleView {
  const cur = view.active[side]
  if (!cur) return view
  return { ...view, active: { ...view.active, [side]: change(cur) } }
}

/**
 * 프로토콜의 HP 표기를 반영한다.
 *
 * 쓰러진 줄은 `0 fnt`라 최대치를 안 알려준다. 그때 최대치를 0으로 덮으면 HP 바가
 * 0/0이 되어 비율이 NaN이 되므로 **이전 값을 유지한다**
 */
function withCondition(mon: ViewMon, c: Condition): ViewMon {
  return {
    ...mon,
    hp: c.hp,
    maxHp: c.maxHp ?? mon.maxHp,
    status: c.status,
    fainted: c.hp <= 0,
  }
}

/** 이벤트 하나를 접는다. 뷰는 불변이라 바뀐 게 없으면 같은 객체가 돌아온다 */
export function applyEvent(view: BattleView, e: BattleEvent): BattleView {
  switch (e.kind) {
    case 'turn':
      return { ...view, turn: e.turn }

    case 'switch': {
      const mon: ViewMon = {
        slot: e.actor.slot,
        side: e.actor.side,
        key: e.actor.name,
        species: e.species,
        speciesName: e.speciesName,
        level: e.level,
        gender: e.gender,
        shiny: e.shiny,
        hp: e.condition.hp,
        // 등판 줄은 늘 최대치를 준다. 그래도 없으면 나눗셈을 막기 위해 1로 둔다
        maxHp: e.condition.maxHp ?? 1,
        status: e.condition.status,
        boosts: noBoosts(), // 랭크는 교체로 사라진다
        fainted: e.condition.hp <= 0,
      }
      return { ...view, active: { ...view.active, [e.actor.side]: mon } }
    }

    case 'damage':
    case 'heal':
      return patch(view, e.actor.side, (m) => withCondition(m, e.condition))

    case 'faint':
      return patch(view, e.actor.side, (m) => ({ ...m, hp: 0, fainted: true }))

    case 'status':
      return patch(view, e.actor.side, (m) => ({ ...m, status: e.status }))

    case 'curestatus':
      // 대타·교체로 이미 다른 애가 나와 있을 수 있다. 지금 걸린 것과 같을 때만 푼다
      return patch(view, e.actor.side, (m) => (m.status === e.status ? { ...m, status: 'ok' } : m))

    case 'boost':
      return patch(view, e.actor.side, (m) => ({
        ...m,
        // 4세대 랭크는 ±6에서 멈춘다
        boosts: { ...m.boosts, [e.stat]: clampBoost(m.boosts[e.stat] + e.amount) },
      }))

    case 'weather':
      return { ...view, weather: e.weather }

    case 'win':
      return { ...view, ended: true, winner: e.winner }

    case 'tie':
      return { ...view, ended: true, winner: null }

    default:
      return view
  }
}

function clampBoost(n: number): number {
  return n < -6 ? -6 : n > 6 ? 6 : n
}

/** 이벤트 줄기를 통째로 접는다 */
export function applyEvents(view: BattleView, events: readonly BattleEvent[]): BattleView {
  let next = view
  for (const e of events) next = applyEvent(next, e)
  return next
}
