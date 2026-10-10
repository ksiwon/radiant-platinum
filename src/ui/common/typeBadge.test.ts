// 타입 그림 (`TypeBadge.tsx`) — 그림이면 글자가 0이고, 없으면 글자 조각 + 경고 한 줄이다.
//
// 이 대체 경로가 굽는 쪽 하나를 빠뜨린 설치본의 빈자리를 **가리므로** (SYSTEM §6.1 ④), 대체할 때 콘솔에 한 줄을
// 남기고 e2e가 그 경고를 0건으로 센다. 경고가 한 번만 나는지도 잰다 — 격자 한 화면이 칸 수십 개를 그린다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpriteSheet } from '../../data/spriteSheet'

let sheet: SpriteSheet | null | undefined = undefined

// 시트 상태를 시험이 쥔다 — 서버 렌더는 효과를 안 돌리므로 훅 자체를 대신한다
vi.mock('./useSheet', () => ({ useSheet: () => sheet }))
vi.mock('../battle/useRomLines', () => ({ useRomLines: () => [] }))

const { TypeBadge, MoveClassBadge } = await import('./TypeBadge')

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el)

describe('타입 그림', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined) })
  afterEach(() => { warn.mockRestore() })

  it('그림이 있으면 innerText가 0이고 title만 단다', () => {
    sheet = { path: 'data/typeIcons.ko.png', cellW: 32, cellH: 16, cols: 1, rows: 18 }
    const out = html(createElement(TypeBadge, { type: 3, name: '독' }))
    expect(out.replace(/<[^>]+>/g, '')).toBe('')
    expect(out).toContain('aria-hidden')
    expect(out).toContain('title="독"')
    // 32×16을 정수 2배로 — 64×32
    expect(out).toContain('width:64px;height:32px')
    // 3번 칸 = 세로로 3 × 16 × 2
    expect(out).toContain('background-position:-0px -96px')
    expect(warn).not.toHaveBeenCalled()
  })

  it('오는 중이면 상자만 서고 경고하지 않는다', () => {
    sheet = undefined
    const out = html(createElement(TypeBadge, { type: 3, name: '독' }))
    expect(out).toContain('width:64px;height:32px')
    expect(out.replace(/<[^>]+>/g, '')).toBe('')
    expect(warn).not.toHaveBeenCalled()
  })

  it('못 받았으면 글자 조각으로 떨어지고 경고를 한 번만 남긴다', () => {
    sheet = null
    const a = html(createElement(TypeBadge, { type: 3, name: '독' }))
    const b = html(createElement(TypeBadge, { type: 10, name: '불꽃' }))
    expect(a.replace(/<[^>]+>/g, '')).toBe('독')
    expect(b.replace(/<[^>]+>/g, '')).toBe('불꽃')
    expect(a).toContain('--tint')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('타입 그림')
  })

  it('타입이 없으면 아무것도 안 그린다', () => {
    sheet = null
    expect(html(createElement(TypeBadge, { type: null }))).toBe('')
  })

  it('분류 그림이 없으면 글만 쓴다 (경고 한 번)', () => {
    sheet = null
    const out = html(createElement(MoveClassBadge, { category: 'physical' }))
    expect(out).toContain('data-move-class="physical"')
    expect(out).not.toContain('background-position')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('분류 그림이 있으면 칸이 물리 0 · 특수 1 · 변화 2다', () => {
    sheet = { path: 'data/moveClass.png', cellW: 32, cellH: 16, cols: 1, rows: 3 }
    const at = (category: 'physical' | 'special' | 'status'): string =>
      /background-position:(-?\d+px -?\d+px)/.exec(html(createElement(MoveClassBadge, { category, scale: 1 })))![1]!
    expect(at('physical')).toBe('-0px -0px')
    expect(at('special')).toBe('-0px -16px')
    expect(at('status')).toBe('-0px -32px')
  })
})
