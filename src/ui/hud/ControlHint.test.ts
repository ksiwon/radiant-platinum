// 화면 구석의 조작 알약 (`ControlHint.tsx`) — 여는 키가 적히고, 창이 배경에 안 휘둘린다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LEGEND_TOGGLE } from '../../engine/input/controlLegend'
import { keyLabel } from '../../engine/input/keyNames'
import { vars } from '../theme/contract.css'
import { WINDOW_SMALL } from '../theme/window.css'
import { ControlHint, chipLabel } from './ControlHint'
import { CHIP, CHIP_LIT } from './controlHint.css'

describe('알약 글자 — 여는 키를 적는다 (I-p01-14)', () => {
  it('「조작 ?」가 아니라 여는 키의 이름이 붙는다', () => {
    expect(chipLabel('ko')).toBe('조작 [G]')
    expect(chipLabel('en')).toBe('Controls [G]')
    expect(chipLabel('ja')).toBe('そうさ [G]')
    expect(chipLabel('ko')).not.toContain('?')
  })

  it('키는 손으로 적지 않는다 — LEGEND_TOGGLE의 첫 키를 keyLabel로 읽은 것이다', () => {
    const first = LEGEND_TOGGLE[0] ?? ''
    expect(chipLabel('ko')).toContain(`[${keyLabel(first)}]`)
    // 둘째 키(F1)는 덤이라 알약에 늘어놓지 않는다
    expect(chipLabel('ko')).not.toContain('F1')
  })

  it('설정에 없는 언어는 한국어로 떨어진다', () => {
    expect(chipLabel('xx')).toBe(chipLabel('ko'))
  })

  it('그린 단추에 그 글자와 두 키가 다 실린다', () => {
    const html = renderToStaticMarkup(createElement(ControlHint))
    expect(html).toContain('>조작 [G]</button>')
    expect(html).toContain('aria-keyshortcuts="G F1"')
  })
})

describe('알약 살갗 — 창 바탕이 비치지 않는다 (I-p01-14 · I-p15-13)', () => {
  it('창 전체를 흐리게 하지 않는다 — opacity가 없다', () => {
    expect('opacity' in CHIP).toBe(false)
    expect('opacity' in CHIP_LIT).toBe(false)
  })

  it('바탕은 작은 창 그대로다 — 밑색까지 깔려 뒤의 장면이 안 비친다', () => {
    expect(CHIP.background).toBe(WINDOW_SMALL.background)
    expect(CHIP.backgroundColor).toBe(vars.window.faceMid)
    expect(CHIP.border).toBe(WINDOW_SMALL.border)
  })

  it('흐림은 글자색이 맡고, 손이 오면 또렷한 글자로 바뀐다', () => {
    expect(CHIP.color).toBe(vars.ink.dim)
    expect(CHIP_LIT.color).toBe(vars.ink.strong)
  })

  it('단추가 브라우저 기본 글꼴로 떨어지지 않는다', () => {
    expect(CHIP.font).toBe('inherit')
  })
})
