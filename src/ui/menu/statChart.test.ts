// 능력 육각형 (`StatChart.tsx`) — 꼭짓점 차례 · 바깥 고리 = 이 마리의 최댓값 · 0이면 가운데
import { describe, expect, it } from 'vitest'
import { CHART_ORDER, hexPoints, toPoints } from './StatChart'

const CX = 150
const CY = 110
const R = 96

describe('꼭짓점', () => {
  it('차례가 위부터 시계 방향으로 HP · 공격 · 방어 · 스피드 · 특수방어 · 특수공격이다', () => {
    expect(CHART_ORDER).toEqual(['hp', 'atk', 'def', 'spe', 'spd', 'spa'])
  })

  it('최댓값이 바깥 고리 — 모두 최댓값이면 반지름 R의 정육각형이다', () => {
    const at = hexPoints([100, 100, 100, 100, 100, 100], 100, CX, CY, R)
    for (const p of at) expect(Math.hypot(p.x - CX, p.y - CY)).toBeCloseTo(R, 6)
  })

  it('첫 꼭짓점이 위, 둘째가 오른쪽 위, 넷째가 아래다', () => {
    const at = hexPoints([1, 1, 1, 1, 1, 1], 1, CX, CY, R)
    expect(at[0]!.x).toBeCloseTo(CX, 6)
    expect(at[0]!.y).toBeCloseTo(CY - R, 6)
    expect(at[1]!.x).toBeGreaterThan(CX)
    expect(at[1]!.y).toBeLessThan(CY)
    expect(at[3]!.x).toBeCloseTo(CX, 6)
    expect(at[3]!.y).toBeCloseTo(CY + R, 6)
    // 왼쪽 둘은 가운데보다 왼쪽이다
    expect(at[4]!.x).toBeLessThan(CX)
    expect(at[5]!.x).toBeLessThan(CX)
  })

  it('값이 절반이면 반지름도 절반이다 — 눈금은 마리의 최댓값 기준이다', () => {
    const at = hexPoints([122, 61, 0, 0, 0, 0], 122, CX, CY, R)
    expect(Math.hypot(at[0]!.x - CX, at[0]!.y - CY)).toBeCloseTo(R, 6)
    expect(Math.hypot(at[1]!.x - CX, at[1]!.y - CY)).toBeCloseTo(R / 2, 6)
  })

  it('낮은 레벨도 오그라들지 않는다 — 5레벨 능력(10~20)도 최댓값이 바깥 고리다', () => {
    const at = hexPoints([20, 12, 10, 11, 10, 10], 20, CX, CY, R)
    expect(Math.hypot(at[0]!.x - CX, at[0]!.y - CY)).toBeCloseTo(R, 6)
  })

  it('0이면 가운데다. 최댓값이 0이어도 가운데다', () => {
    for (const p of hexPoints([0, 0, 0, 0, 0, 0], 0, CX, CY, R)) {
      expect(p.x).toBeCloseTo(CX, 6)
      expect(p.y).toBeCloseTo(CY, 6)
    }
    const one = hexPoints([0, 50, 50, 50, 50, 50], 50, CX, CY, R)
    expect(one[0]).toEqual({ x: CX, y: CY })
  })

  it('최댓값보다 큰 값은 바깥 고리에서 멈춘다', () => {
    const at = hexPoints([300, 0, 0, 0, 0, 0], 100, CX, CY, R)
    expect(Math.hypot(at[0]!.x - CX, at[0]!.y - CY)).toBeCloseTo(R, 6)
  })
})

describe('SVG 점 문자열', () => {
  it('소수 첫째 자리까지, 공백으로 잇는다', () => {
    expect(toPoints([{ x: 1.234, y: 5 }, { x: 0, y: 2.25 }])).toBe('1.2,5.0 0.0,2.3')
  })
})
