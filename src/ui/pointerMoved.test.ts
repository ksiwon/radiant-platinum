// 메뉴 줄의 마우스 커서는 움직였을 때만 따라간다 (`pointerMoved.ts`)
import { describe, expect, it } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { pointerMoved } from './pointerMoved'

const ev = (pointerType: string, movementX: number, movementY: number): ReactPointerEvent =>
  ({ pointerType, movementX, movementY }) as unknown as ReactPointerEvent

describe('pointerMoved', () => {
  it('가만히 있는 마우스 밑에 창이 떠서 온 이동(이동량 0)은 사람 것이 아니다', () => {
    expect(pointerMoved(ev('mouse', 0, 0))).toBe(false)
  })
  it('마우스를 실제로 움직이면 따라간다', () => {
    expect(pointerMoved(ev('mouse', 3, 0))).toBe(true)
    expect(pointerMoved(ev('mouse', 0, -1))).toBe(true)
  })
  it('터치 · 펜은 이동량과 상관없이 따라간다', () => {
    expect(pointerMoved(ev('touch', 0, 0))).toBe(true)
    expect(pointerMoved(ev('pen', 0, 0))).toBe(true)
  })
})
