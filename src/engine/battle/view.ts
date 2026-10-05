// 배틀 화면 상태 (PLAN §7.2) — 이벤트를 접어서 만든다.
//
// **프로토콜만 보고 만든다.** 우리가 sim에 넣은 값을 그대로 베껴 쓰지 않는다 —
// 그러면 sim이 실제로 무슨 일을 했는지와 화면이 어긋나도 아무도 모른다.
// `view.test.ts`가 실전 배틀에서 이 뷰의 HP와 sim의 `|request|`를 매 턴 대조한다.
//
// sim을 import 하지 않으므로 UI가 마음대로 가져다 써도 지연 로딩 경계가 안 깨진다.
import type { Gender, Status } from '../pokemon/instance'
import type { BattleEvent, BoostStat, Cause, Condition, Effectiveness, SideId, SlotId } from './events'
import { SLOTS, slotId } from './events'
import type { StatusAnimKey } from './vfx'

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
  /**
   * **숫자로서** 쓰러졌는가 — HP가 0이다. 규칙이 보는 값이다.
   *
   * ⚠️ **화면이 이 값으로 몸을 지우면 안 된다.** 게이지가 닳는 동안에도 이미
   * 참이라, 무대가 이걸 보고 사라지면 체력이 내려가는 도중에 몸이 먼저 없어진다.
   * 화면이 보는 것은 아래 `presence`다
   */
  fainted: boolean
  /**
   * **화면에 서 있는가.** `down`은 기절 연출이 시작됐다는 뜻이다.
   *
   * 숫자 HP와 따로 두는 이유가 순서다. 원작은 `UPDATE_HP`(게이지) →
   * `PlayFaintAnimation`(몸) → `PrintMessage`(글) 차례고, 그 사이에 몸은
   * **살아 있는 모습으로 맞고 있다.** 그래서 이 값은 `faint` 사건에서만 바뀐다 —
   * `damage`로 HP가 0이 되는 것으로는 안 바뀐다
   */
  presence: 'alive' | 'down'
  /**
   * 이 개체에게 걸려 있는 것. `substitute`, `leechseed`, `confusion`.
   *
   * 교체하면 통째로 사라진다 — 개체가 아니라 **자리**에 붙은 값이라서다
   */
  volatiles: ReadonlySet<string>
  /**
   * 경험치 막대가 그 레벨 안에서 얼마나 찼나 (0~1). **우리 쪽만, 알 때만** 있다.
   *
   * 원작 내 체력판의 EXP 게이지다(`HEALTHBOX_EXP_CELL_COUNT` 12칸 · 96픽셀). 상대 판에는
   * 없다. 미는 것은 박자가 펴 놓은 `expgauge`·`levelup` 사건이고, 차는 시간은
   * `playback`이 원작 픽셀 수로 낸다 — 화면은 그 박자의 시계로 따라 그리기만 한다
   */
  expProgress?: number | null
  /**
   * **변신하기 전의** 종. 변신하면 `species`가 따라 한 쪽 종으로 바뀌어 무대가 몸을
   * 갈아 끼운다(`form`과 같은 길). 그런데 체력판의 이름은 그대로다 — 원작도 별명을
   * 그대로 띄운다. 이름을 그리는 쪽은 이것을 먼저 본다. 변신하지 않았으면 없다
   */
  baseSpecies?: number | null
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
  lastMove: { by: SlotId; to: SlotId | null; move: number | null; seq: number; spread: readonly SlotId[] } | null
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
  /**
   * 방금 받은 경험치. 소리가 이걸 보고 난다 (`ui/battle/BattleSound`).
   *
   * `seq`는 `lastHit`와 같은 이유다 — 같은 값이 이어서 올 수 있다(파티 여섯이
   * 같은 점수를 받으면 그렇다).
   *
   * ⚠️ **막대 값이 아니라 소리 값이다.** 막대는 마리마다 `ViewMon.expProgress`가 들고,
   * 이 값은 게이지가 **차기 시작하는** 순간을 알린다 — 원작도 그 자리에서 게이지 소리를
   * 틀고(`Task_UpdateExpGauge` `case 0`) 막대가 다 차면 끈다
   */
  lastReward: { exp: number; levelUp: boolean; seq: number } | null
  /**
   * 방금 튼 상태 이상·능력 변화 연출 (원작 「부분 연출」 · `engine/battle/vfx`의 `STATUS_ANIMS`).
   * 무대(`scene/battle/StatusVfx`)가 `seq`가 바뀔 때 그 자리 몸에서 한 번 돈다.
   *
   * `kind`는 이 연출을 부른 사건이다 — 걸림(`status`·`volatile`) · 상태 피해(`damage`) ·
   * 못 움직임(`cant`·`activate`) · 능력 변화(`boost`·`setboost`).
   *
   * `moveSeq`는 **한 기술 안의 능력 변화를 한 번으로 묶는** 열쇠다. 원작은 둘 이상을 바꾸는
   * 기술(코스모파워·명상…)에서 첫 변화만 연출하고 나머지는 글만 낸다
   * (`subscript_update_stat_stage.s`의 `SYSCTL_UPDATE_STAT_STAGES`). 특성·도구가 바꾼 것은
   * 따로 돌므로 null이다
   */
  lastEffect: {
    slot: SlotId
    key: StatusAnimKey
    kind: 'status' | 'volatile' | 'damage' | 'cant' | 'activate' | 'boost' | 'setboost'
    moveSeq: number | null
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
    lastReward: null,
    lastEffect: null,
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
    // ⚠️ **여기서 `presence`를 안 건드린다.** 게이지가 다 닳기 전에 몸이
    // 사라지던 자리다 — 지우는 것은 `faint` 사건뿐이다
  }
}

/** 이벤트 하나를 접는다. 뷰는 불변이라 바뀐 게 없으면 같은 객체가 돌아온다 */
export function applyEvent(view: BattleView, e: BattleEvent): BattleView {
  switch (e.kind) {
    case 'turn':
      return { ...view, turn: e.turn }

    case 'move':
      // 화면에는 아무 변화가 없지만 **연출은 여기서 시작한다.** 박자가 이
      // 사건에 그 기술의 연출 길이만큼 쉬는 자리를 내 준다 (`playback`)
      return {
        ...view,
        lastMove: {
          by: e.actor.slot,
          to: e.target?.slot ?? null,
          move: e.move,
          seq: (view.lastMove?.seq ?? 0) + 1,
          spread: e.spread ?? [],
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
        // 등판하는 마리는 늘 서 있다. 쓰러진 채로 나오는 자리는 없다
        presence: 'alive',
        volatiles: EMPTY, // 대타출동·씨뿌리기도 마찬가지다
        // 변신도 교체로 풀린다 — `baseSpecies`를 안 싣는 것이 그 뜻이다
        ...(e.actor.side === 'p1' && e.expProgress !== undefined ? { expProgress: e.expProgress } : {}),
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
      // 독·화상 피해 — 원작은 「독의 데미지를 입었다!」 글 뒤에 연출을 틀고 게이지를 깎는다
      // (`subscript_poison_damage.s` 23줄 · `subscript_burn_damage.s` 17줄)
      const residual = residualAnim(e.from)
      if (residual !== null) return withEffect(hurt, e.actor.slot, residual, 'damage')
      if (e.hit === undefined) return hurt
      return {
        ...hurt,
        lastHit: { slot: e.actor.slot, ...e.hit, amount, seq: (view.lastHit?.seq ?? 0) + 1 },
      }
    }

    case 'reward':
      // 원작이 경험치 바가 차기 **시작할 때** 소리를 낸다
      // (`battle_display.c`의 `Task_UpdateExpGauge` `case 0`).
      //
      // ⚠️ **여기서는 레벨도 체력도 안 고친다.** 이 사건은 진실의 뷰(`battleStore`의
      // `truth`)에도 접히는데 sim은 레벨업을 모른다 — 거기서 최대 HP를 고치면 sim과
      // 숫자가 갈린다. 체력판을 고치는 것은 박자가 펴 놓은 `levelup`이다
      return {
        ...view,
        lastReward: {
          exp: e.exp, levelUp: e.levels.length > 0, seq: (view.lastReward?.seq ?? 0) + 1,
        },
      }

    case 'expgauge': {
      const slot = mineOf(view, e.key)
      if (slot === null) return view
      return patch(view, slot, (m) => ({ ...m, expProgress: clamp01(e.to) }))
    }

    case 'levelup': {
      // 원작이 레벨이 오르는 그 자리에서 능력치를 다시 셈하고 체력판을 고친다
      // (`SEQ_GET_EXP_WAIT_LEVEL_UP_EFFECT` → `BattleController_EmitRefreshHPGauge`).
      // 막대는 0에서 다시 찬다 — 막대 값을 몰랐으면 계속 모른다
      const slot = mineOf(view, e.key)
      if (slot === null) return view
      return patch(view, slot, (m) => {
        const maxHp = e.after?.hp ?? m.maxHp
        // `Pokemon_CalcStats` — 쓰러지지 않았으면 최대 HP가 는 만큼 HP에 더한다.
        // 비율이 아니라 차이라서, 같은 사건을 두 번 접어도 두 번째는 0을 더한다
        const hp = m.hp > 0 ? m.hp + (maxHp - m.maxHp) : m.hp
        return {
          ...m, level: e.level, maxHp, hp,
          ...(typeof m.expProgress === 'number' ? { expProgress: 0 } : {}),
        }
      })
    }

    case 'transform': {
      // 따라 한 쪽의 종·폼·랭크를 그대로 입는다 — `BtlCmd_Transform`이 `BattleMon`을
      // 특성 칸까지 통째로 베낀다(랭크 `statBoosts`가 그 안에 있다).
      // 무대는 종이 바뀌는 것을 보고 몸을 갈아 끼운다 — 폼이 바뀔 때와 같은 길이다
      const target = view.active[e.target.slot]
      const species = e.species !== undefined ? e.species : target?.species ?? null
      const form = e.form ?? target?.form ?? 0
      return patch(view, e.actor.slot, (m) => ({
        ...m,
        baseSpecies: m.baseSpecies ?? m.species,
        species,
        form,
        boosts: target ? { ...target.boosts } : m.boosts,
      }))
    }

    // 하양허브. **내려간 것만** 0으로 — 올라간 랭크는 그대로 둔다
    case 'clearnegativeboosts':
      return patch(view, e.actor.slot, (m) => {
        const boosts = { ...m.boosts }
        for (const stat of BOOST_STATS) if (boosts[stat] < 0) boosts[stat] = 0
        return { ...m, boosts }
      })

    case 'heal':
      return patch(view, e.actor.slot, (m) => withCondition(m, e.condition))

    case 'faint':
      // **화면에서 지는 것이 여기서 시작한다.** 박자도 이 사건에서 몸이 다
      // 사라질 때까지 쉰다 (`playback`의 `HOLD_FAINT_PRESENTATION`)
      return patch(view, e.actor.slot, (m) => ({
        ...m, hp: 0, fainted: true, presence: 'down' as const,
      }))

    case 'status': {
      const next = patch(view, e.actor.slot, (m) => ({ ...m, status: e.status }))
      // ⚠️ **잠자기는 연출이 없다.** `subscript_rest.s`는 체력판 표시만 바꾸고
      // `PlayBattleAnimation`을 안 부른다 — 하품·최면술로 잠들 때(`subscript_fall_asleep`)와 다르다
      if (e.from?.kind === 'move' && e.from.id === MOVE_REST) return next
      const key = STATUS_ANIM[e.status]
      return key === undefined ? next : withEffect(next, e.actor.slot, key, 'status')
    }

    case 'cant': {
      // 잠들어 있다 · 얼어 있다 · 몸이 저려 움직일 수 없다 — 글 뒤에 그 연출을 한 번 더 튼다
      // (`subscript_sleeping.s` · `subscript_frozen.s` · `subscript_fully_paralyzed.s`)
      const key = CANT_ANIM[e.reason]
      return key === undefined ? view : withEffect(view, e.actor.slot, key, 'cant')
    }

    case 'activate':
      // 「혼란하고 있다!」 — 기술을 내기 전에 원작이 글 다음에 튼다 (`subscript_confused.s` 9줄).
      // 스스로를 공격하는 갈래(`subscript_hurt_self_in_confusion.s`)도 같은 연출 한 번이다
      if (e.actor === null || e.effect.id !== 'confusion') return view
      return withEffect(view, e.actor.slot, 'confused', 'activate')

    case 'curestatus':
      // 대타·교체로 이미 다른 애가 나와 있을 수 있다. 지금 걸린 것과 같을 때만 푼다
      return patch(view, e.actor.slot, (m) => (m.status === e.status ? { ...m, status: 'ok' } : m))

    case 'boost': {
      const next = patch(view, e.actor.slot, (m) => ({
        ...m,
        // 4세대 랭크는 ±6에서 멈춘다
        boosts: { ...m.boosts, [e.stat]: clampBoost(m.boosts[e.stat] + e.amount) },
      }))
      // 「더 오르지 않는다!」(0)는 연출 없이 글만이다 (`BtlCmd_ChangeStatStage`의 `jumpNoChange`)
      if (e.amount === 0) return next
      return withEffect(next, e.actor.slot, e.amount > 0 ? 'statBoost' : 'statDrop', 'boost',
        e.from ? null : view.lastMove?.seq ?? null)
    }

    // 배북. 더하는 게 아니라 그 값으로 못 박는다
    case 'setboost': {
      const was = view.active[e.actor.slot]?.boosts[e.stat] ?? 0
      const next = patch(view, e.actor.slot, (m) => ({
        ...m,
        boosts: { ...m.boosts, [e.stat]: clampBoost(e.amount) },
      }))
      // 배북·분노의경혈이 다 오름 연출을 튼다 (`subscript_belly_drum.s` 15줄 ·
      // `subscript_critical_hit.s` 13줄)
      const to = clampBoost(e.amount)
      if (to === was) return next
      return withEffect(next, e.actor.slot, to > was ? 'statBoost' : 'statDrop', 'setboost')
    }

    // 흑안개. **선 자리 전부**를 되돌린다 — 한 쪽만 지우면 상대의 랭크가 남는다
    case 'clearboosts': {
      const active = { ...view.active }
      let changed = false
      for (const slot of SLOTS) {
        const mon = active[slot]
        if (!mon) continue
        active[slot] = { ...mon, boosts: noBoosts() }
        changed = true
      }
      return changed ? { ...view, active } : view
    }

    // 심리전. 베끼는 쪽의 랭크를 통째로 덮어쓴다
    case 'copyboosts': {
      const source = view.active[e.from.slot]
      if (!source) return view
      return patch(view, e.actor.slot, (m) => ({ ...m, boosts: { ...source.boosts } }))
    }

    case 'weather':
      return { ...view, weather: e.weather }

    case 'sidecondition': {
      const next = stack(view.sideConditions[e.side], e.effect.id, e.start)
      if (next === view.sideConditions[e.side]) return view
      return { ...view, sideConditions: { ...view.sideConditions, [e.side]: next } }
    }

    case 'fieldcondition': {
      const next = toggle(view.field, e.effect.id, e.start)
      return next === view.field ? view : { ...view, field: next }
    }

    case 'volatile': {
      const next = patch(view, e.actor.slot, (m) => {
        const set = toggle(m.volatiles, e.effect.id, e.start)
        return set === m.volatiles ? m : { ...m, volatiles: set }
      })
      // 혼란에 빠졌다 (`subscript_confuse.s` 32줄 — 난동이 끝나 지쳐 혼란할 때도 같은 대본이다)
      if (!e.start || e.effect.id !== 'confusion') return next
      return withEffect(next, e.actor.slot, 'confused', 'volatile')
    }

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

/** `MOVE_REST` (`generated/moves.txt`의 157번째 줄 = 156) */
const MOVE_REST = 156

/** 걸린 상태 → 그 연출 (`Battler_StatusCondition`과 같은 짝 — 맹독도 독 연출이다) */
const STATUS_ANIM: Partial<Record<Status, StatusAnimKey>> = {
  slp: 'asleep', psn: 'poisoned', tox: 'poisoned', brn: 'burned', frz: 'frozen', par: 'paralyzed',
}

/** `|cant|`의 까닭 → 그 연출. 잠·얼음·마비 셋만 원작이 연출을 붙인다 */
const CANT_ANIM: Partial<Record<string, StatusAnimKey>> = {
  slp: 'asleep', frz: 'frozen', par: 'paralyzed',
}

/** 상태 피해의 원인 → 그 연출. 독·맹독·화상만 피해를 준다 */
function residualAnim(from: Cause | null): StatusAnimKey | null {
  if (from?.kind !== 'status') return null
  if (from.name === 'psn' || from.name === 'tox') return 'poisoned'
  if (from.name === 'brn') return 'burned'
  return null
}

/** 능력 변화를 부른 사건 둘 — 같은 기술 안에서 묶이는 것은 이 둘끼리다 */
const STAT_KINDS: ReadonlySet<string> = new Set(['boost', 'setboost'])

/**
 * 부분 연출 하나를 싣는다.
 *
 * ⚠️ **대타 뒤의 마리에는 안 튼다.** 원작 `BattleSystem_ShouldShowStatusEffect`가 대타출동이
 * 서 있으면 이 여덟을 다 거른다(늘 트는 것은 교체·날씨·대타 연출뿐이다)
 *
 * ⚠️ **한 기술 안의 능력 변화는 한 번이다.** 바로 앞 연출이 같은 기술(`moveSeq`) · 같은 자리 ·
 * 같은 방향의 능력 변화면 안 싣는다 — 원작이 둘째부터 `SYSCTL_UPDATE_STAT_STAGES`로 건너뛴다.
 * 방향이 바뀌면 다시 튼다: 저주는 스피드 내림 · 공격 오름을 각각 틀고 방어 오름만 건너뛴다
 * (`subscript_curse_normal.s` — 둘째 호출 앞에서야 `SYSCTL_STAT_STAGE_CHANGE_SHOWN`을 켠다)
 */
function withEffect(
  view: BattleView,
  slot: SlotId,
  key: StatusAnimKey,
  kind: NonNullable<BattleView['lastEffect']>['kind'],
  moveSeq: number | null = null,
): BattleView {
  const mon = view.active[slot]
  if (!mon || mon.volatiles.has('substitute')) return view
  const prev = view.lastEffect
  if (
    prev !== null && moveSeq !== null && prev.moveSeq === moveSeq && prev.slot === slot
    && prev.key === key && STAT_KINDS.has(prev.kind) && STAT_KINDS.has(kind)
  ) return view
  return { ...view, lastEffect: { slot, key, kind, moveSeq, seq: (prev?.seq ?? 0) + 1 } }
}

function clampBoost(n: number): number {
  return n < -6 ? -6 : n > 6 ? 6 : n
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/** 그 키를 든 **우리 쪽** 자리. 경험치는 우리 마리만 받는다 */
function mineOf(view: BattleView, key: string): SlotId | null {
  const slot = slotOfKey(view, key)
  return slot !== null && slot.startsWith('p1') ? slot : null
}

/** 이벤트 줄기를 통째로 접는다 */
export function applyEvents(view: BattleView, events: readonly BattleEvent[]): BattleView {
  let next = view
  for (const e of events) next = applyEvent(next, e)
  return next
}
