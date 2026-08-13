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
  chooseRandom, encodeAction, encodeTurn, legalActions, partySummary, type PartySlot,
} from '../choice'
import type { BattleEvent, BattleRequest, FinalMon, SideId } from '../events'
import type { BagItem, ItemPlan } from '../meta/bagItem'
import { planItemUse } from '../meta/bagItem'
import type { BallId, CatchContext } from '../meta/capture'
import { throwBall } from '../meta/capture'
import { tryEscape } from '../meta/escape'
import { healAmount, type TrainerItems } from '../meta/trainerItems'
import {
  badgeCount, checkObedience, damageVariance, idleFlavor, selfHitDamage,
} from '../meta/obedience'
import type { Item } from '../../../data/schema'
import type { Status } from '../../pokemon/instance'
import { statsOf } from '../../pokemon/instance'
import { isOriginalTrainer, type TrainerIdentity } from '../../pokemon/origin'
import { boosted } from '../ai/context'
import { activeAt, applyEvent, emptyView, slotOfKey, type BattleView } from '../view'
import { parseLines } from './protocol'
import { romMove } from './bridge'
import { TrainerBrain, type MoveTable } from './brain'
import {
  BattleSession, IDLE_MOVE, IDLE_MOVE_ID, idleSlotOf, type BattleOptions, type SideMon,
} from './session'

/** 배틀이 어떻게 끝났는가. 승패 말고도 포획·도망이 있다 */
export type BattleFinish = 'win' | 'loss' | 'caught' | 'fled' | 'foeFled' | null

/** 한 걸음의 결과 */
export interface BattleStep {
  /** 그 사이에 일어난 일 전부. 연출은 이걸 시간축에 편다 */
  events: BattleEvent[]
  view: BattleView
}

/** 상대의 수를 정하는 것. 야생은 무작위, 트레이너는 AI가 들어온다 (PLAN §7.7) */
export type FoePolicy = (request: BattleRequest, at?: number) => BattleAction | null

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
   * 배회 포켓몬과의 판 (PARITY §6.3) — `BATTLE_TYPE_ROAMER`.
   *
   * 묶어 두지 않으면 상대가 **무엇을 하기도 전에** 달아난다
   */
  roamer?: boolean
  /**
   * 트레이너가 쓰는 도구 (`trainers.json`의 `items`). 야생에는 없다.
   *
   * `bag`이 개수를 들고 있고, `item`은 회복량을 읽는 데 쓴다
   */
  items?: { bag: TrainerItems; item: (id: number) => Item }
  /**
   * 말 안 듣기 (PARITY §2.18). 안 주면 **전부 잘 듣는다** — 시험이 그렇게 쓴다.
   *
   * 뱃지 수와 지금 리포트의 주인이 필요하다. 개체 쪽 정보(레벨·원래 트레이너)는
   * `player.team`에 이미 실려 있다
   */
  obedience?: { badges: number; trainer: TrainerIdentity }
}

/**
 * 명령을 내야 하는 자리 번호들 (`chooseSlots`).
 *
 * 강제 교체 턴에는 자리 전부다 — 안 쓰러진 자리는 `pass`를 보낸다.
 * 기술을 고르는 턴에는 **서 있는 자리만**이다
 */
function chooseSlotsFor(
  request: BattleRequest | null, alive: readonly boolean[], doubles: boolean,
): number[] {
  if (!request || request.wait) return []
  if (request.forceSwitch) return request.forceSwitch.map((_, i) => i)
  const count = request.active?.length ?? 1
  const all = Array.from({ length: count }, (_, i) => i)
  return doubles ? all.filter((i) => alive[i]) : all
}

/** 한 걸음 안에서 sim과 주고받는 횟수의 상한. 넘으면 정책이 못 고르고 있는 것이다 */
const MAX_EXCHANGES = 64

/** 빈 턴 칸이 쓰는 기술의 롬 번호 (`IDLE_MOVE` = 물장구) */
const IDLE_ROM_MOVE = romMove(IDLE_MOVE)
/** 물장구가 그 뒤에 내는 "아무 일도 일어나지 않았다" 줄 */
const IDLE_ACTIVATE = `move: ${IDLE_MOVE}`

// 말 안 듣기가 따로 보는 기술·특성 (`generated/moves.txt` · `abilities.txt`)
/** 코골기 — 자고 있어야 나가므로 다른 기술로 못 바꾼다 */
const MOVE_SNORE = 173
/** 잠꼬대 — 같은 이유다 */
const MOVE_SLEEP_TALK = 214
/** 불면 */
const ABILITY_INSOMNIA = 15
/** 의욕 */
const ABILITY_VITAL_SPIRIT = 72

export class BattleController {
  private readonly session: BattleSession
  private readonly foePolicy: FoePolicy
  private readonly request: Record<SideId, BattleRequest | null> = { p1: null, p2: null }
  private readonly playerTeam: SideMon[]
  private readonly foeTeam: SideMon[]
  private readonly random: () => number
  private view: BattleView = emptyView()
  private caught: SideMon | null = null
  /**
   * 어느 볼로 잡았는가.
   *
   * ⚠️ 잡은 개체만 들고 있으면 **볼이 몬스터볼로 굳는다** — 럭셔리볼의 친밀도
   * 보정과 힐볼의 회복이 개체의 `ball`을 보고 갈리므로, 던진 것을 그대로 적어야 한다
   */
  private caughtBall: BallId | null = null
  private fled = false
  /** 도망 시도 횟수. 시도할수록 쉬워진다 */
  private escapeAttempts = 0
  /** 트레이너 AI. 없으면(야생) null이고 상대는 무작위로 둔다 */
  private readonly brain: TrainerBrain | null
  /** 시합규칙 「교체」인가 */
  private readonly shift: boolean
  /**
   * 배회 포켓몬과의 판인가 (PARITY §6.3).
   *
   * 원작은 이 판에만 다른 AI를 물린다 (`AI_FLAG_ROAMING_POKEMON`) — 그 AI가
   * 하는 일은 **딱 하나, 도망**이다. 묶여 있지 않으면 다른 후보를 다 제치고
   * 달아난다
   */
  private readonly roamer: boolean
  /** 상대가 달아나서 끝났는가. 이겼다고 말하면 안 되는 자리다 */
  private foeFled = false
  private readonly items: ControllerOptions['items']
  /** 말 안 듣기 (PARITY §2.18). 없으면 전부 잘 듣는다 */
  private readonly obedience: ControllerOptions['obedience']
  /** 더블인가 (PARITY §2.2). 자리 수가 이 값 하나에서 갈린다 */
  private readonly doubles: boolean
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
    this.doubles = options.doubles === true
    this.view = emptyView(this.doubles)
    this.playerTeam = options.player.team
    this.foeTeam = options.foe.team
    this.random = options.random ?? Math.random
    this.shift = options.shift === true
    this.roamer = options.roamer === true
    this.items = options.items
    this.obedience = options.obedience
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
      ?? ((r, at = 0) => chooseRandom(r, this.random, {
        hiddenSlot: idleSlotOf(r, at), at, doubles: this.doubles,
      }))
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
    return this.actionsAt(0)
  }

  /**
   * 그 자리에서 고를 수 있는 것 (PARITY §2.2).
   *
   * 싱글은 `at = 0`만 쓴다. 더블은 화면이 자리마다 한 번씩 물어보고
   * 모은 것을 `chooseTurn`에 한꺼번에 준다
   */
  actionsAt(at: number, taken: readonly number[] = []): BattleAction[] {
    const actions = legalActions(this.request.p1, {
      moveId: romMove,
      hiddenSlot: idleSlotOf(this.request.p1, at),
      at,
      doubles: this.doubles,
      foeAlive: this.aliveOn('p2'),
      allyAlive: this.aliveOn('p1')[at === 0 ? 1 : 0],
    }).filter((a) => a.type !== 'switch' || !taken.includes(a.index))
    // ⚠️ **벤치가 모자라면 남는 자리는 `pass`다.** 둘이 같이 쓰러졌는데 벤치에
    // 한 마리뿐이면 앞 자리가 그 하나를 데려가고 뒤 자리는 고를 것이 없다 —
    // 명령을 하나만 보내면 sim이 「Incomplete choice … missing other pokemon」으로
    // 거절하고 배틀이 굳는다. 담금질 씨앗 3의 12턴째가 그 자리였다
    if (actions.length === 0 && this.request.p1?.forceSwitch) return [{ type: 'pass', at }]
    return actions.map((a) => (a.type === 'move' ? { ...a, ...this.ppOf(a) } : a))
  }

  /** 이번 턴에 명령을 내야 하는 자리 수. 싱글은 1 */
  get slotCount(): number {
    return this.chooseSlots.length
  }

  /**
   * 이번 턴에 **명령을 내야 하는** 자리 번호들.
   *
   * ⚠️ **쓰러진 자리는 빠진다.** 벤치가 남아 있으면 sim이 강제 교체를 주지만,
   * 다 떨어졌으면 그 자리는 쓰러진 채로 남는다 — 그때 명령을 하나 더 보내면
   * sim이 「You sent more choices than unfainted Pokémon」으로 거절하고,
   * 우리는 이미 요청을 비운 뒤라 **배틀이 그 자리에 선다.**
   * 담금질 씨앗 23의 7턴째가 그 자리였다
   */
  get chooseSlots(): number[] {
    return chooseSlotsFor(this.request.p1, this.aliveOn('p1'), this.doubles)
  }

  /** 그 쪽 두 자리에 멀쩡한 마리가 서 있는가 */
  private aliveOn(side: SideId): [boolean, boolean] {
    return [0, 1].map((at) => {
      const mon = activeAt(this.view, side, at)
      return mon !== null && !mon.fainted
    }) as [boolean, boolean]
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
    const req = this.request.p1?.active?.[action.at ?? 0]?.moves[action.slot - 1]
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

  /** 이 자리가 쓰러져서 교체만 골라야 하는가 */
  mustSwitchAt(at: number): boolean {
    return this.request.p1?.forceSwitch?.[at] === true
  }

  /**
   * 볼·도망으로 우리 턴을 비운다. 비울 수 없으면 false.
   *
   * 칸 번호를 요청에서 안 센다 — 발버둥만 남은 자리에서는 요청에 그 칸이 없다.
   * 세션이 개체의 기술 칸을 보고 세운다 (`session.useIdle`)
   */
  private spendTurn(at = 0): boolean {
    if (!this.session.useIdle('p1', at)) return false
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
    return this.request.p1?.forceSwitch?.some((f) => f) === true
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
    return this.canSpendAt(0)
  }

  /** 그 자리가 지금 턴을 도구·볼·도망으로 쓸 수 있는가 */
  canSpendAt(at: number): boolean {
    return !this.mustSwitchAt(at) && this.session.hasIdle('p1', at)
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
    // 상대가 달아난 판은 이긴 판이 아니다. 경험치도 상금도 없다
    if (this.foeFled) return 'foeFled'
    if (!this.view.ended) return null
    const mine = this.session.results('p1')
    return mine.length > 0 && mine.every((r) => r.fainted) ? 'loss' : 'win'
  }

  /** 잡은 개체. 포획에 성공했을 때만 있다 */
  get captured(): SideMon | null {
    return this.caught
  }

  /** 잡을 때 던진 볼의 도구 번호 */
  get capturedBall(): BallId | null {
    return this.caughtBall
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
    // ⚠️ **더블에서는 볼도 도망도 없다.** 우리 더블은 트레이너전뿐이고
    // (`trainers.json`의 28명), 원작도 트레이너전에서 둘 다 막는다
    if (!foe || this.view.ended || this.doubles || !this.canSpendTurn) {
      return { events: [], view: this.view }
    }
    const seen = activeAt(this.view, 'p2')!

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
      this.caughtBall = ball
      this.view = { ...this.view, ended: true }
      return { events, view: this.view }
    }
    // ⚠️ **볼이 빗나가면 배회는 그 자리에서 달아난다.** 볼 한 번이 한 판의
    // 전부라는 것이 배회를 쫓는 놀이의 규칙이다 (PARITY §6.3)
    const gone = this.roamerFlees()
    if (gone) return { events: [...events, ...gone.events], view: gone.view }
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
    if (this.view.ended || this.doubles || !this.canSpendTurn) {
      return { events: [], view: this.view }
    }
    const mine = this.speedOf(this.playerTeam, activeAt(this.view, 'p1')?.key)
    const foe = this.speedOf(this.foeTeam, activeAt(this.view, 'p2')?.key)
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

  /**
   * 배회가 이 자리에서 달아나는가 (`RoamingPokemon_Main`).
   *
   * ⚠️ **우리 명령보다 먼저 일어난다.** 원작에서 도망은 기술이 아니라 도구·교체와
   * 같은 갈래의 행동이고 그쪽이 먼저 처리된다 — 그래서 묶어 두지 않으면 기술을
   * 한 번도 못 맞힌다. 볼은 그보다 앞서서, 한 판에 한 번은 던져 볼 수 있다.
   *
   * 묶였는지는 sim에게 묻는다(`request.active.trapped`) — 그림자밟기·개미지옥·
   * 검은눈빛·조이기가 다 그 한 값에 접혀 있다. 원작 목록에 없는 자력만 더
   * 걸리는데, 실제로 도는 배회 둘은 강철이 아니라 갈리는 자리가 없다
   */
  private roamerFlees(): BattleStep | null {
    if (!this.roamer || this.view.ended) return null
    if (this.request.p2?.active?.[0]?.trapped === true) return null
    const seen = activeAt(this.view, 'p2')
    if (!seen) return null
    this.foeFled = true
    this.view = { ...this.view, ended: true }
    return {
      events: [{
        kind: 'escape', success: true, foe: true,
        actor: { slot: seen.slot, side: 'p2', name: seen.key },
      }],
      view: this.view,
    }
  }

  /** 지금 나와 있는 상대. 키로 찾는다 — 같은 종을 둘 데리고 있어도 안 헷갈린다 */
  private activeFoe(): SideMon | null {
    const key = activeAt(this.view, 'p2')?.key
    return this.foeTeam.find((m) => m.key === key) ?? null
  }

  /** 그 자리에 있는 개체의 실제 스피드. 못 찾으면 1 — 0으로 나누지 않기 위해서다 */
  private speedOf(team: SideMon[], key: string | undefined): number {
    const found = team.find((m) => m.key === key)
    return found ? statsOf(found.mon, found.species).spe : 1
  }

  /** 우리 수를 두고 다음 선택 시점까지 나아간다 */
  async choose(action: BattleAction): Promise<BattleStep> {
    return this.chooseTurn([action])
  }

  /**
   * 자리마다의 명령을 한꺼번에 둔다 (PARITY §2.2).
   *
   * ⚠️ **한 줄로 묶어야 한다.** sim은 더블에서 두 자리의 명령을 쉼표로 묶은
   * 한 줄로만 받는다 — 자리마다 따로 보내면 첫 줄이 "명령이 모자라다"로
   * 거절되고, 우리는 이미 요청을 비운 뒤라 배틀이 그 자리에 선다
   */
  async chooseTurn(actions: readonly BattleAction[]): Promise<BattleStep> {
    if (this.view.ended || actions.length === 0) return { events: [], view: this.view }
    // 배회는 우리 기술이 나가기 전에 달아난다 (PARITY §6.3)
    const gone = this.roamerFlees()
    if (gone) return gone
    // 남에게 받은 마리는 명령을 안 들을 수 있다 (PARITY §2.18)
    const heard = this.obey(actions)
    if (heard.send) this.session.send(`p1 ${encodeTurn(heard.actions)}`)
    this.request.p1 = null
    const step = await this.advance()
    return { events: [...heard.events, ...step.events], view: step.view }
  }

  /**
   * 명령을 낸 자리마다 말을 듣는지 본다 (`BattleControllerPlayer_CheckObedience`).
   *
   * 불복은 넷 중 하나로 갈리고, **다른 기술을 쓰는 것 말고는 전부 이 턴을 버린다.**
   * 버리는 길은 볼·도망과 같은 빈 턴 칸이다 (`spendTurn`) — 그래야 상대는
   * 제 수를 두고 턴이 정상으로 돈다.
   *
   * ⚠️ **턴을 못 비우면 그냥 듣는다.** 참기·역린에 묶였거나 도발에 걸린 자리가
   * 그렇다 (`hasIdle`). 그때 명령을 안 보내면 sim이 답을 기다리다 굳는다 —
   * 원작보다 순한 쪽으로 틀리는 것이 배틀이 서는 것보다 낫다
   */
  private obey(actions: readonly BattleAction[]): {
    actions: BattleAction[]
    events: BattleEvent[]
    /** 싱글에서 턴을 비웠으면 false — `spendTurn`이 이미 명령을 보냈다 */
    send: boolean
  } {
    const rule = this.obedience
    if (!rule) return { actions: [...actions], events: [], send: true }

    const out: BattleAction[] = []
    const events: BattleEvent[] = []
    let send = true
    for (const action of actions) {
      const at = action.at ?? 0
      const seen = action.type === 'move' ? activeAt(this.view, 'p1', at) : null
      const mine = seen ? this.playerTeam.find((m) => m.key === seen.key) : null
      if (!seen || !mine || action.type !== 'move') { out.push(action); continue }

      // 발버둥과 우리가 몰래 붙인 빈 턴 칸은 명령이 아니다
      const others = this.actionsAt(at)
        .filter((a) => a.type === 'move' && a.slot !== action.slot && a.id !== IDLE_MOVE_ID)
        .map((a) => (a as BattleAction & { type: 'move' }).slot)

      const check = checkObedience({
        level: seen.level,
        badges: badgeCount(rule.badges),
        isOwn: isOriginalTrainer(mine.mon, rule.trainer),
        status: seen.status,
        sleepMove: action.move === MOVE_SNORE || action.move === MOVE_SLEEP_TALK,
        cantSleep: mine.species.abilities.includes(ABILITY_INSOMNIA)
          || mine.species.abilities.includes(ABILITY_VITAL_SPIRIT),
        otherSlots: others,
      }, this.random)
      if (check.result === 'obey') { out.push(action); continue }

      const actor = { slot: seen.slot, side: 'p1' as const, name: seen.key }
      if (check.result === 'otherMove') {
        const swap = this.actionsAt(at).find((a) => a.type === 'move' && a.slot === check.slot)
        if (swap) {
          events.push({ kind: 'disobey', actor, reason: 'otherMove' })
          out.push({ ...swap, at })
          continue
        }
        out.push(action)
        continue
      }

      // ⚠️ **먼저 비울 수 있는지 본다.** 재우거나 깎아 놓고 턴을 못 비우면
      // 그 마리가 잠든 채로 원래 기술을 쓴다
      if (!this.canSpendAt(at)) { out.push(action); continue }
      if (check.result === 'nap') this.session.sleep('p1', at)
      if (check.result === 'hitSelf') this.selfHit(mine, seen.slot, at)
      if (!this.spendTurn(at)) { out.push(action); continue }
      events.push({
        kind: 'disobey', actor, reason: check.result,
        ...(check.result === 'nothing' ? { flavor: idleFlavor(this.random) } : {}),
      })
      // 더블은 두 자리를 한 줄로 묶어야 해서 빈 턴 칸을 명령으로 넣는다.
      // 싱글은 `useIdle`이 이미 보냈다
      if (this.doubles) {
        out.push({
          type: 'move', at, slot: this.session.armedIdleSlot('p1'),
          id: IDLE_MOVE_ID, name: IDLE_MOVE, move: IDLE_ROM_MOVE,
        })
      } else {
        send = false
      }
    }
    return { actions: out, events, send }
  }

  /** 말을 안 듣고 자기를 때린다. 혼란 자해와 같은 계산이다 (PARITY §2.18) */
  private selfHit(mine: SideMon, slot: string, at: number): void {
    const seen = this.view.active[slot as keyof BattleView['active']]
    const stats = statsOf(mine.mon, mine.species)
    const atk = boosted(stats.atk, seen?.boosts.atk ?? 0)
    const def = boosted(stats.def, seen?.boosts.def ?? 0)
    const raw = selfHitDamage(mine.mon.level, atk, def)
    this.session.hurt('p1', at, damageVariance(raw, this.random))
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
      let itemAction: BattleAction | null = null
      if (foe && foe.forceSwitch?.[0] !== true) {
        const used = this.useItem(foe)
        if (used) {
          events.push(used.event)
          // ⚠️ 싱글은 `useIdle`이 그 자리에서 명령까지 보냈다. 더블은 두 자리를
          // 한 줄로 묶어야 해서 아직 안 보냈다 — 나머지 자리를 마저 채운다
          if (!this.doubles) { this.request.p2 = null; continue }
          itemAction = used.action
        }
      }
      const turn = foe ? this.foeTurn(foe, itemAction) : []
      if (turn.length === 0) {
        // 양쪽 다 고를 게 없다. 정산이 아직 안 끝났을 수 있으니 한 틱 더 준다
        if (lines.p1.length === 0 && lines.p2.length === 0) break
        continue
      }
      // 시합규칙 「교체」 — 상대가 새로 내보내려는 참이면 우리도 바꿀지 묻는다.
      // ⚠️ **싱글에만 있는 규칙이다.** 원작의 「교체」는 1대1 트레이너전 설정이라
      // 더블에는 아예 안 걸린다
      const first = turn[0]!
      if (this.shift && !this.doubles && first.type === 'switch'
        && foe?.forceSwitch?.[0] === true && this.canShift()) {
        this.asking = { action: first, key: first.key }
        events.push({ kind: 'shift', key: first.key })
        break
      }
      this.session.send(`p2 ${encodeTurn(turn)}`)
      this.request.p2 = null
    }

    // ⚠️ **삼킬 물장구가 안 나왔으면 그 표를 버린다.** 명령을 넣은 마리가 그 전에
    // 쓰러지면(말을 안 듣고 자기를 때린 자리가 그렇다) sim이 그 명령을 통째로
    // 건너뛴다 — 표를 남겨 두면 **다음에 나오는 진짜 물장구**가 대신 지워진다
    this.spent.p1 = false
    this.spent.p2 = false
    return { events, view: this.view }
  }

  /**
   * 상대가 이번에 둘 것 전부. 더블이면 자리 둘을 다 채운다.
   *
   * ⚠️ **같은 마리를 두 자리가 같이 내보내면 안 된다.** sim이 거절하고, 우리는
   * 이미 요청을 비운 뒤라 배틀이 굳는다 — 앞 자리가 고른 것을 뒤에서 뺀다
   */
  private foeTurn(request: BattleRequest, forced: BattleAction | null = null): BattleAction[] {
    if (!this.doubles) {
      const one = this.foePolicy(request, 0)
      return one ? [one] : []
    }
    const taken = new Set<number>()
    const out: BattleAction[] = []
    for (const at of chooseSlotsFor(request, this.aliveOn('p2'), true)) {
      // 도구를 쓴 자리는 이미 빈 턴 칸이 세워져 있다. 그 칸으로 턴을 비운다
      if (forced && (forced.at ?? 0) === at) { out.push(forced); continue }
      // 쓰러진 자리만 바꾸는 턴에는 멀쩡한 자리가 `pass`다
      if (request.forceSwitch && !request.forceSwitch[at]) {
        out.push({ type: 'pass', at })
        continue
      }
      const opts = {
        hiddenSlot: idleSlotOf(request, at), at, doubles: this.doubles,
        foeAlive: this.aliveOn('p1'),
        allyAlive: this.aliveOn('p2')[at === 0 ? 1 : 0],
      }
      const legal = legalActions(request, opts)
        .filter((a) => a.type !== 'switch' || !taken.has(a.index))
      let pick = this.foePolicy(request, at)
      // ⚠️ **정책이 고른 수가 그대로 합법인 것이 아니다.** 원작 AI는 기술에
      // 점수를 매기지 대상까지 고르지 않고(싱글용 점수표다), 앞 자리가 이미
      // 부른 마리를 또 고를 수도 있다. 그대로 보내면 sim이 거절하고, 우리는
      // 이미 요청을 비운 뒤라 **배틀이 그 자리에 선다** — 합법 목록으로 접는다
      if (pick?.type === 'move') {
        const want = pick.slot
        const same = legal.filter((a) => a.type === 'move' && a.slot === want)
        pick = same[Math.floor(this.random() * same.length)] ?? same[0] ?? null
      } else if (pick?.type === 'switch' && taken.has(pick.index)) {
        pick = null
      }
      pick ??= legal[Math.floor(this.random() * legal.length)] ?? legal[0] ?? null
      // 벤치가 모자란 자리는 넘긴다 (우리 쪽 `actionsAt`과 같은 규칙)
      if (!pick && request.forceSwitch) { out.push({ type: 'pass', at }); continue }
      if (!pick) return []
      if (pick.type === 'switch') taken.add(pick.index)
      out.push({ ...pick, at })
    }
    return out
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
    const key = activeAt(this.view, 'p1')?.key
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
  private useItem(request: BattleRequest): { event: BattleEvent; action: BattleAction } | null {
    const kit = this.items
    const seen = activeAt(this.view, 'p2')
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
    return {
      event: { kind: 'trainerItem', key: seen.key, item: use.item },
      // 더블에서 이 자리의 명령이 된다. 싱글은 `useIdle`이 이미 보냈으므로 안 쓴다
      action: {
        type: 'move', at: 0, slot: this.session.armedIdleSlot('p2'),
        id: IDLE_MOVE_ID, name: IDLE_MOVE, move: IDLE_ROM_MOVE,
      },
    }
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
    const armed = this.armBagItem(item, key, 0, moveSlot)
    if (!armed) return { events: [], view: this.view }
    const step = await this.advance()
    return { events: [...armed.events, ...step.events], view: step.view }
  }

  /**
   * 도구를 먹이고 **그 자리의 턴을 비운다.** 명령은 아직 안 보낸다.
   *
   * 더블에서 화면이 자리마다 물어볼 때 쓴다 — 도구를 쓰면 그것이 그 자리의
   * 이번 턴 명령이 되고, 나머지 자리는 그대로 기술을 고른다.
   *
   * ⚠️ 싱글에서는 `session.useIdle`이 그 자리에서 명령까지 보내므로
   * `action`을 다시 보내면 안 된다 — `useBagItem`이 그래서 곧바로 `advance`한다
   */
  armBagItem(
    item: BagItem, key: string, at = 0, moveSlot?: number,
  ): { events: BattleEvent[]; action: BattleAction } | null {
    if (this.view.ended || !this.canSpendAt(at)) return null
    const plan = this.planFor(item.data, key, moveSlot)
    if (!plan) return null
    this.session.applyPlan('p1', key, plan)
    if (!this.spendTurn(at)) return null
    return {
      events: [{ kind: 'bagItem', key, item: item.id }],
      action: {
        type: 'move', at, slot: this.session.armedIdleSlot('p1'),
        id: IDLE_MOVE_ID, name: IDLE_MOVE, move: IDLE_ROM_MOVE,
      },
    }
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
    // ⚠️ 더블에서는 **두 자리 중 어느 쪽**에 서 있는지를 봐야 한다
    const slot = slotOfKey(this.view, key)
    const seen = slot && slot.startsWith('p1') ? this.view.active[slot] : null
    const out = seen !== null
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
    if (this.view.ended || this.doubles || this.mustSwitch) {
      return { events: [], view: this.view }
    }
    const key = activeAt(this.view, 'p1')?.key ?? ''
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
