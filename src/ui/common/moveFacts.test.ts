// 기술 정보 (`MoveFacts.tsx` · `MoveLine.tsx`) — 값 없음 표시와 줄의 모양.
//
// 원작 규칙 (롬 3:50 · 요약 455:154):
//   위력 ≤ 1 → 「---」   (`PrintBattleMoveAttributes`의 조건이 `<= 1`이다. 우리가 `> 0`으로 쓰고 「???」를 찍었다)
//   명중 0   → 「---」   (명중 판정을 안 하는 기술)
// 「필중」 같은 지은 말은 쓰지 않는다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { accuracyText, describeMove, MoveFacts, powerText } from './MoveFacts'
import { MoveLine } from './MoveLine'

// 롬 글을 안 받는 시험이다 — 이름표는 비고 값만 선다
vi.mock('../../data/uiText', async (orig) => ({
  ...(await orig<typeof import('../../data/uiText')>()),
  loadUiText: () => Promise.resolve([]),
}))
vi.mock('../../data/gameData', async (orig) => ({
  ...(await orig<typeof import('../../data/gameData')>()),
  loadDialogueBank: () => Promise.resolve([]),
  loadTypeIcons: () => Promise.resolve(null),
  loadMoveClass: () => Promise.resolve(null),
}))

describe('값 없음', () => {
  it('위력 0과 1은 값이 없다', () => {
    expect(powerText(0)).toBeNull()
    expect(powerText(1)).toBeNull()
    expect(powerText(2)).toBe('2')
    expect(powerText(40)).toBe('40')
  })

  it('명중 0은 값이 없다', () => {
    expect(accuracyText(0)).toBeNull()
    expect(accuracyText(100)).toBe('100')
    expect(accuracyText(35)).toBe('35')
  })

  it('설명의 줄바꿈은 공백으로 잇는다', () => {
    expect(describeMove('상대를 세게\n때린다.')).toBe('상대를 세게 때린다.')
    expect(describeMove('한 줄\r\n  두 줄 \f세 줄')).toBe('한 줄 두 줄 세 줄')
    expect(describeMove('')).toBe('')
  })
})

describe('MoveFacts', () => {
  const move = { id: 33, category: 'physical' as const, power: 40, accuracy: 100, pp: 35 }

  it('값을 그린다 — 위력 · 명중 · PP', () => {
    const html = renderToStaticMarkup(createElement(MoveFacts, { move, layout: 'row' }))
    for (const value of ['40', '100', '35']) expect(html).toContain(`>${value}<`)
  })

  it('위력 없는 기술은 「---」다 — 「???」나 「필중」이 아니다', () => {
    const html = renderToStaticMarkup(createElement(MoveFacts, {
      move: { ...move, category: 'status' as const, power: 0, accuracy: 0 }, layout: 'column',
    }))
    expect(html.match(/>---</g)).toHaveLength(2)
    expect(html).not.toContain('???')
    expect(html).not.toContain('필중')
  })
})

describe('MoveLine', () => {
  const tackle = { id: 33, name: '몸통박치기', type: 0, power: 40, accuracy: 100 }

  it('기본은 div다', () => {
    const html = renderToStaticMarkup(createElement(MoveLine, { move: tackle, cols: ['power', 'acc'] }))
    expect(html.startsWith('<div')).toBe(true)
    expect(html).toContain('몸통박치기')
    expect(html).toContain('>40<')
    expect(html).toContain('>100<')
  })

  it('button이 되면 PP를 n/n으로 쓴다 — 하네스 forgetPick이 이 글자를 읽는다', () => {
    const html = renderToStaticMarkup(createElement(MoveLine, {
      move: tackle, cols: ['pp'], pp: 12, maxPp: 35, as: 'button', dataMoveId: 33,
    }))
    expect(html.startsWith('<button')).toBe(true)
    expect(html).toContain('>12/35<')
    expect(html).toContain('data-move-id="33"')
  })

  it('위력 ≤ 1이면 「---」다', () => {
    const html = renderToStaticMarkup(createElement(MoveLine, {
      move: { ...tackle, power: 1, accuracy: 0 }, cols: ['power', 'acc'],
    }))
    expect(html.match(/>---</g)).toHaveLength(2)
  })

  it('빈 칸은 이름 「—」과 숫자 「--」다', () => {
    const html = renderToStaticMarkup(createElement(MoveLine, { move: null, empty: true, cols: ['power', 'pp'] }))
    expect(html).toContain('>—<')
    expect(html.match(/>--</g)).toHaveLength(2)
  })

  it('타입 그림은 글자 0이다 — 줄의 첫 글은 기술 이름이다', () => {
    const html = renderToStaticMarkup(createElement(MoveLine, { move: tackle, cols: [] }))
    // TypeBadge는 aria-hidden 빈 span이다 (시트가 오기 전)
    const text = html.replace(/<[^>]+>/g, '')
    expect(text).toBe('몸통박치기')
  })
})
