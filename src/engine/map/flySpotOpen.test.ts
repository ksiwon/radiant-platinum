// 센터 스크립트가 여는 날기 자리 — 타운맵의 첫 도착 깃발 (`town_map/context.c`)
import { describe, expect, it } from 'vitest'
import { flySpotOpen } from './spawns'

const FLAG = (n: number): number => 2480 + n
const none = (): boolean => false

describe('센터 스크립트가 여는 날기 자리', () => {
  it('비트도 깃발도 없으면 닫혀 있다', () => {
    for (const spawn of [14, 18, 19]) expect(flySpotOpen(spawn, 0, none)).toBe(false)
  })

  it('리그 남쪽·팔파크·리그 북쪽은 제 깃발이 서면 열린다', () => {
    expect(flySpotOpen(14, 0, (f) => f === FLAG(16))).toBe(true)
    expect(flySpotOpen(18, 0, (f) => f === FLAG(67))).toBe(true)
    expect(flySpotOpen(19, 0, (f) => f === FLAG(68))).toBe(true)
    // 남의 깃발은 안 연다
    expect(flySpotOpen(19, 0, (f) => f === FLAG(16))).toBe(false)
  })

  it('마을은 깃발이 아니라 비트로 열린다', () => {
    expect(flySpotOpen(3, 0, () => true)).toBe(false)
    expect(flySpotOpen(3, 1 << 3, none)).toBe(true)
  })
})
