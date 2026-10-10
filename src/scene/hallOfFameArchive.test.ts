import { describe, expect, it } from 'vitest'
import { HOF_ARCHIVE_POSITIONS, HOF_ARCHIVE_PX } from './hallOfFameArchive'

describe('PC 전당 단 여섯 — 원작 좌표', () => {
  it('원작 `spriteCoordinates` 그대로다', () => {
    expect(HOF_ARCHIVE_PX).toEqual([[120, 56], [40, 56], [200, 56], [136, 112], [216, 112], [56, 112]])
  })

  it('윗줄 셋이 안쪽, 아랫줄 셋이 카메라 쪽이다', () => {
    const top = HOF_ARCHIVE_POSITIONS.slice(0, 3).map((p) => p[2])
    const bottom = HOF_ARCHIVE_POSITIONS.slice(3).map((p) => p[2])
    expect(new Set(top).size).toBe(1)
    expect(new Set(bottom).size).toBe(1)
    expect(bottom[0]!).toBeGreaterThan(top[0]!)
  })

  it('아랫줄은 왼쪽에서 5 · 3 · 4 차례로 서고 윗줄보다 오른쪽으로 어긋난다', () => {
    const order = [3, 4, 5].sort((a, b) => HOF_ARCHIVE_POSITIONS[a]![0] - HOF_ARCHIVE_POSITIONS[b]![0])
    expect(order).toEqual([5, 3, 4])
    // 윗줄은 왼쪽에서 1 · 0 · 2 차례다
    const top = [0, 1, 2].sort((a, b) => HOF_ARCHIVE_POSITIONS[a]![0] - HOF_ARCHIVE_POSITIONS[b]![0])
    expect(top).toEqual([1, 0, 2])
    // 어긋남: 윗줄 가운데(0)가 중심보다 왼쪽이고 아랫줄 가운데(3)는 오른쪽이다
    expect(HOF_ARCHIVE_POSITIONS[0]![0]).toBeLessThan(0)
    expect(HOF_ARCHIVE_POSITIONS[3]![0]).toBeGreaterThan(0)
  })

  it('원작 간격 80픽셀이 같은 월드 간격으로 간다', () => {
    const gap = (a: number, b: number): number => HOF_ARCHIVE_POSITIONS[a]![0] - HOF_ARCHIVE_POSITIONS[b]![0]
    expect(gap(0, 1)).toBeCloseTo(gap(2, 0), 6)
    expect(gap(4, 3)).toBeCloseTo(gap(3, 5), 6)
  })
})
