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
import { applyEvent, emptyView, type BattleView } from '../view'
import { parseLines } from './protocol'
import { romMove } from './bridge'
import { BattleSession, type BattleOptions } from './session'

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
  private view: BattleView = emptyView()

  private constructor(options: ControllerOptions) {
    this.session = new BattleSession(options)
    const random = options.random ?? Math.random
    this.foePolicy = options.foePolicy ?? ((r) => chooseRandom(r, random))
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
    return legalActions(this.request.p1, romMove)
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
