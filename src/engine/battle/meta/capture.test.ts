// 포획 공식. 오라클은 **공표된 확률**이다 — 4세대 포획률은 잘 알려진 값이라
// 식을 한 자리라도 틀리면 그 숫자가 안 나온다.
import { describe, it, expect } from 'vitest'
import {
  Ball, ballBonus, catchChance, catchValue, shakeThreshold, statusBonus, throwBall,
  type CatchContext, type CatchTarget,
} from './capture'

const ctx: CatchContext = {
  turn: 3, level: 20, types: [12, 12], caughtBefore: false, inWater: false, darkness: false,
}

const target = (over: Partial<CatchTarget> = {}): CatchTarget =>
  ({ hp: 100, maxHp: 100, catchRate: 255, status: 'ok', ...over })

describe('포획 공식', () => {
  it('만피 255짜리를 몬스터볼로 → 1/3', () => {
    // 가장 널리 알려진 값이다. 캐터피를 만피에 몬스터볼로 던지면 세 번에 한 번
    expect(catchValue(target(), 10, 10)).toBe(85)
    expect(catchChance(target(), Ball.POKE, ctx)).toBeCloseTo(0.333, 2)
  })

  it('포획률 3짜리를 만피에 하이퍼볼로 → 0.8%', () => {
    // 기라티나·디아루가급. 만피에 던지는 것이 얼마나 헛짓인지가 이 숫자다
    const legend = target({ catchRate: 3 })
    expect(catchValue(legend, 20, 10)).toBe(2)
    expect(catchChance(legend, Ball.ULTRA, ctx)).toBeCloseTo(0.0078, 4)
  })

  it('HP를 1까지 깎아도 계수는 세 배까지다', () => {
    // 최대 HP 3배에서 현재 HP 2배를 빼는 모양이라 그렇다. 상태이상 쪽이 더 크게
    // 먹히는 이유이기도 하다
    const full = catchValue(target({ catchRate: 45 }), 10, 10)
    const sliver = catchValue(target({ catchRate: 45, hp: 1 }), 10, 10)
    expect(full).toBe(15)
    expect(sliver).toBe(44) // 45의 세 배가 아니라, 현재 HP 1이 남아 조금 못 미친다
    expect(sliver / full).toBeLessThanOrEqual(3)
  })

  it('잠·얼음이 2배, 나머지 상태이상이 1.5배', () => {
    expect(statusBonus('slp')).toBe(20)
    expect(statusBonus('frz')).toBe(20)
    expect(statusBonus('par')).toBe(15)
    expect(statusBonus('psn')).toBe(15)
    expect(statusBonus('tox')).toBe(15)
    expect(statusBonus('brn')).toBe(15)
    expect(statusBonus('ok')).toBe(10)
  })

  it('계수가 255를 넘으면 무조건 잡힌다', () => {
    const easy = target({ catchRate: 255, hp: 1, status: 'slp' })
    expect(catchValue(easy, 10, 20)).toBeGreaterThanOrEqual(255)
    expect(catchChance(easy, Ball.POKE, ctx)).toBe(1)
    // 흔들림을 굴리지 않으므로 난수를 최악으로 줘도 잡힌다
    expect(throwBall(easy, Ball.POKE, ctx, () => 0.999999)).toEqual({ caught: true, shakes: 4 })
  })

  it('마스터볼은 판정을 건너뛴다', () => {
    const legend = target({ catchRate: 3 })
    expect(catchChance(legend, Ball.MASTER, ctx)).toBe(1)
    expect(throwBall(legend, Ball.MASTER, ctx, () => 0.999999).caught).toBe(true)
  })

  it('흔들림 문턱은 계수 255에서 65535, 1에서 16399다', () => {
    expect(shakeThreshold(255)).toBe(65535)
    expect(shakeThreshold(1)).toBe(16399)
    expect(shakeThreshold(0)).toBe(0)
  })

  it('⚠️ 버리는 자리가 셋이다 — 한 줄로 묶으면 전설이 더 잘 잡힌다', () => {
    // `(3 × 15 / 10)`이 4.5에서 **4로 버려지고** 나서 HP 비율이 곱해진다.
    // 한 줄로 묶어 마지막에 한 번만 버리면 여기서 4가 나온다
    const legend = target({ catchRate: 3, maxHp: 20, hp: 1 })
    expect(catchValue(legend, 15, 10)).toBe(3)
  })

  it('실패한 자리에서 멈춘다 — 흔들림 횟수가 화면에 나간다', () => {
    const hard = target({ catchRate: 3 })
    // 첫 판정만 통과시키고 두 번째에서 떨어뜨린다
    const rolls = [0, 0.9, 0, 0]
    let i = 0
    expect(throwBall(hard, Ball.POKE, ctx, () => rolls[i++]!)).toEqual({ caught: false, shakes: 1 })
  })
})

describe('볼 보정', () => {
  it('기본 볼 세 가지', () => {
    expect(ballBonus(Ball.POKE, ctx)).toBe(10)
    expect(ballBonus(Ball.GREAT, ctx)).toBe(15)
    expect(ballBonus(Ball.ULTRA, ctx)).toBe(20)
  })

  it('네트볼은 벌레·물에만 3배', () => {
    expect(ballBonus(Ball.NET, { ...ctx, types: [6, 6] })).toBe(30)
    expect(ballBonus(Ball.NET, { ...ctx, types: [11, 2] })).toBe(30)
    expect(ballBonus(Ball.NET, { ...ctx, types: [10, 0] })).toBe(10)
  })

  it('퀵볼은 첫 턴에만, 타이머볼은 늦을수록', () => {
    expect(ballBonus(Ball.QUICK, { ...ctx, turn: 1 })).toBe(40)
    expect(ballBonus(Ball.QUICK, { ...ctx, turn: 2 })).toBe(10)
    expect(ballBonus(Ball.TIMER, { ...ctx, turn: 0 })).toBe(10)
    expect(ballBonus(Ball.TIMER, { ...ctx, turn: 5 })).toBe(25)
    // 10턴에서 멈춘다. 안 멈추면 무한정 올라간다
    expect(ballBonus(Ball.TIMER, { ...ctx, turn: 10 })).toBe(40)
    expect(ballBonus(Ball.TIMER, { ...ctx, turn: 99 })).toBe(40)
  })

  it('상황 볼은 조건이 안 맞으면 보정이 없다', () => {
    expect(ballBonus(Ball.DIVE, ctx)).toBe(10)
    expect(ballBonus(Ball.DIVE, { ...ctx, inWater: true })).toBe(35)
    expect(ballBonus(Ball.DUSK, ctx)).toBe(10)
    expect(ballBonus(Ball.DUSK, { ...ctx, darkness: true })).toBe(35)
    expect(ballBonus(Ball.REPEAT, ctx)).toBe(10)
    expect(ballBonus(Ball.REPEAT, { ...ctx, caughtBefore: true })).toBe(30)
  })

  it('힐볼·프리미어볼처럼 보정 없는 볼은 몬스터볼과 같다', () => {
    for (const ball of [Ball.HEAL, Ball.LUXURY, Ball.PREMIER, Ball.CHERISH]) {
      expect(ballBonus(ball, ctx), `볼 ${ball}`).toBe(10)
    }
  })
})

describe('흔들림 시뮬레이션이 닫힌 식과 같다', () => {
  it('1만 번 던지면 계산한 확률에 붙는다', () => {
    // 네 번 굴리는 루프와 `(b/65536)^4`가 같은 것을 말한다는 확인이다.
    // 루프를 세 번으로 줄이면 여기서 잡힌다
    let seed = 12345
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x80000000
    }
    const t = target({ catchRate: 90, hp: 30 })
    const expected = catchChance(t, Ball.GREAT, ctx)
    let caught = 0
    const N = 10000
    for (let i = 0; i < N; i++) if (throwBall(t, Ball.GREAT, ctx, random).caught) caught++
    expect(expected, '이 조합이 0%나 100%면 검증이 안 된다').toBeGreaterThan(0.05)
    expect(expected).toBeLessThan(0.95)
    expect(caught / N).toBeCloseTo(expected, 1)
  })
})
