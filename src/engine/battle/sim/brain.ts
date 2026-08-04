// 트레이너 AI와 배틀 사이의 다리 (PLAN §7.7)
//
// `ai/`는 sim을 모르고 프로토콜도 모른다 — 번호로 된 상황 하나(`AiTurn`)만 받는다.
// 그 상황을 만들어 주는 것이 이 파일이다.
//
// **AI가 알면 안 되는 것을 여기서 막는다.** 원작 AI는 상대의 실능력치까지 보지만
// (그래서 컨트롤러가 들고 있는 개체를 그대로 쓴다) 두 가지는 못 본다:
//
//   1. 상대의 특성 — 드러나기 전에는 종족의 두 후보 중 하나를 찍는다
//   2. 상대의 기술 — 한 번 쓴 것만 안다
//
// 그 둘을 이 클래스가 이벤트로 쌓는다.
//
// ⚠️ 지연 로딩 경계 (bridge.ts 주석 참고).
import type { Move } from '../../../data/schema'
import type { AiMon, AiMove, AiTurn } from '../ai/context'
import type { BattleAction } from '../choice'
import { legalActions } from '../choice'
import type { BattleEvent, BattleRequest, SideId } from '../events'
import { trainerPolicy } from '../ai/policy'
import { abilitySlotOf, genderOf, statsOf } from '../../pokemon/instance'
import type { BattleView, ViewMon } from '../view'
import { romMove } from './bridge'
import type { SideMon } from './session'

/** `loadMoves()`가 주는 표에서 AI가 쓰는 부분만 */
export interface MoveTable {
  byId: ReadonlyMap<number, Move>
}

/** 방어·판별의 기술 효과 번호. 연속 사용 횟수를 세는 데만 쓴다 */
const PROTECT_EFFECT = 111

export interface BrainOptions {
  /** 트레이너 데이터의 AI 비트 */
  flags: number
  moves: MoveTable
  random: () => number
  /** AI가 조종하는 쪽. 지금은 늘 p2다 */
  side: SideId
  team: SideMon[]
  foeTeam: SideMon[]
}

export class TrainerBrain {
  private readonly options: BrainOptions
  /** 드러난 특성. 키 → 롬 특성 번호 */
  private readonly revealed = new Map<string, number>()
  /** 상대가 실제로 써 보인 기술 */
  private readonly foeMoves = new Set<number>()
  private foeLast: Move | null = null
  /** 내가 방어·판별을 연속으로 쓴 횟수 */
  private protectChain = 0
  /** 키 → 그 개체가 등판한 턴 번호 */
  private readonly entered = new Map<string, number>()
  private turn = 0

  constructor(options: BrainOptions) {
    this.options = options
  }

  /** 상대편(우리) 쪽 표시 */
  private get foeSide(): SideId {
    return this.options.side === 'p1' ? 'p2' : 'p1'
  }

  /**
   * 지나간 사건을 본다. 컨트롤러가 매 정산마다 부른다.
   *
   * 특성이 드러나는 경로가 둘이다 — `|-ability|`(위협처럼 스스로 알리는 것)와
   * `[from] ability: ...`(효과가 발동한 것). 둘 다 담는다
   */
  observe(events: readonly BattleEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'turn':
          this.turn = e.turn
          break
        case 'switch':
          this.entered.set(e.actor.name, this.turn)
          // 교체하면 그 자리에 붙어 있던 지식은 의미가 없어진다
          if (e.actor.side === this.foeSide) this.foeLast = null
          else this.protectChain = 0
          break
        case 'ability':
          if (e.ability !== null) this.revealed.set(e.actor.name, e.ability)
          break
        case 'move': {
          const data = e.move === null ? null : this.options.moves.byId.get(e.move) ?? null
          if (e.actor.side === this.options.side) {
            // 방어를 이어 쓰면 원작에서도 성공률이 반씩 준다. AI는 그걸 세고 있다
            this.protectChain = data?.effect === PROTECT_EFFECT ? this.protectChain + 1 : 0
            break
          }
          if (e.actor.side !== this.foeSide || e.move === null) break
          this.foeMoves.add(e.move)
          this.foeLast = data
          break
        }
        default:
          break
      }
      if (e.kind === 'damage' || e.kind === 'heal') {
        const cause = e.from
        if (cause?.kind === 'ability' && cause.id !== null) {
          this.revealed.set(e.actor.name, cause.id)
        }
      }
    }
  }

  /** 이 키의 개체가 지금 몇 번째 턴을 맞고 있는가. 셋업 판단이 쓴다 */
  private turnsOut(key: string): number {
    const since = this.entered.get(key)
    return since === undefined ? 0 : Math.max(0, this.turn - since)
  }

  /**
   * 특성을 정한다.
   *
   * 내 쪽은 PID가 고른 칸이 진짜다. 상대 쪽은 드러났으면 그 값이고, 아니면
   * 두 후보 중 하나를 동전 던져 찍는다 — 원작이 정확히 이렇게 한다.
   * (원본은 기술 칸마다 다시 던진다. 여기서는 한 턴에 한 번만 던진다 —
   * 네 칸이 서로 다른 특성을 가정하면 점수가 뒤죽박죽이 된다)
   */
  private abilityOf(mon: SideMon, mine: boolean): number {
    const [a, b] = mon.species.abilities
    if (mine) return abilitySlotOf(mon.mon.pid) === 1 && b ? b : a
    const known = this.revealed.get(mon.key)
    if (known) return known
    if (a && b) return this.options.random() < 0.5 ? a : b
    return a || b
  }

  /** 배틀에 나와 있는 한 마리를 AI가 보는 모습으로 */
  private toAiMon(mon: SideMon, seen: ViewMon, view: BattleView, mine: boolean): AiMon {
    const team = mine ? this.options.team : this.options.foeTeam
    return {
      species: mon.species.id,
      types: mon.species.types,
      level: mon.mon.level,
      hp: seen.hp,
      maxHp: seen.maxHp,
      status: seen.status,
      boosts: seen.boosts,
      ability: this.abilityOf(mon, mine),
      stats: statsOf(mon.mon, mon.species),
      heldItem: mon.mon.heldItem,
      gender: genderOf(mon.mon.pid, mon.species.genderRatio),
      bench: team.filter((m) => m.key !== mon.key && m.mon.hp > 0).length,
      volatiles: seen.volatiles,
      side: view.sideConditions[seen.side],
    }
  }

  /** 요청에 담긴 기술 칸을 번호로 푼다. 하나라도 못 풀면 null — 점수를 못 매긴다 */
  private toAiMoves(actions: readonly BattleAction[]): AiMove[] | null {
    const out: AiMove[] = []
    for (const a of actions) {
      if (a.type !== 'move') continue
      const id = romMove(a.name)
      const data = id === null ? undefined : this.options.moves.byId.get(id)
      if (id === null || !data) return null
      out.push({
        slot: a.slot,
        id,
        effect: data.effect,
        power: data.power,
        type: data.type,
        category: data.category,
        accuracy: data.accuracy,
        priority: data.priority,
      })
    }
    return out
  }

  /** 지금 상황. 기술을 못 고르는 턴이면 null */
  buildTurn(request: BattleRequest, view: BattleView): AiTurn | null {
    const mySeen = view.active[this.options.side]
    const foeSeen = view.active[this.foeSide]
    if (!mySeen || !foeSeen) return null

    const me = this.options.team.find((m) => m.key === mySeen.key)
    const foe = this.options.foeTeam.find((m) => m.key === foeSeen.key)
    if (!me || !foe) return null

    const moves = this.toAiMoves(legalActions(request))
    if (!moves || !moves.length) return null

    return {
      self: this.toAiMon(me, mySeen, view, true),
      foe: this.toAiMon(foe, foeSeen, view, false),
      moves,
      weather: view.weather,
      field: view.field,
      turn: this.turnsOut(mySeen.key),
      foeKnownMoves: this.foeMoves,
      foeLastMoveCategory: this.foeLast?.category ?? null,
      protectChain: this.protectChain,
      random: this.options.random,
    }
  }

  /** 컨트롤러에 꽂을 정책. 뷰는 매번 바뀌므로 함수로 받는다 */
  policy(view: () => BattleView) {
    return trainerPolicy({
      flags: this.options.flags,
      random: this.options.random,
      build: (request) => this.buildTurn(request, view()),
    })
  }
}

