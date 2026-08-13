// 배틀 화면 상태 (PLAN §7.2) — 이벤트를 접어서 만든다.
//
// **프로토콜만 보고 만든다.** 우리가 sim에 넣은 값을 그대로 베껴 쓰지 않는다 —
// 그러면 sim이 실제로 무슨 일을 했는지와 화면이 어긋나도 아무도 모른다.
// `view.test.ts`가 실전 배틀에서 이 뷰의 HP와 sim의 `|request|`를 매 턴 대조한다.
//
// sim을 import 하지 않으므로 UI가 마음대로 가져다 써도 지연 로딩 경계가 안 깨진다.
import type { Gender, Status } from '../pokemon/instance'
import type { BattleEvent, BoostStat, Condition, Effectiveness, SideId, SlotId } from './events'
import { SLOTS, slotId } from './events'

export const BOOST_STATS: readonly BoostStat[] = [
  'atk',
  'def',
  'spa',
  'spd',
  'spe',
  'accuracy',
  'evasion',
]

export type Boosts = Record<BoostStat, number>

export function noBoosts(): Boosts {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }
}

/** 지금 나와 있는 한 마리. 화면이 그리는 데 필요한 전부 */
export interface ViewMon {
  slot: SlotId
  side: SideId
  /**
   * 세션에 넣은 고유 키(`SideMon.key`). **표시 이름이 아니다** — 화면에 쓸 이름은
   * `species`로 찾는다. 같은 종을 둘 데리고 있어도 여기서는 구분된다
   */
  key: string
  /** 롬 종족 번호. 모델·한국어 이름·도감이 전부 이걸로 돈다 */
  species: number | null
  form?: number
  speciesName: string
  level: number
  gender: Gender
  shiny: boolean
  hp: number
  maxHp: number
  status: Status
  boosts: Boosts
  fainted: boolean
  /**
   * 이 개체에게 걸려 있는 것. `substitute`, `leechseed`, `confusion`.
   *
   * 교체하면 통째로 사라진다 — 개체가 아니라 **자리**에 붙은 값이라서다
   */
  volatiles: ReadonlySet<string>
}

export interface BattleView {
  turn: number
  /**
   * 무대에 서 있는 마리. **자리마다** 하나다 (PARITY §2.2).
   *
   * ⚠️ 싱글에서는 `p1b`·`p2b`가 늘 null이다. 그래도 칸을 없애지 않는다 —
   * 자리로 접는 것과 쪽으로 접는 것을 코드 두 벌로 나누면 더블에서만 나는
   * 버그가 싱글 시험에 안 걸린다. 읽는 쪽은 `activeAt`을 쓴다
   */
  active: Record<SlotId, ViewMon | null>
  /** 더블인가. 화면·연출이 자리 수를 이걸로 안다 */
  doubles: boolean
  weather: string | null
  /**
   * 진영별 지속 효과와 **겹친 횟수**. `reflect`, `lightscreen`, `spikes`, `safeguard`.
   *
   * 집합이 아니라 개수인 이유는 압정뿌리기다 — 세 번까지 겹치고 층수마다 데미지가
   * 다르다. 프로토콜은 층이 늘 때마다 `-sidestart`를 한 번씩 더 보낸다
   */
  sideConditions: Record<SideId, ReadonlyMap<string, number>>
  /** 필드 전체. `trickroom`, `gravity` */
  field: ReadonlySet<string>
  ended: boolean
  /** 이긴 쪽 이름. 무승부면 null인 채로 `ended`만 선다 */
  winner: string | null
  /**
   * 지금 화면에서 도는 기술. 무대의 연출이 이걸 보고 한 번 돈다.
   *
   * `seq`가 있는 이유는 **같은 기술이 이어서 나오기 때문**이다 — 몸통박치기를
   * 두 턴 연속 쓰면 나머지 값이 전부 같아서, 번호가 없으면 두 번째가 안 돈다
   */
  lastMove: { by: SlotId; to: SlotId | null; move: number | null; seq: number } | null
  /**
   * 방금 맞은 타격. 소리가 이걸 보고 난다 (`ui/battle/BattleSound`).
   *
   * `seq`가 필요한 이유는 `lastMove`와 같다 — 연타 기술은 같은 값이 이어서 오고,
   * 번호가 없으면 두 번째 타격이 조용하다
   */
  lastHit: {
    slot: SlotId
    level: Effectiveness | 'normal'
    crit: boolean
    amount: number
    seq: number
  } | null
  /** Most recent capture attempt, retained long enough for the 3D stage to play it once. */
  lastBall: {
    slot: SlotId
    ball: number
    shakes: number
    caught: boolean
    seq: number
  } | null
}

const EMPTY: ReadonlySet<string> = new Set()
const EMPTY_MAP: ReadonlyMap<string, number> = new Map()

export function emptyView(doubles = false): BattleView {
  return {
    lastMove: null,
    lastHit: null,
    turn: 0,
    doubles,
    active: { p1a: null, p1b: null, p2a: null, p2b: null },
    weather: null,
    lastBall: null,
    sideConditions: { p1: EMPTY_MAP, p2: EMPTY_MAP },
    field: EMPTY,
    ended: false,
    winner: null,
  }
}

/** 그 쪽 `at`번째 자리에 서 있는 마리. 싱글에서 `at`이 1이면 늘 null */
export function activeAt(view: BattleView, side: SideId, at = 0): ViewMon | null {
  return view.active[slotId(side, at)]
}

/** 그 쪽에 서 있는 마리 전부. 싱글이면 하나, 더블이면 최대 둘 */
export function activeOn(view: BattleView, side: SideId): ViewMon[] {
  return SLOTS.filter((s) => s.startsWith(side))
    .map((s) => view.active[s])
    .filter((m): m is ViewMon => m !== null)
}

/** 그 키를 들고 있는 자리. 없으면 null */
export function slotOfKey(view: BattleView, key: string): SlotId | null {
  return SLOTS.find((s) => view.active[s]?.key === key) ?? null
}

/** 집합 하나를 켜거나 끈 새 집합. 안 바뀌면 같은 객체를 돌려준다 */
function toggle(set: ReadonlySet<string>, name: string, on: boolean): ReadonlySet<string> {
  if (set.has(name) === on) return set
  const next = new Set(set)
  if (on) next.add(name)
  else next.delete(name)
  return next
}

/** 층을 하나 쌓거나 통째로 걷어낸다. `-sideend`는 층이 몇이든 한 번에 사라진다 */
function stack(
  map: ReadonlyMap<string, number>,
  name: string,
  on: boolean,
): ReadonlyMap<string, number> {
  if (!on && !map.has(name)) return map
  const next = new Map(map)
  if (on) next.set(name, (next.get(name) ?? 0) + 1)
  else next.delete(name)
  return next
}

/** 한 마리만 바꾼 새 뷰. zustand가 변화를 감지해야 하므로 전부 새 객체로 만든다 */
function patch(view: BattleView, slot: SlotId, change: (mon: ViewMon) => ViewMon): BattleView {
  const cur = view.active[slot]
  if (!cur) return view
  return { ...view, active: { ...view.active, [slot]: change(cur) } }
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

    case 'move':
      // 화면에는 아무 변화가 없지만 **연출은 여기서 시작한다.** 박자가 이
      // 사건에 `MOVE_FRAMES`만큼 쉬는 자리를 내 준다 (`playback`)
      return {
        ...view,
        lastMove: {
          by: e.actor.slot,
          to: e.target?.slot ?? null,
          move: e.move,
          seq: (view.lastMove?.seq ?? 0) + 1,
        },
      }

    case 'switch': {
      const mon: ViewMon = {
        slot: e.actor.slot,
        side: e.actor.side,
        key: e.actor.name,
        species: e.species,
        form: e.form ?? 0,
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
        volatiles: EMPTY, // 대타출동·씨뿌리기도 마찬가지다
      }
      return { ...view, active: { ...view.active, [e.actor.slot]: mon } }
    }

    case 'form':
      return patch(view, e.actor.slot, (mon) => ({
        ...mon,
        species: e.species,
        speciesName: e.speciesName,
        form: e.form,
      }))

    case 'damage': {
      const hurt = patch(view, e.actor.slot, (m) => withCondition(m, e.condition))
      const previousHp = view.active[e.actor.slot]?.hp ?? e.condition.hp
      const amount = Math.max(0, previousHp - e.condition.hp)
      if (e.hit === undefined) return hurt
      return {
        ...hurt,
        lastHit: { slot: e.actor.slot, ...e.hit, amount, seq: (view.lastHit?.seq ?? 0) + 1 },
      }
    }

    case 'heal':
      return patch(view, e.actor.slot, (m) => withCondition(m, e.condition))

    case 'faint':
      return patch(view, e.actor.slot, (m) => ({ ...m, hp: 0, fainted: true }))

    case 'status':
      return patch(view, e.actor.slot, (m) => ({ ...m, status: e.status }))

    case 'curestatus':
      // 대타·교체로 이미 다른 애가 나와 있을 수 있다. 지금 걸린 것과 같을 때만 푼다
      return patch(view, e.actor.slot, (m) => (m.status === e.status ? { ...m, status: 'ok' } : m))

    case 'boost':
      return patch(view, e.actor.slot, (m) => ({
        ...m,
        // 4세대 랭크는 ±6에서 멈춘다
        boosts: { ...m.boosts, [e.stat]: clampBoost(m.boosts[e.stat] + e.amount) },
      }))

    case 'weather':
      return { ...view, weather: e.weather }

    case 'sidecondition': {
      const next = stack(view.sideConditions[e.side], e.condition, e.start)
      if (next === view.sideConditions[e.side]) return view
      return { ...view, sideConditions: { ...view.sideConditions, [e.side]: next } }
    }

    case 'fieldcondition': {
      const next = toggle(view.field, e.condition, e.start)
      return next === view.field ? view : { ...view, field: next }
    }

    case 'volatile':
      return patch(view, e.actor.slot, (m) => {
        const next = toggle(m.volatiles, e.volatile, e.start)
        return next === m.volatiles ? m : { ...m, volatiles: next }
      })

    case 'win':
      return { ...view, ended: true, winner: e.winner }

    case 'tie':
      return { ...view, ended: true, winner: null }

    // 잡거나 도망치면 배틀은 그 자리에서 끝난다. sim은 이걸 모르므로(대전 규칙
    // 밖이다) `|win|`이 안 온다 — 컨트롤러가 제 뷰만 세우고 사건에는 안 남기면
    // **재생기가 접어 만든 화면은 영영 안 끝난 상태**로 남는다. 담금질에서
    // 그렇게 여섯 판이 어긋났다 (`soak.test.ts`)
    case 'ball':
      return {
        ...view,
        ended: e.caught || view.ended,
        lastBall: {
          slot: e.actor.slot,
          ball: e.ball,
          shakes: e.shakes,
          caught: e.caught,
          seq: (view.lastBall?.seq ?? 0) + 1,
        },
      }

    case 'escape':
      return e.success ? { ...view, ended: true } : view

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
