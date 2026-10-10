// `MonViewport`의 2D 떨어지기 쪽 (SYSTEM §2.4) — 정수배와 구멍 한 변 상한.
import { describe, expect, it } from 'vitest'
import { VIEWPORT_MAX, spriteScale } from './MonViewport'
import { pixelCell } from './pixelSprite'

describe('2D 앞모습은 도트 정수배다', () => {
  it('구멍 240이면 3배(240)다 — SYSTEM의 기준', () => {
    expect(spriteScale(240)).toBe(3)
    expect(spriteScale(VIEWPORT_MAX)).toBe(3)
  })

  it('작은 구멍은 한 단씩 낮춘다 (소수 배율은 없다)', () => {
    expect(spriteScale(239)).toBe(2)
    expect(spriteScale(160)).toBe(2)
    expect(spriteScale(159)).toBe(1)
    expect(spriteScale(40)).toBe(1)
  })

  it('앞모습 한 장은 80 × 3 = 240으로 잘린다', () => {
    const sheet = { path: 'data/pokemon/417_front.png', cellW: 80, cellH: 80, cols: 1, rows: 1 }
    expect(pixelCell(sheet, 0, 3)).toEqual({ w: 240, h: 240, x: 0, y: 0, sheetW: 240, sheetH: 240 })
  })

  it('구멍 상한은 320이다', () => {
    expect(VIEWPORT_MAX).toBe(320)
  })
})
