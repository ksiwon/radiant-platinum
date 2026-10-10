// 상태 이상 딱지 (`StatusTag.tsx`) — 세 벌이던 `STATUS_LABEL`을 한 곳으로 모았다.
//
// 「두 화면에서 같은 상태가 같은 낱말이어야 한다」는 주석이 세 군데 옆에 있었다. 주석은 그것을 못 지킨다 —
// 여기서 낱말 표와 고르는 차례를 잠근다. 포켓러스는 상태가 없을 때만 붙는다 (`StatusIconAnimIdx`).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { STATUS_VARS } from '../theme/window.css'
import { STATUS_LABEL, StatusTag, statusKey } from './StatusTag'

describe('낱말', () => {
  it('롬 낱말이다 — 잠듦 · 독 · 맹독 · 화상 · 얼음 · 마비 · 기절', () => {
    expect(STATUS_LABEL).toMatchObject({
      slp: '잠듦', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비', fnt: '기절', ko: '기절',
    })
  })

  it('낱말이 있는 상태는 모두 색 셋(STATUS_VARS)도 있다', () => {
    for (const key of Object.keys(STATUS_LABEL)) expect(STATUS_VARS[key], key).toBeDefined()
  })
})

describe('어느 딱지를 그리나', () => {
  it('기절이 먼저다', () => {
    expect(statusKey('psn', true, true)).toBe('fnt')
  })

  it('상태 이상이 포켓러스보다 먼저다', () => {
    expect(statusKey('brn', false, true)).toBe('brn')
  })

  it('포켓러스는 상태가 없을 때만 붙는다', () => {
    expect(statusKey(null, false, true)).toBe('pkrs')
    expect(statusKey('ok', false, true)).toBe('pkrs')
    expect(statusKey(undefined, false, true)).toBe('pkrs')
    expect(statusKey('ok', false, false)).toBeNull()
  })
})

describe('그린 것', () => {
  it('없으면 아무것도 안 그린다', () => {
    expect(renderToStaticMarkup(createElement(StatusTag, { status: 'ok' }))).toBe('')
    expect(renderToStaticMarkup(createElement(StatusTag, {}))).toBe('')
  })

  it('낱말이 글자로 나온다', () => {
    expect(renderToStaticMarkup(createElement(StatusTag, { status: 'par' }))).toContain('>마비<')
    expect(renderToStaticMarkup(createElement(StatusTag, { fainted: true }))).toContain('>기절<')
    expect(renderToStaticMarkup(createElement(StatusTag, { pkrs: true }))).toContain('>포켓루스<')
  })
})
