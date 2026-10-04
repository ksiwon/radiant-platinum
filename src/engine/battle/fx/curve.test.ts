import { describe, expect, it } from 'vitest'
import { evalColor, evalCurve, evalGradient, evalKeys, FxRandom, isZeroCurve, stableRandom } from './curve'
import type { Key } from './schema'

describe('유니티 곡선', () => {
  it('기울기 1인 두 키는 직선이다 (에르미트)', () => {
    const keys: Key[] = [[0, 0, 1, 1], [1, 1, 1, 1]]
    for (const t of [0, 0.25, 0.5, 0.9, 1]) expect(evalKeys(keys, t)).toBeCloseTo(t, 6)
  })

  it('기울기 0이면 스무스스텝이다', () => {
    const keys: Key[] = [[0, 0, 0, 0], [1, 1, 0, 0]]
    expect(evalKeys(keys, 0.5)).toBeCloseTo(0.5, 6)
    expect(evalKeys(keys, 0.25)).toBeCloseTo(3 * 0.0625 - 2 * 0.015625, 6)
  })

  it('무한 기울기(null)는 계단이다', () => {
    const keys: Key[] = [[0, 2, null, null], [0.5, 7, null, null]]
    expect(evalKeys(keys, 0.49)).toBe(2)
    expect(evalKeys(keys, 0.6)).toBe(7)
  })

  it('양 끝 밖은 끝값으로 붙든다', () => {
    const keys: Key[] = [[0.2, 3, 0, 0], [0.8, 5, 0, 0]]
    expect(evalKeys(keys, 0)).toBe(3)
    expect(evalKeys(keys, 1)).toBe(5)
  })

  it('MinMaxCurve 네 모드', () => {
    expect(evalCurve({ const: 4 }, 0.3, 0.9)).toBe(4)
    expect(evalCurve({ randMin: 1, randMax: 3 }, 0, 0.5)).toBe(2)
    expect(evalCurve({ curve: [[0, 0, 1, 1], [1, 1, 1, 1]], scalar: 2 }, 0.5, 0)).toBeCloseTo(1, 6)
    expect(evalCurve({ curveMin: [[0, 0, 0, 0]], curveMax: [[0, 10, 0, 0]], scalar: 0.5 }, 0.5, 0.2)).toBeCloseTo(1, 6)
    expect(evalCurve(undefined, 0, 0, 9)).toBe(9)
  })

  it('늘 0인 곡선을 알아본다', () => {
    expect(isZeroCurve({ const: 0 })).toBe(true)
    expect(isZeroCurve({ randMin: 0, randMax: 0 })).toBe(true)
    expect(isZeroCurve({ curve: [[0, 0, 0, 0], [1, 0, 0, 0]], scalar: 3 })).toBe(true)
    expect(isZeroCurve({ const: 0.1 })).toBe(false)
  })
})

describe('그라디언트', () => {
  const g = { colorKeys: [[0, 1, 0, 0], [1, 0, 0, 1]] as const, alphaKeys: [[0, 1], [0.5, 0]] as const }

  it('섞기 모드는 키 사이를 선형으로', () => {
    const c = evalGradient(g, 0.5, [0, 0, 0, 0])
    expect(c[0]).toBeCloseTo(0.5); expect(c[2]).toBeCloseTo(0.5)
    expect(c[3]).toBeCloseTo(0)
    // 마지막 알파 키 뒤는 그 값을 쥔다 (실측: 알파 키가 0.333에서 끝나는 그라디언트가 있다)
    expect(evalGradient(g, 0.9, [0, 0, 0, 0])[3]).toBe(0)
  })

  it('고정 모드는 그 시각 이후 첫 키의 값', () => {
    const f = { ...g, mode: 'fixed' as const }
    expect(evalGradient(f, 0.3, [0, 0, 0, 0])[0]).toBe(0)
    expect(evalGradient(f, 0, [0, 0, 0, 0])[0]).toBe(1)
  })

  it('두 색 사이 무작위', () => {
    const c = evalColor({ randColorMin: [0, 0, 0, 0], randColorMax: [1, 1, 1, 1] }, 0, 0.25, [0, 0, 0, 0])
    expect(c).toEqual([0.25, 0.25, 0.25, 0.25])
  })
})

describe('난수', () => {
  it('같은 씨앗이면 같은 수열', () => {
    const a = new FxRandom(7), b = new FxRandom(7)
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next())
  })

  it('안정 난수는 소금마다 갈린다', () => {
    expect(stableRandom(123, 1)).not.toBe(stableRandom(123, 2))
    expect(stableRandom(123, 1)).toBe(stableRandom(123, 1))
  })
})
