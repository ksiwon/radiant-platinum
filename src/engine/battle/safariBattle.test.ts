// 사파리 배틀 한 판 (PARITY §2.19)
//
// 칸을 미는 산수는 `world/safari.test.ts`가 이미 못 박고 있다. 여기서 보는 것은
// **차례**다 — 무엇이 먼저 나가고, 언제 판이 닫히고, 언제 상대가 달아나는가.
import { describe, expect, it } from 'vitest'
import { safariTurn, type SafariFoe, type SafariState } from './safariBattle'
import { SAFARI_STAGE_START, newSafariBattle } from '../world/safari'
import { Ball } from './meta/capture'
import type { Actor } from './events'

const actor: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }

const state = (over: Partial<SafariState> = {}): SafariState =>
  ({ stage: newSafariBattle(), balls: 30, ...over })

/**
 * 차례만 볼 때 쓰는 상대.
 *
 * ⚠️ **도망값 0으로는 「안 달아난다」를 못 만든다** — `<=`라서 굴린 값 0이면
 * 0인 종도 달아난다. 그래서 굴린 값 쪽을 1 이상으로 준다
 */
const calm: SafariFoe = { catchRate: 45, fleeRate: 0, hp: 20, maxHp: 20 }

/** 「안 달아나는」 굴림. 0이 아니기만 하면 된다 */
const STAY = 1 / 255

/** 굴린 값을 차례대로 먹인다. 모자라면 마지막 값을 되쓴다 */
function feed(...values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)] ?? 0
}

describe('도망친다', () => {
  it('⚠️ 판정이 없다 — 사파리에서는 늘 성공한다', () => {
    const got = safariTurn({ state: state(), command: 'run', foe: calm, actor, rng: () => 0.999 })
    expect(got.outcome).toBe('fled')
    expect(got.events).toEqual([{ kind: 'escape', success: true }])
    // 볼도 칸도 안 건드린다
    expect(got.state).toEqual(state())
  })
})

describe('사파리볼', () => {
  it('한 개를 쓰고 잡히면 그 자리에서 닫힌다', () => {
    // 포획률 255짜리를 한가운데 칸에서 던지면 계수가 255를 넘어 확정이다
    const easy: SafariFoe = { catchRate: 255, fleeRate: 0, hp: 1, maxHp: 20 }
    const got = safariTurn({ state: state(), command: 'ball', foe: easy, actor, rng: () => 0.999 })
    expect(got.outcome).toBe('caught')
    expect(got.state.balls).toBe(29)
    expect(got.events).toEqual([
      { kind: 'ball', actor, ball: Ball.SAFARI, shakes: 4, caught: true },
    ])
  })

  it('⚠️ 헛던진 턴에도 상대가 달아날 수 있다', () => {
    // 사파리는 `BATTLE_TYPE_NO_MOVES`라 볼을 던져도 상대의 차례가 그대로 온다
    const runner: SafariFoe = { catchRate: 3, fleeRate: 255, hp: 20, maxHp: 20 }
    const got = safariTurn({
      state: state(), command: 'ball', foe: runner, actor, rng: feed(0.9, 0, 0),
    })
    expect(got.outcome).toBe('foeFled')
    expect(got.events.at(-1)).toEqual({ kind: 'escape', success: true, foe: true, actor })
  })

  it('⚠️ 마지막 볼을 헛던지면 상대가 달아나기 전에 판이 닫힌다', () => {
    const runner: SafariFoe = { catchRate: 3, fleeRate: 255, hp: 20, maxHp: 20 }
    const got = safariTurn({
      state: state({ balls: 1 }), command: 'ball', foe: runner, actor, rng: feed(0.9),
    })
    expect(got.outcome).toBe('outOfBalls')
    expect(got.state.balls).toBe(0)
    // 달아난 줄이 안 붙는다 — 안내 방송이 먼저다
    expect(got.events.some((e) => e.kind === 'escape')).toBe(false)
  })

  it('잡혔으면 볼이 0이 되어도 판을 안 닫는다 — 잡은 것이 먼저다', () => {
    const easy: SafariFoe = { catchRate: 255, fleeRate: 0, hp: 1, maxHp: 20 }
    const got = safariTurn({
      state: state({ balls: 1 }), command: 'ball', foe: easy, actor, rng: () => 0.999,
    })
    expect(got.outcome).toBe('caught')
  })
})

describe('미끼와 진흙', () => {
  it('⚠️ 미끼는 잡히는 칸을 늘 올리고 도망 칸은 10분의 9로 올린다', () => {
    // 굴린 값이 0이 아니면 둘 다 오르고 「먹고 있다」
    const up = safariTurn({ state: state(), command: 'bait', foe: calm, actor, rng: feed(0.5, STAY) })
    expect(up.state.stage.catchStage).toBe(SAFARI_STAGE_START + 1)
    expect(up.state.stage.escapeStage).toBe(SAFARI_STAGE_START + 1)
    expect(up.events[1]).toEqual({ kind: 'safari', actor, beat: 'eating' })

    // 0이면 도망 칸이 안 오르고 「먹느라 정신이 없다」 — 이쪽이 이득 본 판이다
    const good = safariTurn({ state: state(), command: 'bait', foe: calm, actor, rng: feed(0, STAY) })
    expect(good.state.stage.escapeStage).toBe(SAFARI_STAGE_START)
    expect(good.events[1]).toEqual({ kind: 'safari', actor, beat: 'busyEating' })
  })

  it('⚠️ 진흙은 도망 칸을 늘 내리고 잡히는 칸은 10분의 9로 내린다', () => {
    const down = safariTurn({ state: state(), command: 'mud', foe: calm, actor, rng: feed(0.5, STAY) })
    expect(down.state.stage.escapeStage).toBe(SAFARI_STAGE_START - 1)
    expect(down.state.stage.catchStage).toBe(SAFARI_STAGE_START - 1)
    expect(down.events[1]).toEqual({ kind: 'safari', actor, beat: 'angry' })

    const good = safariTurn({ state: state(), command: 'mud', foe: calm, actor, rng: feed(0, STAY) })
    expect(good.state.stage.catchStage).toBe(SAFARI_STAGE_START)
    expect(good.events[1]).toEqual({ kind: 'safari', actor, beat: 'veryAngry' })
  })

  it('안 달아나면 「주의깊게 보고 있다」로 턴이 닫힌다', () => {
    const got = safariTurn({ state: state(), command: 'bait', foe: calm, actor, rng: feed(0.5, STAY) })
    expect(got.outcome).toBe(null)
    expect(got.events.at(-1)).toEqual({ kind: 'safari', actor, beat: 'watching' })
  })

  it('⚠️ 진흙을 던진 그 턴부터 도망이 줄어든다 — 민 칸으로 판정한다', () => {
    // 도망값 100. 한가운데 칸(1배)이면 100 이하가 도망이고, 한 칸 내리면
    // 100×10/15 = 66 이하다. 굴린 값 80이 그 사이에 있다
    const foe: SafariFoe = { catchRate: 45, fleeRate: 100, hp: 20, maxHp: 20 }
    const roll = 80 / 255
    // 미끼는 도망 칸을 올리므로 그 값에서도 달아난다
    expect(safariTurn({ state: state(), command: 'bait', foe, actor, rng: feed(0.5, roll) }).outcome)
      .toBe('foeFled')
    // 진흙은 내리므로 같은 값에서 안 달아난다
    expect(safariTurn({ state: state(), command: 'mud', foe, actor, rng: feed(0.5, roll) }).outcome)
      .toBe(null)
  })
})
