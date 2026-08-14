// 포획 판정 (PLAN §7.6) — 4세대 공식.
//
// @pkmn/sim은 대전 심판이라 볼을 던지는 것을 모른다. 여기서 직접 굴린다.
//
// **실수 연산을 안 쓴다.** 볼·상태이상 보정을 10배 정수로 다뤄, 카트리지가
// 정수 나눗셈으로 버리는 자리를 똑같이 버린다. 부동소수로 하면 경계값에서
// 한 끗씩 어긋나고 그건 "가끔 안 잡힌다"로만 보인다.
import type { Status } from '../../pokemon/instance'

/** 4세대 도구 번호 (DATA.md 예정). 지금은 볼만 필요하다 */
export const Ball = {
  MASTER: 1,
  ULTRA: 2,
  GREAT: 3,
  POKE: 4,
  SAFARI: 5,
  NET: 6,
  DIVE: 7,
  NEST: 8,
  REPEAT: 9,
  TIMER: 10,
  LUXURY: 11,
  PREMIER: 12,
  DUSK: 13,
  HEAL: 14,
  QUICK: 15,
  CHERISH: 16,
} as const

export type BallId = (typeof Ball)[keyof typeof Ball]

/** 볼 보정을 정하는 데 필요한 판 상황 */
export interface CatchContext {
  /** 지금까지 지난 턴 수. 타이머볼이 쓴다 */
  turn: number
  level: number
  /** 상대 타입 번호 두 개. 네트볼이 쓴다 */
  types: readonly [number, number]
  /** 이미 잡아 본 종인가. 리피트볼이 쓴다 */
  caughtBefore: boolean
  /** 물에서 싸우는가. 다이브볼이 쓴다 */
  inWater: boolean
  /** 밤이거나 동굴인가. 다크볼이 쓴다 */
  darkness: boolean
}

const TYPE_BUG = 6
const TYPE_WATER = 11

/**
 * 볼 보정 ×10. 마스터볼은 여기 없다 — 판정 자체를 건너뛴다.
 *
 * 4세대 값이다. 레벨볼·러브볼 같은 2세대 전용 볼은 4세대에 없다
 */
export function ballBonus(ball: BallId, ctx: CatchContext): number {
  switch (ball) {
    case Ball.ULTRA: return 20
    case Ball.GREAT: return 15
    case Ball.SAFARI: return 15
    case Ball.NET:
      return ctx.types.includes(TYPE_BUG) || ctx.types.includes(TYPE_WATER) ? 30 : 10
    case Ball.DIVE: return ctx.inWater ? 35 : 10
    // 상대가 낮은 레벨일수록 좋다. 30레벨 이상이면 이점이 없다
    case Ball.NEST: return ctx.level < 30 ? Math.max(10, 40 - ctx.level) : 10
    case Ball.REPEAT: return ctx.caughtBefore ? 30 : 10
    // 턴마다 조금씩 오르고 10턴에서 멈춘다
    case Ball.TIMER: return Math.min(40, 10 + ctx.turn * 3)
    case Ball.DUSK: return ctx.darkness ? 35 : 10
    // 첫 턴에만 좋다
    case Ball.QUICK: return ctx.turn <= 1 ? 40 : 10
    default: return 10
  }
}

/** 상태이상 보정 ×10. 잠·얼음이 가장 좋다 */
export function statusBonus(status: Status): number {
  if (status === 'slp' || status === 'frz') return 20
  if (status === 'par' || status === 'psn' || status === 'tox' || status === 'brn') return 15
  return 10
}

/** 판정에 필요한 상대 정보 */
export interface CatchTarget {
  hp: number
  maxHp: number
  /** 종족의 포획률 0~255 */
  catchRate: number
  status: Status
}

/**
 * 포획 계수 `a`. 255 이상이면 무조건 잡힌다.
 *
 * HP가 낮을수록, 상태이상이 있을수록 커진다. 최대 HP의 3배에서 현재 HP의 2배를
 * 빼는 모양이라 **HP를 1까지 깎아도 계수는 3배까지밖에 안 오른다** — 상태이상을
 * 거는 쪽이 더 크게 먹히는 이유다.
 *
 * ⚠️ **버리는 자리가 셋이고 차례가 정해져 있다** (`BattleScript_CalcCatchShakes`):
 *
 *     (포획률 × 볼보정 / 10) × (3max − 2cur) / (3max) × 상태보정 / 10
 *
 * 한 줄로 묶어 마지막에 한 번만 버리면 630가지 조합 중 51가지가 1씩 어긋난다 —
 * 제일 크게 벌어지는 곳이 **포획률 3짜리를 빈사까지 깎았을 때**(3 대 4)라,
 * 하필 전설을 잡는 자리에서 확률이 달라진다
 */
export function catchValue(target: CatchTarget, bonus: number, status: number): number {
  const max = Math.max(1, target.maxHp)
  const cur = Math.max(1, Math.min(target.hp, max))
  const base = Math.floor((target.catchRate * bonus) / 10)
  const a = Math.floor((base * (3 * max - 2 * cur)) / (3 * max))
  return Math.floor((a * status) / 10)
}

/**
 * 흔들림 문턱값 `b`. 한 번 흔들 때 `rand(65536) < b`면 통과한다.
 *
 * `b = 1048560 / ⁴√(16711680 / a)`. a가 255면 65535가 나와 사실상 확정이고,
 * a가 1이면 16399가 나와 네 번 통과할 확률이 0.39%다
 */
export function shakeThreshold(a: number): number {
  if (a <= 0) return 0
  return Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / a)))
}

export interface CatchResult {
  caught: boolean
  /** 화면에 보여 줄 흔들림 횟수 0~3. 잡히면 4 */
  shakes: number
}

/** 볼을 던진다. 흔들림 네 번을 다 통과해야 잡힌다 */
export function throwBall(
  target: CatchTarget,
  ball: BallId,
  ctx: CatchContext,
  random: () => number,
): CatchResult {
  if (ball === Ball.MASTER) return { caught: true, shakes: 4 }

  const a = catchValue(target, ballBonus(ball, ctx), statusBonus(target.status))
  if (a >= 255) return { caught: true, shakes: 4 }

  const b = shakeThreshold(a)
  for (let i = 0; i < 4; i++) {
    if (Math.floor(random() * 65536) >= b) return { caught: false, shakes: i }
  }
  return { caught: true, shakes: 4 }
}

/** 이 상황에서 잡힐 확률 0~1. UI 힌트와 테스트가 쓴다 */
export function catchChance(target: CatchTarget, ball: BallId, ctx: CatchContext): number {
  if (ball === Ball.MASTER) return 1
  const a = catchValue(target, ballBonus(ball, ctx), statusBonus(target.status))
  if (a >= 255) return 1
  return (shakeThreshold(a) / 65536) ** 4
}
