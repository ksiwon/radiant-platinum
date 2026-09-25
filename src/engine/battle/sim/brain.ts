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
import type { AiDoubles, AiMon, AiMove, AiTurn } from '../ai/context'
import type { BattleAction } from '../choice'
import { legalActions, TARGET_FOE_A, TARGET_FOE_B } from '../choice'
import type { BattleEvent, BattleRequest, SideId, SlotId } from '../events'
import { trainerPolicy } from '../ai/policy'
import { AI_FLAG, BDSP_TOP_FLAGS } from '../ai/score'
import { ABILITY } from '../ai/rom'
import { speedRank, type SpeedMon } from '../ai/speed'
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

/** 나오자마자 스스로 알리는 트랩 특성 — AI가 진짜 값을 읽는다 (`trainer_ai.c` 1182) */
const TRAP_ABILITIES: ReadonlySet<number> = new Set([
  ABILITY.SHADOW_TAG, ABILITY.MAGNET_PULL, ABILITY.ARENA_TRAP,
])

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
  /**
   * AI가 조종하는 쪽. 상대 트레이너는 p2, **편**은 p1이다 (PARITY §2.2b) —
   * 원작도 편 자리(`BATTLER_TYPE_PLAYER_SIDE_SLOT_2`)에 같은 트레이너 AI를 물린다
   */
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
  /**
   * 같은 쪽에 선 마리 **전부** (짝 트레이너의 파티까지). 안 주면 `team`이다.
   *
   * TAG_STRATEGY가 짝(`AI_BATTLER_ATTACKER_PARTNER`)의 타입·특성·기술을 본다 —
   * 짝이 다른 트레이너의 마리여도 원작은 `battleMons`를 그대로 읽는다
   */
  sideTeam?: SideMon[]
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
    // ⚠️ **더블이면 TAG_STRATEGY를 원작이 얹는다** — 자료와 무관하다
    // (`TrainerAI_Init` · `trainer_ai.c` 252). 928명 중 아무도 이 비트를 안 갖고 있다
    this.flags = options.flags | (options.floor ?? BDSP_TOP_FLAGS)
      | (options.doubles === true ? AI_FLAG.TAG_STRATEGY : 0)
  }

  /** 실제로 쓰는 AI 비트. 시험이 편·상대의 비트를 재는 데 쓴다 */
  get thinkingMask(): number {
    return this.flags
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
    const real = abilitySlotOf(mon.mon.pid) === 1 && b ? b : a
    if (mine) return real
    const known = this.revealed.get(mon.key)
    if (known) return known
    // 그림자밟기·자력·개미지옥은 나오자마자 스스로 알린다 — 원작이 진짜 값을 읽는다
    // (`LoadBattlerAbility` · `trainer_ai.c` 1182)
    if (TRAP_ABILITIES.has(real)) return real
    if (a && b) return this.options.random() < 0.5 ? a : b
    return a || b
  }

  /**
   * `CheckBattlerAbility`가 맞는 쪽을 읽는 법 (`trainer_ai.c` 1212). 찍지 않는다 —
   * 드러났으면 그 값, 트랩 특성이면 진짜 값, 후보가 둘이면 **찾는 것이 후보에 있을 때
   * 「모름」**(`AI_UNKNOWN` — 참이 아니다)이고 없으면 첫 후보다
   */
  private abilityCheck(mon: SideMon): (expected: number) => boolean {
    return (expected) => {
      const known = this.revealed.get(mon.key)
      if (known) return known === expected
      const [a, b] = mon.species.abilities
      const real = abilitySlotOf(mon.mon.pid) === 1 && b ? b : a
      if (TRAP_ABILITIES.has(real)) return real === expected
      if (a && b) return a !== expected && b !== expected ? a === expected : false
      return (a || b) === expected
    }
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
    const team = mine
      ? (this.options.team.some((m) => m.key === mon.key) ? this.options.team : this.side)
      : this.options.foeTeam
    return {
      ...(mine ? {} : { hasAbility: this.abilityCheck(mon) }),
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

  /** 같은 쪽 마리 전부 (`BrainOptions.sideTeam`) */
  private get side(): SideMon[] {
    return this.options.sideTeam ?? this.options.team
  }

  /**
   * 지금 상황. 기술을 못 고르는 턴이면 빈 배열.
   *
   * ⚠️ **더블은 여러 벌이 나온다.** 원작은 겨눌 수 있는 자리마다 점수를 따로
   * 매긴다(`TrainerAI_MainDoubles`) — 상대 둘과 **제 짝**까지 셋이다. 벌마다 기술 네
   * 칸을 다 매기고, 그 자리에 선 마리를 `foe`로 삼는다 (`buildDoubles`). 싱글은 늘
   * 한 벌이다
   */
  buildTurns(request: BattleRequest, view: BattleView, at = 0): AiTurn[] {
    const mySeen = activeAt(view, this.options.side, at)
    if (!mySeen) return []
    const me = this.options.team.find((m) => m.key === mySeen.key)
    if (!me) return []
    if (this.options.doubles === true) return this.buildDoubles(request, view, at, me, mySeen)

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
   * 더블의 벌들 (`TrainerAI_MainDoubles` · `trainer_ai.c` 356).
   *
   * 겨눌 자리는 **나를 뺀 서 있는 셋**이다 — 체력이 0인 자리는 건너뛴다. 벌마다 기술
   * 칸은 한 번씩만 나온다(대상을 찍는 기술도 겨눈 자리는 벌이 정한다). 고른 (칸, 자리)를
   * 명령으로 되돌리는 것은 `ai/policy`다
   */
  private buildDoubles(
    request: BattleRequest, view: BattleView, at: number, me: SideMon, mySeen: ViewMon,
  ): AiTurn[] {
    const bySlot = new Map<number, BattleAction>()
    for (const a of this.choices(request, view, at)) {
      if (a.type === 'move' && !bySlot.has(a.slot)) bySlot.set(a.slot, a)
    }
    const moves = this.toAiMoves([...bySlot.values()])?.map(({ target: _t, ...m }) => m)
    if (!moves || moves.length === 0) return []

    const self = this.toAiMon(me, mySeen, view, true)
    const allySeen = activeAt(view, this.options.side, at === 0 ? 1 : 0)
    const allyMon = allySeen ? this.side.find((m) => m.key === allySeen.key) : undefined
    // 짝은 **같은 편이라 진짜 값**이다. 쓰러진 채로 자리에 남았으면 체력 0으로 읽는다
    // — 원작도 그 자리의 `battleMons`를 그대로 본다
    const ally = allySeen && allyMon ? this.toAiMon(allyMon, allySeen, view, true) : null
    const allyMoves = allyMon ? this.movesOf(allyMon) : []
    const speed = this.speedMons(view)
    const mySlot = (this.options.side === 'p1' ? 0 : 1) + at * 2
    const rank = (who: 'self' | 'ally'): number => speedRank(
      speed, who === 'self' ? mySlot : mySlot ^ 2,
      { weather: view.weather, trickRoom: view.field.has('trickroom') }, this.options.random,
    )

    const out: AiTurn[] = []
    const add = (
      target: number, defSeen: ViewMon | null, defMon: SideMon | undefined,
      foeAlly: AiMon | null, targetIsAlly: boolean,
    ): void => {
      if (!defSeen || defSeen.fainted || defSeen.hp <= 0 || !defMon) return
      const doubles: AiDoubles = {
        targetIsAlly,
        target,
        defenderOnPlayerSide: targetIsAlly === (this.options.side === 'p1'),
        ally,
        allyMoves,
        foeAlly,
        speedRank: rank,
      }
      out.push({
        self,
        // 짝을 겨눈 벌에서도 맞는 쪽 자리로 읽는다 — 특성은 `LoadBattlerAbility
        // AI_BATTLER_DEFENDER`의 규칙(드러났거나 찍은 값)이다
        foe: this.toAiMon(defMon, defSeen, view, false),
        moves,
        all: moves,
        weather: view.weather,
        field: view.field,
        turn: this.turnsOut(mySeen.key),
        foeKnownMoves: this.foeMoves,
        foeLastMoveCategory: this.foeLast?.category ?? null,
        protectChain: this.protectChain,
        random: this.options.random,
        doubles,
      })
    }
    const foeAt = (i: number) => {
      const seen = activeAt(view, this.foeSide, i)
      const mon = seen ? this.options.foeTeam.find((m) => m.key === seen.key) : undefined
      return { seen, mon, ai: seen && mon ? this.toAiMon(mon, seen, view, false) : null }
    }
    const fa = foeAt(0)
    const fb = foeAt(1)
    add(TARGET_FOE_A, fa.seen, fa.mon, fb.ai, false)
    add(TARGET_FOE_B, fb.seen, fb.mon, fa.ai, false)
    // 짝을 겨눈 벌의 「맞는 쪽의 짝」은 나 자신이다 (`defender ^ 2`)
    add(at === 0 ? -2 : -1, allySeen, allyMon, self, true)
    return out
  }

  /** 한 마리의 기술 칸 전부. PP와 무관하다 — 원작이 `battleMons.moves`를 본다 */
  private movesOf(mon: SideMon): AiMove[] {
    const out: AiMove[] = []
    mon.mon.moves.forEach((slot, i) => {
      const data = this.options.moves.byId.get(slot.move)
      if (!data || slot.move === 0) return
      out.push({
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
    return out
  }

  /**
   * 네 자리의 스피드 재료. 전투원 번호 차례다 — 0 p1a · 1 p2a · 2 p1b · 3 p2b
   * (`battle_main.c` 964). 전부 진짜 값이다 — 원작의 비교 함수가 `battleMons`를 본다
   */
  private speedMons(view: BattleView): (SpeedMon | null)[] {
    const slots: SlotId[] = ['p1a', 'p2a', 'p1b', 'p2b']
    const everyone = [...this.side, ...this.options.foeTeam, ...this.options.team]
    return slots.map((slot) => {
      const seen = view.active[slot]
      const mon = seen ? everyone.find((m) => m.key === seen.key) : undefined
      if (!seen || !mon) return null
      const ability = this.abilityOf(mon, true)
      const item = this.itemFacts(mon.mon.heldItem)
      return {
        speed: statsOf(mon.mon, mon.species).spe,
        stage: seen.boosts.spe,
        ability: seen.volatiles.has('gastroacid') ? ABILITY.NONE : ability,
        itemEffect: item.itemEffect,
        itemParam: item.itemParam,
        species: mon.species.id,
        status: seen.status,
        hp: seen.fainted ? 0 : seen.hp,
        maxHp: seen.maxHp,
        tailwind: view.sideConditions[seen.side].has('tailwind'),
        slowStart: this.turnsOut(mon.key) < 5,
        itemNegated: ability === ABILITY.KLUTZ || seen.volatiles.has('embargo'),
      }
    })
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
   * **짝을 겨누는 후보는 남긴다.** 원작도 짝을 후보로 놓고 점수를 매긴다
   * (`TrainerAI_MainDoubles`). 짝을 겨눈 벌에는 TAG_STRATEGY만 돌아서 쓸 이유가 없는
   * 수는 −30을 받고, 그 벌의 최고점이 100 미만이면 −1로 내려 고르지 않는다
   * (`ai/tagStrategy` · `ai/policy.pickDoubles`)
   */
  private choices(request: BattleRequest, view: BattleView, at = 0): BattleAction[] {
    const base = { hiddenSlot: idleSlotOf(request, at), at }
    if (this.options.doubles !== true) return legalActions(request, base)
    return this.ownBench(legalActions(request, {
      ...base,
      doubles: true,
      foeAlive: this.aliveOn(view, this.foeSide),
      allyAlive: this.aliveOn(view, this.options.side)[at === 0 ? 1 : 0],
      // 짝을 겨누는 후보도 남긴다 — 짝을 겨눈 벌은 TAG_STRATEGY가 따로 매긴다
      allyTargets: true,
    }))
  }

  /**
   * 교체 후보를 **제 파티**로 거른다 (PARITY §2.2b).
   *
   * 한 쪽에 트레이너가 둘이면(태그 배틀·편) 요청의 벤치에 짝의 마리도 실려
   * 온다. 원작의 AI는 제 전투원의 파티만 본다 (`TrainerAI_PickSwitchIn`이
   * `BattleSystem_GetParty(battleSys, battler)`를 돈다) — 트레이너가 하나인
   * 쪽은 `team`이 쪽 전체라 아무것도 안 빠진다
   */
  private ownBench(actions: BattleAction[]): BattleAction[] {
    return actions.filter((a) => a.type !== 'switch'
      || this.options.team.some((m) => m.key === a.key))
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

