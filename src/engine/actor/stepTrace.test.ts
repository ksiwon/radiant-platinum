// 지나온 칸과 지나온 거리 (PARITY §1.1)
//
// 여기서 재는 것 둘:
//
//   ① 대각선으로 가도 **같은 거리면 같은 걸음**인가 (`stepsFrom`)
//   ② 모서리를 스칠 때 **사이 칸이 빠지지 않는가** (`tilesCrossed`)
//
// ②가 없던 동안 1×1 트리거 114자리를 대각선으로 스쳐 지날 수 있었다 — 판정이
// 「그 틱의 칸 하나」만 봤기 때문이다.
import { describe, expect, it } from 'vitest'
import { StepTrace, stepsFrom, tilesCrossed } from './stepTrace'

const at = (x: number, z: number): string => `${String(x)},${String(z)}`
const list = (t: readonly { x: number, z: number }[]): string[] => t.map((v) => at(v.x, v.z))

describe('지나온 칸', () => {
  it('같은 칸 안에서 움직이면 빈 줄이다', () => {
    expect(tilesCrossed(3.1, 4.1, 3.9, 4.9)).toEqual([])
  })

  it('한 칸을 넘으면 그 칸 하나', () => {
    expect(list(tilesCrossed(3.9, 4.5, 4.1, 4.5))).toEqual([at(4, 4)])
  })

  it('곧게 세 칸을 지나면 셋이 차례대로 나온다', () => {
    expect(list(tilesCrossed(3.5, 4.5, 6.5, 4.5))).toEqual([at(4, 4), at(5, 4), at(6, 4)])
  })

  // ⚠️ **이 줄이 §4의 요점이다.** x와 z 경계를 한 틱에 같이 넘으면 가운데 칸은
  // 판정 자체가 안 돌았다 — 1×1 트리거가 거기 있으면 그대로 새 나간다
  it('⚠️ 대각선으로 모서리를 지나면 사이 칸이 담긴다', () => {
    const got = list(tilesCrossed(3.9, 4.9, 4.1, 5.1))
    expect(got).toHaveLength(2)
    expect(got[got.length - 1]).toBe(at(4, 5))
    // 사이 칸은 (4,4)이거나 (3,5)다. 어느 쪽이든 **하나는 거친다**
    expect([at(4, 4), at(3, 5)]).toContain(got[0])
  })

  it('뒤로 가도 차례가 맞는다', () => {
    expect(list(tilesCrossed(6.5, 4.5, 3.5, 4.5))).toEqual([at(5, 4), at(4, 4), at(3, 4)])
  })

  it('⚠️ 멀리 옮겨지면 사이를 버리고 닿은 칸 하나만 낸다 — 워프는 걸은 것이 아니다', () => {
    expect(list(tilesCrossed(3.5, 4.5, 90.5, 4.5))).toEqual([at(90, 4)])
  })

  it('한 칸을 두 번 담지 않는다', () => {
    const got = list(tilesCrossed(3.5, 4.5, 7.5, 8.5))
    expect(new Set(got).size).toBe(got.length)
  })
})

describe('걸음은 거리로 센다', () => {
  it('한 칸이 한 걸음이다', () => {
    expect(stepsFrom(0.99)).toBe(0)
    expect(stepsFrom(1)).toBe(1)
    expect(stepsFrom(3.7)).toBe(3)
  })

  /** 한 틱에 `d`만큼, `n`틱 */
  const walk = (dx: number, dz: number, ticks: number): number => {
    const trace = new StepTrace()
    trace.reset(100.5, 100.5)
    let x = 100.5, z = 100.5
    let steps = 0
    for (let i = 0; i < ticks; i++) {
      x += dx
      z += dz
      steps += trace.advance(x, z).steps
    }
    return steps
  }

  // ⚠️ **이것이 1.444를 1.00으로 되돌리는 줄이다.** 예전에는 칸이 바뀔 때마다
  // 셌으므로 45도로 가면 같은 거리에 √2배가 세어졌다
  it('⚠️ 대각선도 직선도 같은 거리면 같은 걸음이다', () => {
    const d = 0.094 // 달릴 때 한 틱에 축마다 가는 거리
    const straight = walk(d * Math.SQRT2, 0, 200)
    const diagonal = walk(d, d, 200)
    expect(diagonal).toBe(straight)
  })

  // ⚠️ 한 틱 폭을 2의 거듭제곱 나눔으로 잡는다. 0.1을 200번 더하면
  // 19.999999999999996이라 **뜬 소수 때문에** 열아홉 걸음이 된다 — 재려는 것이
  // 그 오차가 아니므로 잣대를 그쪽으로 옮기지 않는다
  it('스무 칸을 곧게 가면 스무 걸음이다', () => {
    expect(walk(0.125, 0, 160)).toBe(20)
  })

  it('제자리에서 흔들면 걸음이 안 난다', () => {
    const trace = new StepTrace()
    trace.reset(10.5, 10.5)
    let steps = 0
    for (let i = 0; i < 50; i++) {
      steps += trace.advance(10.5 + (i % 2) * 0.001, 10.5).steps
    }
    expect(steps).toBe(0)
  })
})

describe('처음과 워프', () => {
  it('첫 부름은 빈 줄에 걸음 0이다 — 맵에 막 들어선 칸은 지나온 것이 아니다', () => {
    const trace = new StepTrace()
    const got = trace.advance(5.5, 6.5)
    expect(got.tiles).toEqual([])
    expect(got.steps).toBe(0)
  })

  it('⚠️ 워프 다음 틱은 빈 줄이다', () => {
    const trace = new StepTrace()
    trace.reset(5.5, 6.5)
    trace.advance(5.6, 6.5)
    trace.reset(300.5, 400.5)
    const got = trace.advance(300.5, 400.5)
    expect(got.tiles).toEqual([])
    expect(got.steps).toBe(0)
  })

  it('⚠️ 옮겨진 거리는 걸음으로 안 센다', () => {
    const trace = new StepTrace()
    trace.reset(5.5, 6.5)
    const got = trace.advance(300.5, 6.5)
    expect(got.steps).toBe(0)
    expect(list(got.tiles)).toEqual([at(300, 6)])
  })
})
