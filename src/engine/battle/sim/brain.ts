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
import { legalActions, TARGET_FOE_A, TARGET_FOE_B } from '../choice'
import type { BattleEvent, BattleRequest, SideId } from '../events'
import { trainerPolicy } from '../ai/policy'
import { BDSP_TOP_FLAGS } from '../ai/score'
import { postKoSwitchIn, shouldSwitch, type BenchMon } from '../ai/switching'
import { abilitySlotOf, genderOf, statsOf } from '../../pokemon/instance'
import type { BattleView, ViewMon } from '../view'
import { activeAt } from '../view'
import { romMove } from './bridge'
import { idleSlotOf, type SideMon } from './session'

/** `loadMoves()`가 주는 표에서 AI가 쓰는 부분만 */
export interface MoveTable {
  byId: ReadonlyMap<number, Move>
}

/** 방어·판별의 기술 효과 번호. 연속 사용 횟수를 세는 데만 쓴다 */
const PROTECT_EFFECT = 111

interface BrainOptions {
  /** 트레이너 데이터의 AI 비트 */
  flags: number
  moves: MoveTable
  /**
   * 도구 한 줄. **`ai/`가 표를 안 읽으므로 여기서 값을 뽑아 넘긴다** —
   * 그 성질이 AI 시험을 판 없이 돌게 하는 것이라 깨면 안 된다.
   *
   * 안 주면 도구 보정만 안 붙고 나머지는 그대로 돈다 (야생전에는 AI가 없다)
   */
  item?: (id: number) => { holdEffect?: number, effectParam?: number,
    naturalGiftPower?: number, naturalGiftType?: number } | undefined
  random: () => number
  /**
   * 자료 값 위에 까는 바닥. 안 주면 `BDSP_TOP_FLAGS`다.
   *
   * ⚠️ **바꿔 끼우라고 연 자리가 아니다.** 바닥을 바꾸면 게임 전체의 상대가
   * 달라진다 — 여는 이유는 하나, `ai/strength.test.ts`가 **바닥 후보끼리
   * 붙여서** 어느 쪽이 센지 재기 때문이다. 그 잣대 없이 바닥을 고르면
   * 지어낸 값이 된다
   */
  floor?: number
  /** AI가 조종하는 쪽. 지금은 늘 p2다 */
  side: SideId
  /**
   * 더블인가 (PARITY §2.2).
   *
   * ⚠️ **안 주면 자리 A로만 생각한다.** 실제로 그랬다 — 둘째 자리도 첫째의
   * 기술 목록으로 점수를 매기고, 컨트롤러가 그 **칸 번호**만 둘째에게 옮겨
   * 심었다. 둘째의 기술칸이 다르면 그것은 사실상 무작위였다
   */
  doubles?: boolean
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

  /**
   * 실제로 쓰는 AI 비트. 자료 값에 **BDSP의 강자들이 켜고 나오는 것**을 깐다
   * (`BDSP_TOP_FLAGS` = 111).
   *
   * 플래티넘 롬 그대로면 928명 중 639명이 헛수만 거르는 수준이라, 길에서
   * 만나는 트레이너가 반감되는 기술을 그대로 내지른다. 바닥을 까는 자리는
   * 여기 하나뿐이고, 자료에 더 켜져 있으면 그쪽을 남긴다 —
   * 플래티넘에만 있는 `RISKY`가 그렇다 (`|`라서 안 지워진다)
   */
  private readonly flags: number

  constructor(options: BrainOptions) {
    this.options = options
    this.flags = options.flags | (options.floor ?? BDSP_TOP_FLAGS)
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

  /**
   * 그 도구의 보정 값들 (`items.json`).
   *
   * ⚠️ **31은 「없음」이다** — 자연의은혜 타입이 5비트를 전부 세운 값이라,
   * 그대로 타입 번호로 쓰면 없는 타입이 된다
   */
  private itemFacts(id: number): Pick<AiMon,
  'itemEffect' | 'itemParam' | 'naturalGiftPower' | 'naturalGiftType'> {
    const it = id > 0 ? this.options.item?.(id) : undefined
    const ngType = it?.naturalGiftType ?? 31
    return {
      itemEffect: it?.holdEffect ?? 0,
      itemParam: it?.effectParam ?? 0,
      naturalGiftPower: it?.naturalGiftPower ?? 0,
      naturalGiftType: ngType === 31 ? -1 : ngType,
    }
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
      ...this.itemFacts(mon.mon.heldItem),
      weightHg: mon.species.weightHg,
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
        ...(a.target === undefined ? {} : { target: a.target }),
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

  /**
   * 지금 상황. 기술을 못 고르는 턴이면 빈 배열.
   *
   * ⚠️ **더블은 여러 벌이 나온다.** 원작은 겨눌 수 있는 자리마다 점수를 따로
   * 매기므로(`TrainerAI_MainDoubles`), 겨눈 자리로 후보를 묶고 그 자리에 선
   * 마리를 `foe`로 삼은 한 벌씩을 낸다. 싱글은 늘 한 벌이다
   */
  buildTurns(request: BattleRequest, view: BattleView, at = 0): AiTurn[] {
    const mySeen = activeAt(view, this.options.side, at)
    if (!mySeen) return []
    const me = this.options.team.find((m) => m.key === mySeen.key)
    if (!me) return []

    const groups = new Map<number | undefined, BattleAction[]>()
    for (const a of this.choices(request, view, at)) {
      if (a.type !== 'move') continue
      const list = groups.get(a.target)
      if (list) list.push(a)
      else groups.set(a.target, [a])
    }
    if (groups.size === 0) return []

    const self = this.toAiMon(me, mySeen, view, true)
    // 「내가 무엇을 아는가」를 묻는 자리가 볼 목록. 겨눈 자리로 갈리기 **전**의
    // 후보 전부다 — 조각으로 물으면 대상을 안 찍는 기술이 다른 조각에 있어서
    // 「모른다」가 된다 (`ai/context.knownMoves`)
    const all = [...groups.values()].flatMap((list) => this.toAiMoves(list) ?? [])
    const out: AiTurn[] = []
    for (const [target, actions] of groups) {
      const foeSeen = this.foeSeenFor(view, target, at)
      const foe = foeSeen && this.options.foeTeam.find((m) => m.key === foeSeen.key)
      if (!foeSeen || !foe) return []
      const moves = this.toAiMoves(actions)
      if (!moves || !moves.length) return []
      out.push({
        self,
        foe: this.toAiMon(foe, foeSeen, view, false),
        moves,
        all,
        weather: view.weather,
        field: view.field,
        turn: this.turnsOut(mySeen.key),
        foeKnownMoves: this.foeMoves,
        foeLastMoveCategory: this.foeLast?.category ?? null,
        protectChain: this.protectChain,
        random: this.options.random,
      })
    }
    return out
  }

  /**
   * 그 후보가 겨눈 자리에 서 있는 마리.
   *
   * 대상을 안 찍는 후보(`target`이 없다 — 싱글 전부와 전체기)는 **마주 선
   * 자리**를 본다. 원작은 그 자리를 `BattleSystem_RandomOpponent`로 뽑지만,
   * 우리는 그 자리에서 뽑은 값이 명령의 대상과 어긋날 수 있어 마주 선 쪽으로
   * 고정한다 — 서 있지 않으면 상대 첫 자리다
   */
  private foeSeenFor(view: BattleView, target: number | undefined, at: number): ViewMon | null {
    if (target === TARGET_FOE_A) return activeAt(view, this.foeSide, 0)
    if (target === TARGET_FOE_B) return activeAt(view, this.foeSide, 1)
    return activeAt(view, this.foeSide, at) ?? activeAt(view, this.foeSide, 0)
  }

  /**
   * AI가 고를 수 있는 것.
   *
   * **빈 턴 칸을 뺀다.** 상대 팀에도 맨 뒤에 물장구가 한 칸 붙어 있는데
   * (`session.ts`의 `IDLE_MOVE`) 그건 트레이너가 **도구를 쓰는 턴**에 기술을
   * 안 쓰게 하려고 우리가 붙인 칸이다. AI가 그걸 고르면 그냥 한 턴을 버린다.
   *
   * ⚠️ **짝을 겨누는 후보도 뺀다.** 원작은 짝도 후보로 놓고 점수를 매기는데
   * (`TrainerAI_MainDoubles`), 그것이 성립하는 것은 짝을 도우려는 갈래를
   * `AI_FLAG_TAG_STRATEGY`가 따로 들고 있어서다. 그 루틴 없이 짝을 후보에
   * 남기면 **효과가 굉장한 쪽이 제 짝**이라 자기편을 때린다. 다 빼서 고를 것이
   * 없어지면 안 뺀다 — 도우미밖에 없는 마리가 그 자리다
   */
  private choices(request: BattleRequest, view: BattleView, at = 0): BattleAction[] {
    const base = { hiddenSlot: idleSlotOf(request, at), at }
    if (this.options.doubles !== true) return legalActions(request, base)
    const all = legalActions(request, {
      ...base,
      doubles: true,
      foeAlive: this.aliveOn(view, this.foeSide),
      allyAlive: this.aliveOn(view, this.options.side)[at === 0 ? 1 : 0],
    })
    const foeOnly = all.filter((a) => a.type !== 'move' || a.target === undefined
      || a.target > 0)
    return foeOnly.some((a) => a.type === 'move') ? foeOnly : all
  }

  /** 그 쪽 두 자리에 멀쩡한 마리가 서 있는가 */
  private aliveOn(view: BattleView, side: SideId): [boolean, boolean] {
    return [0, 1].map((at) => {
      const mon = activeAt(view, side, at)
      return mon !== null && !mon.fainted
    }) as [boolean, boolean]
  }

  /**
   * 벤치에 앉은 후보. 교체 판단이 쓴다.
   *
   * ⚠️ **HP는 시작값이다.** 벤치의 실제 남은 체력은 우리 쪽 개체 사본이 안 갖고
   * 있다. 교체 판단은 타입·능력치·기술만 보므로 지금은 걸리는 데가 없지만,
   * 체력을 보는 갈래를 나중에 붙일 때는 여기부터 고쳐야 한다
   */
  private benchOf(options: readonly BattleAction[]): BenchMon[] {
    const out: BenchMon[] = []
    for (const a of options) {
      if (a.type !== 'switch') continue
      const side = this.options.team.find((m) => m.key === a.key)
      if (!side) continue
      const moves: AiMove[] = []
      side.mon.moves.forEach((slot, i) => {
        const data = this.options.moves.byId.get(slot.move)
        if (!data || slot.move === 0) return
        moves.push({
          slot: i + 1,
          id: slot.move,
          effect: data.effect,
          power: data.power,
          type: data.type,
          category: data.category,
          accuracy: data.accuracy,
          priority: data.priority,
        })
      })
      out.push({
        index: a.index,
        key: a.key,
        moves,
        mon: {
          species: side.species.id,
          types: side.species.types,
          level: side.mon.level,
          hp: side.mon.hp,
          maxHp: side.mon.hp,
          status: side.mon.status,
          boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
          ability: this.abilityOf(side, true),
          stats: statsOf(side.mon, side.species),
          heldItem: side.mon.heldItem,
          ...this.itemFacts(side.mon.heldItem),
          weightHg: side.species.weightHg,
          gender: genderOf(side.mon.pid, side.species.genderRatio),
          bench: 0,
          volatiles: new Set<string>(),
          side: new Map<string, number>(),
        },
      })
    }
    return out
  }

  /**
   * 쓰러지기 전에 스스로 바꿀 것인가 (`TrainerAI_ShouldSwitch`).
   *
   * 여러 벌이 와도 **첫 벌만 본다** — 원작의 이 갈래는 싱글용이고, 겨눈 자리가
   * 달라도 「지금 이 애로 계속 갈까」의 답은 하나다 (PLAN §7.7.6)
   */
  private wantsSwitch(request: BattleRequest, view: BattleView, at = 0): boolean {
    const turn = this.buildTurns(request, view, at)[0]
    if (!turn) return false
    return shouldSwitch({
      self: turn.self,
      foe: turn.foe,
      moves: turn.moves,
      bench: this.benchOf(this.choices(request, view, at)),
      weather: turn.weather,
      random: this.options.random,
    })
  }

  /**
   * 누구를 내보낼까 (`BattleAI_PostKOSwitchIn`).
   *
   * **여기가 비어 있으면 챔피언이 아무나 내보낸다.** 실제로 그랬다 — 정책의
   * 기본값이 무작위였다
   */
  private pickSwitch(options: BattleAction[], view: BattleView, at = 0): BattleAction {
    const fallback = options[Math.floor(this.options.random() * options.length)] ?? options[0]!
    const foeSeen = activeAt(view, this.foeSide, at) ?? activeAt(view, this.foeSide, 0)
    const foeMon = foeSeen && this.options.foeTeam.find((m) => m.key === foeSeen.key)
    if (!foeSeen || !foeMon) return fallback
    const foe = this.toAiMon(foeMon, foeSeen, view, false)
    const picked = postKoSwitchIn(this.benchOf(options), foe, view.weather)
    if (!picked) return fallback
    return options.find((a) => a.type === 'switch' && a.key === picked.key) ?? fallback
  }

  /** 컨트롤러에 꽂을 정책. 뷰는 매번 바뀌므로 함수로 받는다 */
  policy(view: () => BattleView) {
    return trainerPolicy({
      flags: this.flags,
      random: this.options.random,
      build: (request, at) => this.buildTurns(request, view(), at),
      list: (request, at) => this.choices(request, view(), at),
      wantsSwitch: (request, at) => this.wantsSwitch(request, view(), at),
      chooseSwitch: (options, _request, at) => this.pickSwitch(options, view(), at),
    })
  }
}

