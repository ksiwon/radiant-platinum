// 갈래 창 · 레벨업 창의 자리 (`partyPlace.ts`) — 이웃 판의 이름과 HP를 덮지 않는다
import { describe, expect, it } from 'vitest'
import { choiceHeight, INSET, placeInColumn } from './partyPlace'

// 본문 954×540, 판 450×150. 왼쪽 열 x16, 오른쪽 열 x488, 줄 위 26 · 188 · 350 (오른쪽은 24 아래)
const bounds = { left: 0, top: 0, width: 954, height: 540 }
const left = (row: number) => ({ left: 16, top: 26 + row * 162, width: 450, height: 150 })
const right = (row: number) => ({ left: 488, top: 50 + row * 162, width: 450, height: 150 })
const size = { width: 220, height: 6 * 32 + 22 }

describe('고른 판이 선 열 안에 앉는다', () => {
  it('왼쪽 열 판이면 그 판의 오른쪽 끝에 맞춘다', () => {
    const at = placeInColumn(left(0), size, bounds)
    expect(at.left).toBe(16 + 450 - 220 - INSET)
    // 이웃 열(x488~)에 안 걸친다
    expect(at.left + size.width).toBeLessThanOrEqual(488)
  })

  it('오른쪽 열 판이면 그 열 안이고 왼쪽 열 판(x16~466)에 안 걸친다', () => {
    const at = placeInColumn(right(1), size, bounds)
    expect(at.left).toBe(488 + 450 - 220 - INSET)
    expect(at.left).toBeGreaterThanOrEqual(466)
  })

  it('판 가운데에 세로로 맞춘다', () => {
    const plate = left(1)
    const at = placeInColumn(plate, size, bounds)
    expect(at.top + size.height / 2).toBeCloseTo(plate.top + plate.height / 2, 5)
  })

  it('본문 위 · 아래 끝에서 당긴다', () => {
    const top = placeInColumn(left(0), { width: 220, height: 300 }, bounds)
    expect(top.top).toBeGreaterThanOrEqual(0)
    const bottom = placeInColumn(right(2), { width: 220, height: 300 }, bounds)
    expect(bottom.top + 300).toBeLessThanOrEqual(540)
  })

  it('본문보다 좁은 창이면 왼쪽 끝에서 당긴다', () => {
    const at = placeInColumn(left(0), { width: 220, height: 100 }, { left: 0, top: 0, width: 300, height: 540 })
    expect(at.left).toBeGreaterThanOrEqual(0)
    expect(at.left + 220).toBeLessThanOrEqual(300)
  })
})

describe('이웃 판의 글을 덮지 않는다', () => {
  // 판의 띠는 위에서 27~123이다. 글(이름 · HP · 숫자)은 그 안에 있다
  const RIBBON = { top: 27, bottom: 123 }

  it('여섯 줄 갈래: 같은 열의 위아래 판의 띠에 닿지 않는다', () => {
    for (let row = 0; row < 3; row++) {
      const plate = left(row)
      const at = placeInColumn(plate, size, bounds)
      const above = row > 0 ? left(row - 1) : null
      const below = row < 2 ? left(row + 1) : null
      if (above) expect(at.top).toBeGreaterThanOrEqual(above.top + RIBBON.bottom)
      if (below) expect(at.top + size.height).toBeLessThanOrEqual(below.top + RIBBON.top)
    }
  })
})

describe('갈래 창 높이 어림', () => {
  it('줄 수 × 줄 높이 + 창 안 여백과 테두리', () => {
    expect(choiceHeight(6, 32, 8, 3)).toBe(6 * 32 + 22)
    expect(choiceHeight(2, 32, 8, 3)).toBe(2 * 32 + 22)
  })
})
