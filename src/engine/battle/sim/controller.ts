// 배틀 진행 (PLAN §7.1~7.2) — "우리가 하나 고르면 한 걸음 나아간다"로 좁힌다.
//
// 밖에서 보이는 배틀은 이것뿐이다: `actions`에서 하나 골라 `choose`에 주면, 그
// 사이에 일어난 일 전부(`events`)와 그 뒤의 화면 상태(`view`)가 돌아온다.
// 상대가 무엇을 골랐는지, 몇 번 오갔는지는 여기서 삼킨다.
//
// **연출은 여기 없다.** 이 클래스는 0ms에 끝나고, 돌려준 이벤트를 몇 초에 걸쳐
// 상영하는 것은 위층(Director) 일이다.
//
// ⚠️ 지연 로딩 경계 (bridge.ts 주석 참고).
import type { BattleAction } from '../choice'
import {
  chooseRandom, encodeAction, legalActions, partySummary, type PartySlot,
} from '../choice'
import type { BattleEvent, BattleRequest, FinalMon, SideId } from '../events'
import type { BagItem, ItemPlan } from '../meta/bagItem'
import { planItemUse } from '../meta/bagItem'
import type { BallId, CatchContext } from '../meta/capture'
import { throwBall } from '../meta/capture'
import { tryEscape } from '../meta/escape'
import { healAmount, type TrainerItems } from '../meta/trainerItems'
import type { Item } from '../../../data/schema'
import type { Status } from '../../pokemon/instance'
import { statsOf } from '../../pokemon/instance'
import { applyEvent, emptyView, type BattleView } from '../view'
import { parseLines } from './protocol'
import { romMove } from './bridge'
import { TrainerBrain, type MoveTable } from './brain'
import {
  BattleSession, IDLE_MOVE, IDLE_MOVE_ID, idleSlotOf, type BattleOptions, type SideMon,
} from './session'

/** 배틀이 어떻게 끝났는가. 승패 말고도 포획·도망이 있다 */
export type BattleFinish = 'win' | 'loss' | 'caught' | 'fled' | null

/** 한 걸음의 결과 */
export interface BattleStep {
  /** 그 사이에 일어난 일 전부. 연출은 이걸 시간축에 편다 */
  events: BattleEvent[]
  view: BattleView
}

/** 상대의 수를 정하는 것. 야생은 무작위, 트레이너는 AI가 들어온다 (PLAN §7.7) */
export type FoePolicy = (request: BattleRequest) => BattleAction | null

export interface ControllerOptions extends BattleOptions {
  /** 안 주면 무작위 — 원작의 야생 포켓몬과 같다 */
  foePolicy?: FoePolicy
  /** 무작위 정책이 쓸 난수. 안 주면 Math.random */
  random?: () => number
  /**
   * 트레이너 AI. 주면 무작위 대신 원작 4세대 AI가 상대의 수를 고른다 (PLAN §7.7).
   *
   * `flags`는 `trainers.json`의 `ai` 바이트 그대로다. `foePolicy`를 같이 주면
   * 그쪽이 이긴다 — 테스트가 정책만 바꿔 끼울 수 있어야 해서다
   */
  ai?: { flags: number; moves: MoveTable }
  /**
   * 시합규칙 「교체」. 상대가 다음 마리를 내보내기 전에 우리도 바꿀지 묻는다.
   *
   * 안 주면 「토너먼트」다 — 안 묻고 그대로 잇는다
   */
  shift?: boolean
  /**
   * 트레이너가 쓰는 도구 (`trainers.json`의 `items`). 야생에는 없다.
   *
   * `bag`이 개수를 들고 있고, `item`은 회복량을 읽는 데 쓴다
   */
  items?: { bag: TrainerItems; item: (id: number) => Item }
}

/** 한 걸음 안에서 sim과 주고받는 횟수의 상한. 넘으면 정책이 못 고르고 있는 것이다 */
const MAX_EXCHANGES = 64

/** 빈 턴 칸이 쓰는 기술의 롬 번호 (`IDLE_MOVE` = 물장구) */
const IDLE_ROM_MOVE = romMove(IDLE_MOVE)
/** 물장구가 그 뒤에 내는 "아무 일도 일어나지 않았다" 줄 */
const IDLE_ACTIVATE = `move: ${IDLE_MOVE}`

export class BattleController {
  private readonly session: BattleSession
  private readonly foePolicy: FoePolicy
  private readonly request: Record<SideId, BattleRequest | null> = { p1: null, p2: null }
  private readonly playerTeam: SideMon[]
  private readonly foeTeam: SideMon[]
  private readonly random: () => number
  private view: BattleView = emptyView()
  private caught: SideMon | null = null
  private fled = false
  /** 도망 시도 횟수. 시도할수록 쉬워진다 */
  private escapeAttempts = 0
  /** 트레이너 AI. 없으면(야생) null이고 상대는 무작위로 둔다 */
  private readonly brain: TrainerBrain | null
  /** 시합규칙 「교체」인가 */
  private readonly shift: boolean
  private readonly items: ControllerOptions['items']
  /**
   * 「교체」 규칙에서 답을 기다리는 중. 상대가 내보내려고 골라 둔 명령이다.
   *
   * 명령을 **미리 받아 두는** 이유는 원작이 "상대는 ○○를 내보내려고 한다"까지
   * 말해 주고 묻기 때문이다 — 무엇이 나올지 모르면 바꿀지 말지 정할 수가 없다
   */
  private asking: { action: BattleAction; key: string } | null = null
  /**
   * 우리가 일부러 비운 턴. 그쪽에서 오는 물장구 한 번을 삼킨다 (`hushIdle`)
   */
  private readonly spent: Record<SideId, boolean> = { p1: false, p2: false }

  private constructor(options: ControllerOptions) {
    // 상대의 빈 턴 칸은 **도구를 들었을 때만** 붙인다. 야생에 붙이면 무작위로
    // 두는 상대가 다섯 칸 중 하나로 물장구를 친다
    this.session = new BattleSession({ ...options, foeIdle: options.items !== undefined })
    this.playerTeam = options.player.team
    this.foeTeam = options.foe.team
    this.random = options.random ?? Math.random
    this.shift = options.shift === true
    this.items = options.items
    this.brain = options.ai
      ? new TrainerBrain({
        flags: options.ai.flags,
        moves: options.ai.moves,
        random: this.random,
        side: 'p2',
        team: this.foeTeam,
        foeTeam: this.playerTeam,
      })
      : null
    const fromBrain = this.brain?.policy(() => this.view)
    this.foePolicy = options.foePolicy ?? fromBrain
      ?? ((r) => chooseRandom(r, this.random, { hiddenSlot: idleSlotOf(r) }))
  }

  /** 배틀을 열고 첫 등판까지 진행한다 */
  static async start(options: ControllerOptions): Promise<{
    controller: BattleController
    step: BattleStep
  }> {
    const controller = new BattleController(options)
    return { controller, step: await controller.advance() }
  }

  /**
   * 지금 우리가 고를 수 있는 것. 비어 있으면 배틀이 끝났거나 아직 준비 전이다.
   *
   * 기술 번호를 여기서 풀어 준다 — 프로토콜은 영어 이름만 주고, 이름을 번호로
   * 되돌릴 수 있는 것은 sim을 아는 이 계층뿐이다
   */
  get actions(): BattleAction[] {
    const actions = legalActions(this.request.p1, { moveId: romMove, hiddenSlot: this.idleSlot })
    return actions.map((a) => (a.type === 'move' ? { ...a, ...this.ppOf(a) } : a))
  }

  /**
   * 파티 여섯 칸의 지금 상태. 교체 화면이 이걸 그린다.
   *
   * 기술 번호를 여기서 풀어 주는 것은 `actions`와 같은 이유다 — 프로토콜은
   * 영어 아이디만 주고, 번호로 되돌릴 수 있는 것은 sim을 아는 이 계층뿐이다
   */
  get party(): PartySlot[] {
    return partySummary(this.request.p1, {
      moveId: romMove,
      hiddenSlot: this.idleSlot,
      // 빈 턴 칸은 **여섯 마리 전원**의 맨 뒤에 붙어 있다 (`choice.hiddenLast`)
      hiddenLast: IDLE_MOVE_ID,
    })
  }

  /**
   * 그 기술 칸의 남은 PP. 요청에 실린 값을 그대로 쓴다.
   *
   * 그래도 되는 것은 `session.syncPp`가 배틀을 열 때 세이브 값으로 맞춰 놓기
   * 때문이다. 그게 없으면 여기 숫자는 포인트업을 다 먹인 sim의 최대치다
   */
  private ppOf(action: BattleAction & { type: 'move' }): { pp?: number; maxPp?: number } {
    const req = this.request.p1?.active?.[0]?.moves[action.slot - 1]
    return req ? { pp: req.pp, maxPp: req.maxpp } : {}
  }

  /**
   * 빈 턴을 쓰는 기술 칸(1부터). 없으면 null.
   *
   * 우리 팀에만 맨 뒤에 붙여 둔 칸이다(`session.ts`의 `IDLE_MOVE`). PP가 다 떨어져
   * 발버둥만 남으면 목록이 한 칸으로 줄어 이 칸이 사라진다 — 그때는 null이다
   */
  private get idleSlot(): number | null {
    return idleSlotOf(this.request.p1)
  }

  /**
   * 볼·도망으로 우리 턴을 비운다. 비울 수 없으면 false.
   *
   * 칸 번호를 요청에서 안 센다 — 발버둥만 남은 자리에서는 요청에 그 칸이 없다.
   * 세션이 개체의 기술 칸을 보고 세운다 (`session.useIdle`)
   */
  private spendTurn(): boolean {
    if (!this.session.useIdle('p1')) return false
    this.spent.p1 = true
    this.request.p1 = null
    return true
  }

  /**
   * 우리가 일부러 버린 턴을 사건 줄기에서 지운다.
   *
   * 빈 턴 칸은 물장구다(`session.ts`의 `IDLE_MOVE`). 볼을 던지거나 트레이너가
   * 도구를 쓰면 그 칸으로 턴을 비우는데, 그대로 두면 화면에 "모부기의 물장구!"와
   * "하지만 아무 일도 일어나지 않았다!"가 뜬다 — 우리가 만든 칸이지 누가 고른
   * 수가 아니다.
   *
   * **진짜 물장구는 안 지운다.** 우리가 보낸 쪽의 것만, 보낸 만큼만 지운다
   */
  private hushIdle(events: readonly BattleEvent[]): BattleEvent[] {
    const out: BattleEvent[] = []
    let tail = false
    for (const e of events) {
      if (e.kind === 'move' && e.move === IDLE_ROM_MOVE && this.spent[e.actor.side]) {
        this.spent[e.actor.side] = false
        tail = true
        continue
      }
      if (tail && e.kind === 'other' && e.cmd === '-activate' && e.args.includes(IDLE_ACTIVATE)) {
        tail = false
        continue
      }
      tail = false
      out.push(e)
    }
    return out
  }

  /**
   * 쓰러져서 교체만 골라야 하는 턴인가.
   *
   * 화면은 이때 명령 메뉴를 통째로 교체 화면으로 바꾼다(`BattleScreen`의 `forced`).
   * 아래의 볼·도망·가방도 같은 자리에서 스스로 물러난다 — **방어선이다**
   */
  get mustSwitch(): boolean {
    return this.request.p1?.forceSwitch?.[0] === true
  }

  /**
   * 지금 우리 턴을 쓸 수 있는가 (볼·도망·가방).
   *
   * ⚠️ **쓰러져 갈아타는 턴에는 못 쓴다.** 그 턴의 요청은 `forceSwitch`라
   * sim이 기술 명령을 거절한다("You need a switch response") — 그런데 우리는
   * 이미 요청을 비워 버린 뒤라, 거절당한 명령의 답이 영영 안 오고 **배틀이 그
   * 자리에 선다.** 담금질에서 두 판이 그렇게 굳었다 (씨앗 1016·1022).
   *
   * 화면이 이미 막고 있지만, 막는 곳이 화면 하나뿐이면 다음 화면에서 또 뚫린다
   */
  get canSpendTurn(): boolean {
    return !this.mustSwitch && this.session.hasIdle('p1')
  }

  get state(): BattleView {
    return this.view
  }

  get ended(): boolean {
    return this.view.ended
  }

  /** 배틀이 끝난 시점의 우리 파티 상태. 세이브에 되돌릴 값이다 */
  results(side: SideId = 'p1'): FinalMon[] {
    return this.session.results(side)
  }

  /**
   * 어떻게 끝났는가. 승패를 이름이 아니라 파티 상태로 판단한다 —
   * `|win|`은 트레이너 이름을 주는데 그건 겹칠 수 있다
   */
  get finish(): BattleFinish {
    if (this.caught) return 'caught'
    if (this.fled) return 'fled'
    if (!this.view.ended) return null
    const mine = this.session.results('p1')
    return mine.length > 0 && mine.every((r) => r.fainted) ? 'loss' : 'win'
  }

  /** 잡은 개체. 포획에 성공했을 때만 있다 */
  get captured(): SideMon | null {
    return this.caught
  }

  /**
   * 볼을 던진다. **우리 턴을 쓴다** — 실패하면 야생이 반격한다.
   *
   * 잡히면 배틀은 그 자리에서 끝난다. sim에는 아무것도 안 보낸다 — 포획은
   * 대전 규칙 밖의 일이라 심판이 알 필요가 없다
   */
  async throwBall(ball: BallId, context: Omit<CatchContext, 'turn' | 'level' | 'types'>)
    : Promise<BattleStep> {
    const foe = this.activeFoe()
    if (!foe || this.view.ended || !this.canSpendTurn) return { events: [], view: this.view }
    const seen = this.view.active.p2a!

    const result = throwBall(
      { hp: seen.hp, maxHp: seen.maxHp, catchRate: foe.species.catchRate, status: seen.status },
      ball,
      { ...context, turn: this.view.turn, level: seen.level, types: foe.species.types },
      this.random,
    )
    const events: BattleEvent[] = [{
      kind: 'ball', actor: { ...seen, name: seen.key }, ball, shakes: result.shakes,
      caught: result.caught,
    }]

    if (result.caught) {
      this.caught = foe
      this.view = { ...this.view, ended: true }
      return { events, view: this.view }
    }
    if (!this.spendTurn()) return { events, view: this.view }
    const step = await this.advance()
    return { events: [...events, ...step.events], view: step.view }
  }

  /**
   * 도망친다. 실패하면 턴을 버린 것이므로 야생이 반격한다.
   *
   * 속도는 랭크 보정을 안 본 실능력치다 — 4세대 공식이 그렇다. 양쪽 개체를
   * 여기서 들고 있으므로 밖에서 어림잡아 넘길 필요가 없다
   */
  async run(): Promise<BattleStep> {
    if (this.view.ended || !this.canSpendTurn) return { events: [], view: this.view }
    const mine = this.speedOf(this.playerTeam, this.view.active.p1a?.key)
    const foe = this.speedOf(this.foeTeam, this.view.active.p2a?.key)
    const success = tryEscape(mine, foe, this.escapeAttempts, this.random)
    this.escapeAttempts++
    const events: BattleEvent[] = [{ kind: 'escape', success }]

    if (success) {
      this.fled = true
      this.view = { ...this.view, ended: true }
      return { events, view: this.view }
    }
    if (!this.spendTurn()) return { events, view: this.view }
    const step = await this.advance()
    return { events: [...events, ...step.events], view: step.view }
  }

  /** 지금 나와 있는 상대. 키로 찾는다 — 같은 종을 둘 데리고 있어도 안 헷갈린다 */
  private activeFoe(): SideMon | null {
    const key = this.view.active.p2a?.key
    return this.foeTeam.find((m) => m.key === key) ?? null
  }

  /** 그 자리에 있는 개체의 실제 스피드. 못 찾으면 1 — 0으로 나누지 않기 위해서다 */
  private speedOf(team: SideMon[], key: string | undefined): number {
    const found = team.find((m) => m.key === key)
    return found ? statsOf(found.mon, found.species).spe : 1
  }

  /** 우리 수를 두고 다음 선택 시점까지 나아간다 */
  async choose(action: BattleAction): Promise<BattleStep> {
    if (this.view.ended) return { events: [], view: this.view }
    this.session.send(`p1 ${encodeAction(action)}`)
    this.request.p1 = null
    return this.advance()
  }

  /**
   * 우리가 다시 고를 게 생기거나 배틀이 끝날 때까지 굴린다.
   *
   * 한 번의 정산으로 안 끝나는 경우가 있다 — 상대가 쓰러지면 그쪽만 교체를 고르는
   * 턴이 오고, 그동안 우리 요청은 `wait`다. 그 왕복을 여기서 다 삼켜야 UI가
   * "가끔 아무것도 못 고르는 상태"를 따로 다루지 않아도 된다
   */
  private async advance(): Promise<BattleStep> {
    const events: BattleEvent[] = []

    for (let i = 0; i < MAX_EXCHANGES; i++) {
      const lines = await this.session.settle()

      const seen = this.hushIdle(parseLines(lines.p1))
      for (const e of seen) {
        if (e.kind === 'request') this.request.p1 = e.request
        else events.push(e)
        this.view = applyEvent(this.view, e)
      }
      // AI가 상황을 읽는 것은 **정책을 묻기 전**이어야 한다. 순서가 바뀌면
      // 방금 드러난 특성을 모르는 채로 이번 수를 고른다
      this.brain?.observe(seen)
      for (const e of parseLines(lines.p2)) {
        if (e.kind === 'request') this.request.p2 = e.request
      }

      if (this.view.ended) break
      // 우리가 고를 게 생겼으면 여기서 멈추고 화면에 넘긴다
      if (legalActions(this.request.p1).length > 0) break

      const foe = this.request.p2
      // 트레이너가 도구를 쓰는 자리. 기술을 고를 수 있는 턴에만 열린다 —
      // 원작도 쓰러져서 갈아타는 턴에는 도구를 안 쓴다
      if (foe && foe.forceSwitch?.[0] !== true) {
        const used = this.useItem(foe)
        if (used) { events.push(used); this.request.p2 = null; continue }
      }
      const action = foe ? this.foePolicy(foe) : null
      if (!action) {
        // 양쪽 다 고를 게 없다. 정산이 아직 안 끝났을 수 있으니 한 틱 더 준다
        if (lines.p1.length === 0 && lines.p2.length === 0) break
        continue
      }
      // 시합규칙 「교체」 — 상대가 새로 내보내려는 참이면 우리도 바꿀지 묻는다
      if (this.shift && action.type === 'switch'
        && foe?.forceSwitch?.[0] === true && this.canShift()) {
        this.asking = { action, key: action.key }
        events.push({ kind: 'shift', key: action.key })
        break
      }
      this.session.send(`p2 ${encodeAction(action)}`)
      this.request.p2 = null
    }

    return { events, view: this.view }
  }

  /**
   * 「교체」에 답할 것이 남아 있는가. 있으면 상대가 내보내려는 마리의 키다.
   *
   * 화면은 이게 null이 아닌 동안 "포켓몬을 교체하겠습니까?"를 띄운다
   */
  get shiftAsk(): string | null {
    return this.asking?.key ?? null
  }

  /**
   * 「교체」에 답한다. `true`면 우리도 한 마리 바꾼다 — **턴을 안 쓴다**.
   *
   * 바꾸겠다고 하면 그 다음에 오는 것은 "누구를 내보낼까"다. 양쪽이 같은 묶음에서
   * 고르므로, 답한 뒤 화면에는 강제 교체와 같은 목록이 뜬다
   */
  async answerShift(change: boolean): Promise<BattleStep> {
    const ask = this.asking
    if (!ask) return { events: [], view: this.view }
    this.asking = null
    if (change) this.session.freeSwitch('p1')
    this.session.send(`p2 ${encodeAction(ask.action)}`)
    this.request.p2 = null
    return this.advance()
  }

  /** 우리 쪽이 지금 공짜로 바꿀 수 있는가 — 서 있는 애가 멀쩡하고 벤치가 남았을 때 */
  private canShift(): boolean {
    const key = this.view.active.p1a?.key
    if (key === undefined) return false
    const mine = this.session.results('p1')
    const active = mine.find((r) => r.key === key)
    if (!active || active.fainted) return false
    return mine.some((r) => r.key !== key && !r.fainted)
  }

  /**
   * 트레이너가 도구를 쓴다. 썼으면 사건을 돌려주고 그쪽 턴을 비운다.
   *
   * 체력은 **sim의 실제 값**을 본다. `view`의 상대 체력은 백분율이라(프로토콜이
   * 그렇게 준다) "상처약 20칸"과 비교할 수 있는 눈금이 아니다
   */
  private useItem(request: BattleRequest): BattleEvent | null {
    const kit = this.items
    const seen = this.view.active.p2a
    if (!kit || kit.bag.left === 0 || !seen) return null
    // 쓰러져서 갈아타는 턴에는 안 쓴다 — 부르는 쪽이 이미 걸렀다
    if (request.forceSwitch?.[0] === true) return null
    // 턴을 비울 칸이 없으면 도구도 못 쓴다. **먹이기 전에** 본다 — 먹여 놓고
    // 턴을 못 비우면 그 도구가 공짜가 된다
    if (!this.session.hasIdle('p2')) return null

    const team = this.session.results('p2')
    const real = team.find((r) => r.key === seen.key)
    if (!real || real.fainted) return null
    const target = {
      hp: real.hp,
      maxHp: real.maxHp,
      status: real.status,
      confused: seen.volatiles.has('confusion'),
    }
    const use = kit.bag.decide(target, team.filter((r) => !r.fainted).length)
    if (!use) return null

    // 무엇을 쓸지는 원작 AI(`TrainerItems.decide`)가 정하고, **먹이는 문은 우리와
    // 같다**. 그쪽은 언제나 나와 있는 한 마리에게 쓰므로 계획도 그만큼만 채운다
    const item = kit.item(use.item)
    const cured: Status[] = use.kind === 'hp' || real.status === 'ok' ? [] : [real.status]
    this.session.applyPlan('p2', seen.key, {
      heal: healAmount(use, target, item),
      revive: false,
      cure: cured,
      clear: use.kind === 'hp' ? [] : ['confusion'],
      mist: false,
      boosts: [],
      focusEnergy: false,
      pp: [],
    })
    // 턴을 비울 칸이 없으면 도구도 못 쓴다 — 그런 자리는 없지만 방어선이다
    if (!this.session.useIdle('p2')) return null
    this.spent.p2 = true
    return { kind: 'trainerItem', key: seen.key, item: use.item }
  }

  /**
   * 우리 가방에서 도구를 쓴다. **우리 턴을 쓴다** — 원작도 도구는 한 수다.
   *
   * `key`는 먹일 마리(벤치도 된다), `moveSlot`은 PP 도구가 채울 칸(0부터).
   * 아무 일도 안 일어날 도구면 **턴을 안 쓰고** 빈 걸음을 돌려준다 — 원작도
   * "효과가 없을 것 같다"를 띄우고 파티 화면으로 되돌린다. 화면은 그 전에
   * `planFor`로 미리 잠그므로 여기까지 오는 것은 방어선이다
   */
  async useBagItem(item: BagItem, key: string, moveSlot?: number): Promise<BattleStep> {
    if (this.view.ended || !this.canSpendTurn) return { events: [], view: this.view }
    const plan = this.planFor(item.data, key, moveSlot)
    if (!plan) return { events: [], view: this.view }

    const events: BattleEvent[] = [{ kind: 'bagItem', key, item: item.id }]
    this.session.applyPlan('p1', key, plan)
    if (!this.spendTurn()) return { events, view: this.view }
    const step = await this.advance()
    return { events: [...events, ...step.events], view: step.view }
  }

  /**
   * 이 도구를 이 마리에게 쓰면 무슨 일이 일어나는가. 아무 일도 없으면 null.
   *
   * 화면이 대상 칸을 잠그는 데 쓰고 `useBagItem`이 실제로 쓸 때 다시 부른다.
   * 둘이 **같은 함수**를 봐야 "고를 수 있는데 아무 일도 안 일어나는" 칸이 안 생긴다
   */
  planFor(item: Item, key: string, moveSlot?: number): ItemPlan | null {
    const real = this.session.results('p1').find((r) => r.key === key)
    if (!real) return null
    const seen = this.view.active.p1a
    const out = seen?.key === key
    return planItemUse(item, {
      hp: real.hp,
      maxHp: real.maxHp,
      status: real.status,
      fainted: real.fainted,
      active: out,
      confused: out && (seen?.volatiles.has('confusion') ?? false),
      attracted: out && (seen?.volatiles.has('attract') ?? false),
      boosts: out && seen ? seen.boosts : {},
      focusEnergy: out && (seen?.volatiles.has('focusenergy') ?? false),
      embargo: out && (seen?.volatiles.has('embargo') ?? false),
      mist: (this.view.sideConditions.p1.get('mist') ?? 0) > 0,
      moves: this.session.moveSlots('p1', key),
    }, moveSlot)
  }

  /** 우리 쪽 한 마리의 기술 칸과 남은 PP. PP 도구가 어느 칸을 채울지 고르는 데 쓴다 */
  moveSlotsOf(key: string): { move: number | null; pp: number; maxPp: number }[] {
    return this.session.moveSlots('p1', key)
  }

  /**
   * 삐삐인형·에나비꼬리. 야생전에서 **반드시** 도망친다.
   *
   * 도망 판정을 안 거친다 — `subscript_escape_item`이 곧바로
   * `BATTLE_RESULT_PLAYER_FLED`를 세운다. 트레이너전에서는 애초에 못 쓴다
   * (`battle_bag.c`가 "지금은 그럴 때가 아니다"로 막는다)
   */
  useEscapeItem(item: BagItem): BattleStep {
    if (this.view.ended || this.mustSwitch) return { events: [], view: this.view }
    const key = this.view.active.p1a?.key ?? ''
    this.fled = true
    this.view = { ...this.view, ended: true }
    return {
      events: [{ kind: 'bagItem', key, item: item.id }, { kind: 'escape', success: true }],
      view: this.view,
    }
  }

  destroy(): void {
    this.session.destroy()
  }
}
