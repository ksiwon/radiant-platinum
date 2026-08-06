// 포락선이 원작 그대로인가 (DATA.md §2.18)
//
// 렌더 시험만으로는 부족했다. 감쇠율 식이나 어택 시프트를 바꿔 놓아도 곡의 RMS는
// 거의 안 움직여서 **네 번 중 세 번을 못 잡았다.** 그래서 여기서는 디스어셈블한
// 식 자체를 못 박는다 — 값 하나하나가 ARM7 코드에서 나온 것이다.
import { describe, it, expect } from 'vitest'
import {
  ATTACK, DECAY, ENV_FLOOR, SUSTAIN, attackRate, decayRate, envDone, gainOf,
  knobDecibel, releaseEnv, startEnv, stepEnv, sustainLevel,
} from './envelope'
import { DECIBEL_SQUARE } from './tables'

describe('감쇠율 (ARM7 0x2385204)', () => {
  it('127과 126은 특별한 값이다', () => {
    // LDREQ r0, [pc,#0x40] → 0x0000FFFF · MOVEQ r0, #0x3C00
    expect(decayRate(127)).toBe(0xffff)
    expect(decayRate(126)).toBe(0x3c00)
  })

  it('50 미만은 나눗셈이 아니라 2x+1이다', () => {
    // MOVLT r0, r0, LSL #1 · ADDLT r0, r0, #1 — 여기를 `0x1E00/(2x+1)`로
    // 기억하고 있었는데 코드는 그냥 2x+1이다
    expect(decayRate(0)).toBe(1)
    expect(decayRate(1)).toBe(3)
    expect(decayRate(30)).toBe(61)
    expect(decayRate(49)).toBe(99)
  })

  it('50 이상은 0x1E00 ÷ (126 − x)다', () => {
    // RSB r1, r0, #0x7E · MOV r0, #0x1E00 · BL 나눗셈
    expect(decayRate(50)).toBe(Math.floor(0x1e00 / 76))
    expect(decayRate(50)).toBe(101)
    expect(decayRate(100)).toBe(295)
    expect(decayRate(125)).toBe(7680)
  })

  it('50 앞뒤가 이어진다', () => {
    // 99 → 101. 식이 둘인데도 값이 튀지 않는 것이 자리를 맞게 짚었다는 표시다
    expect(decayRate(50) - decayRate(49)).toBeLessThan(5)
  })
})

describe('어택률 (ARM7 0x2384c74)', () => {
  it('109 미만은 255 − a다', () => {
    expect(attackRate(0)).toBe(255)
    expect(attackRate(108)).toBe(147)
  })

  it('109 이상은 표[127 − a]다', () => {
    expect(attackRate(109)).toBe(143)
    expect(attackRate(127)).toBe(0)
  })

  it('이음매가 매끄럽다 — 표가 19칸인 근거다', () => {
    // a=108에서 147, a=109에서 143. 문턱이 109가 아니면 여기가 툭 끊긴다
    expect(attackRate(108) - attackRate(109)).toBe(4)
    for (let a = 1; a < 128; a++) expect(attackRate(a)).toBeLessThan(attackRate(a - 1))
  })
})

describe('데시벨 → 진폭', () => {
  it('0.1dB 단위다 — 표가 round(200·log10 진폭)과 같기 때문이다', () => {
    expect(gainOf(0)).toBeCloseTo(1, 10)
    expect(gainOf(-200)).toBeCloseTo(0.1, 10)
    expect(gainOf(-400)).toBeCloseTo(0.01, 10)
    expect(gainOf(-60)).toBeCloseTo(0.501, 3)
  })

  it('바닥 아래는 무음이다', () => {
    expect(gainOf(-723)).toBe(0)
    expect(gainOf(-10000)).toBe(0)
  })

  it('손잡이 127이 그대로고 64가 절반의 절반쯤이다', () => {
    expect(knobDecibel(127)).toBe(0)
    expect(knobDecibel(64)).toBe(-119)
    expect(knobDecibel(90)).toBe(-60)
    // 제곱표라 손잡이 절반이 진폭 1/4이다
    expect(gainOf(knobDecibel(64))).toBeCloseTo((64 / 127) ** 2, 2)
  })

  it('표가 롬에서 온 것이다 — 닫힌 식과 3칸부터 정확히 같다', () => {
    for (let x = 3; x < 128; x++) {
      expect(DECIBEL_SQUARE[x]).toBe(Math.round(200 * Math.log10((x / 127) ** 2)))
    }
  })
})

describe('상태 기계 (ARM7 0x2384bf4)', () => {
  it('바닥에서 시작한다 — −723 << 7', () => {
    const env = startEnv(0, 0, 127, 0)
    expect(env.value).toBe(ENV_FLOOR)
    expect(ENV_FLOOR).toBe(-92544)
    expect(env.state).toBe(ATTACK)
  })

  it('어택 127은 한 프레임에 꼭대기다', () => {
    // 어택률이 0이면 `-((-v * 0) >> 8)` = 0이라 즉시 감쇠로 넘어간다
    const env = startEnv(127, 127, 127, 127)
    expect(stepEnv(env)).toBe(0)
    expect(env.state).toBe(DECAY)
  })

  it('어택 100은 스무 몇 프레임이다 — 시프트가 8이라서다', () => {
    // 값이 매 프레임 rate/256배로 준다. rate=155이므로
    // ln(92544)/ln(256/155) ≈ 22.8프레임이다. 시프트가 7이면 아예 안 줄고
    // 9면 열 프레임이라 이 범위를 벗어난다
    const env = startEnv(100, 127, 127, 127)
    expect(attackRate(100)).toBe(155)
    let n = 0
    while (env.state === ATTACK && n < 500) { stepEnv(env); n++ }
    expect(n).toBeGreaterThan(19)
    expect(n).toBeLessThan(27)
  })

  it('감쇠는 서스테인에서 멈춘다', () => {
    const env = startEnv(127, 60, 64, 127)
    stepEnv(env)
    expect(env.state).toBe(DECAY)
    let n = 0
    while (env.state === DECAY && n < 100000) { stepEnv(env); n++ }
    expect(env.state).toBe(SUSTAIN)
    expect(env.value).toBe(sustainLevel(64))
    expect(sustainLevel(64)).toBe(-119 << 7)
    // 감쇠율 (2·60+1이 아니라 0x1E00/66)만큼씩 내려온 횟수
    expect(n).toBe(Math.ceil((0 - sustainLevel(64)) / decayRate(60)))
  })

  it('서스테인은 안 움직이고, 놓으면 바닥까지 내려가 끝난다', () => {
    const env = startEnv(127, 127, 127, 100)
    stepEnv(env)
    const held = env.value
    for (let i = 0; i < 50; i++) stepEnv(env)
    expect(env.value).toBe(held)
    expect(envDone(env)).toBe(false)

    releaseEnv(env)
    let n = 0
    while (!envDone(env) && n < 100000) { stepEnv(env); n++ }
    expect(envDone(env)).toBe(true)
    expect(n).toBe(Math.ceil(-ENV_FLOOR / decayRate(100)))
  })
})
