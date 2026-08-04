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
import { chooseRandom, encodeAction, legalActions } from '../choice'
import type { BattleEvent, BattleRequest, FinalMon, SideId } from '../events'
import type { BallId, CatchContext } from '../meta/capture'
import { throwBall } from '../meta/capture'
import { tryEscape } from '../meta/escape'
import { statsOf } from '../../pokemon/instance'
import { applyEvent, emptyView, type BattleView } from '../view'
import { parseLines } from './protocol'
import { romMove } from './bridge'
import { BattleSession, IDLE_MOVE_ID, type BattleOptions, type SideMon } from './session'

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
}

/** 한 걸음 안에서 sim과 주고받는 횟수의 상한. 넘으면 정책이 못 고르고 있는 것이다 */
const MAX_EXCHANGES = 64

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

  private constructor(options: ControllerOptions) {
    this.session = new BattleSession(options)
    this.playerTeam = options.player.team
    this.foeTeam = options.foe.team
    this.random = options.random ?? Math.random
    this.foePolicy = options.foePolicy ?? ((r) => chooseRandom(r, this.random))
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
    return legalActions(this.request.p1, { moveId: romMove, hiddenSlot: this.idleSlot })
  }

  /**
   * 빈 턴을 쓰는 기술 칸(1부터). 없으면 null.
   *
   * 우리 팀에만 맨 뒤에 붙여 둔 칸이다(`session.ts`의 `IDLE_MOVE`). PP가 다 떨어져
   * 발버둥만 남으면 목록이 한 칸으로 줄어 이 칸이 사라진다 — 그때는 null이다
   */
  private get idleSlot(): number | null {
    const moves = this.request.p1?.active?.[0]?.moves
    if (!moves || moves.length < 2) return null
    return moves[moves.length - 1]!.id === IDLE_MOVE_ID ? moves.length : null
  }

  /** 볼·도망으로 우리 턴을 비운다. 비울 수 없으면 false */
  private spendTurn(): boolean {
    const slot = this.idleSlot
    if (slot === null) return false
    this.session.send(`p1 move ${slot}`)
    this.request.p1 = null
    return true
  }

  /** 쓰러져서 교체만 골라야 하는 턴인가. UI가 "도망" 버튼을 막는 데 쓴다 */
  get mustSwitch(): boolean {
    return this.request.p1?.forceSwitch?.[0] === true
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
    if (!foe || this.view.ended) return { events: [], view: this.view }
    const seen = this.view.active.p2!

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
    if (this.view.ended) return { events: [], view: this.view }
    const mine = this.speedOf(this.playerTeam, this.view.active.p1?.key)
    const foe = this.speedOf(this.foeTeam, this.view.active.p2?.key)
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
    const key = this.view.active.p2?.key
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

      for (const e of parseLines(lines.p1)) {
        if (e.kind === 'request') this.request.p1 = e.request
        else events.push(e)
        this.view = applyEvent(this.view, e)
      }
      for (const e of parseLines(lines.p2)) {
        if (e.kind === 'request') this.request.p2 = e.request
      }

      if (this.view.ended) break
      // 우리가 고를 게 생겼으면 여기서 멈추고 화면에 넘긴다
      if (legalActions(this.request.p1).length > 0) break

      const foe = this.request.p2
      const action = foe ? this.foePolicy(foe) : null
      if (!action) {
        // 양쪽 다 고를 게 없다. 정산이 아직 안 끝났을 수 있으니 한 틱 더 준다
        if (lines.p1.length === 0 && lines.p2.length === 0) break
        continue
      }
      this.session.send(`p2 ${encodeAction(action)}`)
      this.request.p2 = null
    }

    return { events, view: this.view }
  }

  destroy(): void {
    this.session.destroy()
  }
}
