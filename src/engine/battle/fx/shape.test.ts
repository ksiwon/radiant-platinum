import { describe, expect, it } from 'vitest'
import { FxRandom } from './curve'
import type { ShapeModule } from './schema'
import { pickParam, prepShape, sampleShape } from './shape'

const pos = new Float64Array(3)
const dir = new Float64Array(3)
const ctx = { index: 0, count: 1, time: 0 }

function run(s: ShapeModule, n = 200, seed = 3): { p: number[][]; d: number[][] } {
  const prep = prepShape(s)
  const rng = new FxRandom(seed)
  const p: number[][] = []
  const d: number[][] = []
  for (let i = 0; i < n; i++) {
    sampleShape(s, prep, rng, ctx, pos, dir)
    p.push([...pos]); d.push([...dir])
  }
  return { p, d }
}

describe('모양 모듈', () => {
  it('구 겉면(두께 0)은 반지름 × 모양 크기 위, 방향은 바깥', () => {
    // `eb001_capture` line: 반지름 250 · 크기 0.01 → 2.5
    const { p, d } = run({ type: 0, radius: { value: 250 }, radiusThickness: 0, m_Scale: [0.01, 0.01, 0.01] })
    for (const [i, q] of p.entries()) {
      expect(Math.hypot(q[0]!, q[1]!, q[2]!)).toBeCloseTo(2.5, 6)
      const n = Math.hypot(q[0]!, q[1]!, q[2]!)
      expect(d[i]![0]).toBeCloseTo(q[0]! / n, 6)
    }
  })

  it('구 속(두께 1)은 반지름 안쪽에 퍼진다', () => {
    const { p } = run({ type: 0, radius: { value: 1 }, radiusThickness: 1 }, 500)
    const r = p.map((q) => Math.hypot(q[0]!, q[1]!, q[2]!))
    expect(Math.max(...r)).toBeLessThanOrEqual(1 + 1e-9)
    expect(Math.min(...r)).toBeLessThan(0.5)
  })

  it('반구는 +Z 쪽만', () => {
    const { p } = run({ type: 2, radius: { value: 1 }, radiusThickness: 0 })
    for (const q of p) expect(q[2]).toBeGreaterThanOrEqual(0)
  })

  it('원은 XY 평면, 방향은 바깥쪽', () => {
    const { p, d } = run({ type: 10, radius: { value: 2 }, radiusThickness: 0 })
    for (const [i, q] of p.entries()) {
      expect(q[2]).toBeCloseTo(0, 9)
      expect(Math.hypot(q[0]!, q[1]!)).toBeCloseTo(2, 6)
      expect(d[i]![0]! * q[0]! + d[i]![1]! * q[1]!).toBeCloseTo(2, 6)
    }
  })

  it('한쪽 모서리는 X축 위, 방향 +Y', () => {
    const { p, d } = run({ type: 12, radius: { value: 3 } })
    for (const [i, q] of p.entries()) {
      expect(Math.abs(q[0]!)).toBeLessThanOrEqual(3)
      expect(q[1]).toBe(0)
      expect(d[i]).toEqual([0, 1, 0])
    }
  })

  it('원뿔 테두리는 angle만큼 벌어진다', () => {
    const { d } = run({ type: 4, radius: { value: 1 }, radiusThickness: 0, angle: 30 })
    for (const q of d) expect(Math.acos(q[2]!) * 180 / Math.PI).toBeCloseTo(30, 4)
  })

  it('상자는 크기 안, 방향 +Z', () => {
    const { p, d } = run({ type: 5, m_Scale: [2, 4, 6] })
    for (const [i, q] of p.entries()) {
      expect(Math.abs(q[0]!)).toBeLessThanOrEqual(1); expect(Math.abs(q[1]!)).toBeLessThanOrEqual(2); expect(Math.abs(q[2]!)).toBeLessThanOrEqual(3)
      expect(d[i]![2]).toBeCloseTo(1, 9)
    }
  })

  it('모양 회전은 유니티 오일러(Z→X→Y) — X 90°면 +Z 방향이 −Y가 된다', () => {
    const { d } = run({ type: 18, m_Rotation: [90, 0, 0] }, 5)
    for (const q of d) {
      expect(q[1]).toBeCloseTo(-1, 6)
      expect(q[2]).toBeCloseTo(0, 6)
    }
  })

  it('「버스트에 고르게」는 한 버스트를 고르게 나눈다', () => {
    const rng = new FxRandom(1)
    const got = [0, 1, 2, 3, 4].map((i) => pickParam({ value: 360, mode: 3 }, rng, { index: i, count: 5, time: 0 }))
    expect(got).toEqual([0, 0.2, 0.4, 0.6, 0.8])
  })
})
