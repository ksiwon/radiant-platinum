// 버그 제보 창의 Esc (`BugReport.tsx`의 `escClosesForm` · `BUG_HINT`)
//
// 창이 뜨면 첫 칸에 포커스가 가는데, `useMenuKeys`가 글자 칸으로 간 키를 통째로
// 비켜 주어서 안내의 「X·Esc 닫기」가 둘 다 안 먹었다. 폼이 Esc만 따로 받고, 안내는
// 칸 안에서도 맞는 말만 적는다
import { describe, expect, it } from 'vitest'
import { BUG_HINT, escClosesForm } from './BugReport'

describe('폼 안의 Esc', () => {
  it('입력칸에 포커스가 있어도 Esc는 닫는다', () => {
    expect(escClosesForm('Escape', false, false, 'idle')).toBe(true)
    expect(escClosesForm('Escape', false, false, 'fail')).toBe(true)
  })

  it('보내는 중에는 안 닫는다 — 갔는지 모르게 된다', () => {
    expect(escClosesForm('Escape', false, false, 'sending')).toBe(false)
  })

  it('한글 조합 중의 Esc는 조합만 끝낸다', () => {
    expect(escClosesForm('Escape', true, false, 'idle')).toBe(false)
  })

  it('누르고 있어 다시 온 Esc는 안 받는다 — 물러나기는 새로 누른 것만', () => {
    expect(escClosesForm('Escape', false, true, 'idle')).toBe(false)
  })

  it('X는 글자다 — 칸 안에서 창을 닫지 않는다', () => {
    expect(escClosesForm('x', false, false, 'idle')).toBe(false)
    expect(escClosesForm('X', false, false, 'idle')).toBe(false)
    expect(escClosesForm('Backspace', false, false, 'idle')).toBe(false)
  })
})

describe('안내', () => {
  it('칸 안에서 안 듣는 X를 적지 않고, 적은 글이 사라진다고 말한다', () => {
    expect(BUG_HINT).toBe('Esc 닫기 (적은 글은 사라집니다)')
    expect(BUG_HINT).not.toMatch(/X/)
  })
})
