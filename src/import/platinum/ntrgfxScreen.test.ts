// 넓은 배치는 **화면 블록 차례**다 (`screenCell` · REPAIR §132)
//
// DS 글 BG의 VRAM은 32×32칸 블록 단위라 512×256 배치는 왼쪽 판 1024칸 뒤에 오른쪽 판이 온다
import { describe, expect, it } from 'vitest'
import { screenCell } from './ntrgfx'

describe('화면 블록 차례', () => {
  it('512×256 — 오른쪽 판은 1024칸 뒤에 있다', () => {
    const cells = Array.from({ length: 64 * 32 }, (_, i) => i)
    const scr = { width: 64, height: 32, cells }
    expect(screenCell(scr, 0, 0)).toBe(0)
    expect(screenCell(scr, 31, 0)).toBe(31)
    expect(screenCell(scr, 0, 1)).toBe(32)
    expect(screenCell(scr, 32, 0)).toBe(1024)
    expect(screenCell(scr, 33, 2)).toBe(1024 + 2 * 32 + 1)
  })

  it('256 이하 폭은 한 줄 읽기와 같다', () => {
    const cells = Array.from({ length: 28 * 20 }, (_, i) => i)
    const scr = { width: 28, height: 20, cells }
    expect(screenCell(scr, 5, 3)).toBe(3 * 28 + 5)
  })

  it('512×512 — 네 판이 왼위 · 오른위 · 왼아래 · 오른아래 차례다', () => {
    const cells = Array.from({ length: 64 * 64 }, (_, i) => i)
    const scr = { width: 64, height: 64, cells }
    expect(screenCell(scr, 0, 32)).toBe(2048)
    expect(screenCell(scr, 32, 32)).toBe(3072)
  })
})
