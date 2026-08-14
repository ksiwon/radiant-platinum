// 사파리 배틀 한 판 (PARITY §2.19) — `battle_controller_player.c`의 사파리 넷.
//
// ⚠️ **여기는 sim이 안 돈다.** 기술도 체력도 특성도 없는 판이라 대전 심판에게
// 넘길 것이 없다 — 볼·미끼·진흙·도망 넷과 「달아났는가」뿐이다. 그래서 이
// 파일이 컨트롤러 자리를 대신하고, 내놓는 것은 다른 배틀과 **같은 사건 줄기**다
// (`BattleEvent`). 그래야 무대·재생기·대사창을 한 벌로 쓴다.
//
// 칸을 미는 산수와 도망 판정은 `world/safari`가 들고 있다 — 이 파일은 **차례**를
// 맡는다. 원작이 배틀 스크립트 넷으로 적어 둔 그 차례다.
import type { Actor, BattleEvent, SafariBeat } from './events'
import { Ball, throwBall, type CatchTarget } from './meta/capture'
import {
  safariCatchRate, safariFlees, throwBait, throwMud, type SafariBattle,
} from '../world/safari'

/** 고를 수 있는 넷 (`PLAYER_INPUT_SAFARI_*`) */
export type SafariCommand = 'ball' | 'bait' | 'mud' | 'run'

/**
 * 판이 끝난 까닭. null이면 아직 안 끝났다.
 *
 * `outOfBalls`는 **잡거나 놓친 다음에** 볼이 0이 된 자리다 — 원작이 그때
 * 안내 방송을 띄우고 판을 닫는다 (`subscript_throw_safari_ball`의 뒷마디)
 */
export type SafariOutcome = null | 'caught' | 'fled' | 'foeFled' | 'outOfBalls'

/** 한 판이 들고 있는 전부 */
export interface SafariState {
  /** 잡히는 칸과 도망 칸 0~12 */
  stage: SafariBattle
  /** 남은 사파리볼 */
  balls: number
}

export interface SafariTurnInput {
  state: SafariState
  command: SafariCommand
  /** 상대의 종족 포획값·도망값과 지금 체력 */
  foe: SafariFoe
  /** 상대 자리. 사건에 실어 보낸다 */
  actor: Actor
  /** 0 이상 1 미만 */
  rng: () => number
}

export interface SafariFoe {
  /** 종족의 포획값 0~255 */
  catchRate: number
  /** 종족의 **도망값**. 포획값과 다른 칸이다 (`SPECIES_DATA_SAFARI_FLEE_RATE`) */
  fleeRate: number
  hp: number
  maxHp: number
}

export interface SafariTurn {
  state: SafariState
  events: BattleEvent[]
  outcome: SafariOutcome
}

/** `BattleSystem_RandNext() % n` */
function randMod(rng: () => number, n: number): number {
  return Math.floor(rng() * n) % n
}

function beat(actor: Actor, what: SafariBeat): BattleEvent {
  return { kind: 'safari', actor, beat: what }
}

/**
 * 한 턴 (`BattleControllerPlayer_Safari*Command` 넷 + 상대의 명령 고르기).
 *
 * ⚠️ **늘 우리가 먼저 움직인다** (`BattleControllerPlayer_CalcTurnOrder` —
 * 사파리와 파르크만 스피드를 안 보고 자리 번호 순서로 못 박혀 있다).
 *
 * ⚠️ **볼을 헛던진 턴에도 상대는 달아날 수 있다.** 사파리는 `BATTLE_TYPE_NO_MOVES`라
 * `BattleControllerPlayer_MoveEnd`의 「판이 끝났나」 검사를 통째로 건너뛰고
 * 곧바로 다음 자리의 명령으로 넘어간다 — 볼을 던졌다고 상대의 차례가 없어지지
 * 않는다. 잡혔거나 볼이 떨어진 자리만 그 앞에서 판을 닫는다
 */
export function safariTurn({
  state, command, foe, actor, rng,
}: SafariTurnInput): SafariTurn {
  if (command === 'run') {
    // ⚠️ **판정이 없다.** 사파리에서는 도망이 늘 성공한다 — 원작도 `BATTLE_CONTROL_RUN`을
    // 그대로 태워 보내고 붙잡는 계산을 안 한다
    return {
      state,
      events: [{ kind: 'escape', success: true }],
      outcome: 'fled',
    }
  }

  let next: SafariState
  const events: BattleEvent[] = []

  if (command === 'ball') {
    const balls = Math.max(0, state.balls - 1)
    const target: CatchTarget = {
      hp: foe.hp,
      maxHp: foe.maxHp,
      // ⚠️ **칸의 배수를 종족 포획값에 먼저 곱한다** (`BattleScript_CalcCatchShakes`의
      // 사파리 갈래). 볼 보정보다 앞이라 여기서 버린 자리가 그대로 남는다
      catchRate: safariCatchRate(foe.catchRate, state.stage.catchStage),
      // 사파리에는 상태이상이 없다. 걸 기술이 없어서다
      status: 'ok',
    }
    const got = throwBall(target, Ball.SAFARI, {
      turn: 0, level: 0, types: [0, 0], caughtBefore: false, inWater: false, darkness: false,
    }, rng)
    next = { ...state, balls }
    events.push({ kind: 'ball', actor, ball: Ball.SAFARI, shakes: got.shakes, caught: got.caught })
    if (got.caught) return { state: next, events, outcome: 'caught' }
    // 놓쳤는데 볼도 떨어졌다. 안내 방송이 그 자리에서 판을 닫는다
    if (balls === 0) return { state: next, events, outcome: 'outOfBalls' }
  } else {
    // 미끼와 진흙. 굴린 값 0이 「이득 본 판」이고 그때 문장이 갈린다
    const roll = randMod(rng, 10)
    const stage = command === 'bait'
      ? throwBait(state.stage, roll)
      : throwMud(state.stage, roll)
    next = { ...state, stage }
    events.push(...(command === 'bait'
      ? [beat(actor, 'bait'), beat(actor, roll === 0 ? 'busyEating' : 'eating')]
      : [beat(actor, 'mud'), beat(actor, roll === 0 ? 'veryAngry' : 'angry')]))
  }

  // ⚠️ **밀어 놓은 새 칸으로 판정한다.** 원작도 명령을 처리한 **뒤에** 상대의
  // 차례가 오므로, 진흙을 던진 그 턴부터 도망이 줄어든다
  if (safariFlees(foe.fleeRate, next.stage.escapeStage, randMod(rng, 255))) {
    events.push({ kind: 'escape', success: true, foe: true, actor })
    return { state: next, events, outcome: 'foeFled' }
  }
  events.push(beat(actor, 'watching'))
  return { state: next, events, outcome: null }
}
