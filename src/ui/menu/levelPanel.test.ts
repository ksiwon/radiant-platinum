// 레벨업 능력치 창 (`LevelPanel.tsx`) — 파티 화면의 이상한사탕과 배틀 레벨업이 같이 쓴다
//
// 원작 두 창(`PartyMenu_DrawLevelUpStatIncreases` · `SEQ_GET_EXP_LEVEL_UP_SUMMARY_PRINT_DIFF`)은
// 같은 차례로 여섯 줄을 적고, 먼저 오른 폭을 「+n」으로, 다음에 새 값을 적는다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Stats } from '../../data/schema'
import { LevelPanel, levelPanelRows } from './LevelPanel'

// 스스로 받는 길은 이 시험에서 안 탄다 — 글을 넘겨 준다
vi.mock('../../data/uiText', async (orig) => ({
  ...(await orig<typeof import('../../data/uiText')>()),
  loadUiText: () => Promise.resolve([]),
}))

/** 파티 뱅크(453)의 그 자리만 롬 글 그대로 채운 표 (`dialogue/ko/453.json` 185~192) */
const TEXT: string[] = []
;['최대HP', '공격', '방어', '특수공격', '특수방어', '스피드'].forEach((name, i) => { TEXT[185 + i] = name })
TEXT[191] = '+{STRVAR_1 52, 0, 0}'
TEXT[192] = '{STRVAR_1 52, 0, 0}'

const before: Stats = { hp: 20, atk: 11, def: 10, spa: 12, spd: 9, spe: 13 }
const after: Stats = { hp: 23, atk: 12, def: 12, spa: 14, spd: 10, spe: 15 }

describe('여섯 줄', () => {
  it('차례가 최대HP · 공격 · 방어 · 특수공격 · 특수방어 · 스피드다 (스피드가 맨 끝)', () => {
    expect(levelPanelRows(before, after, 'gain', TEXT).map((r) => r.label))
      .toEqual(['최대HP', '공격', '방어', '특수공격', '특수방어', '스피드'])
    expect(levelPanelRows(before, after, 'gain', TEXT).map((r) => r.key))
      .toEqual(['hp', 'atk', 'def', 'spa', 'spd', 'spe'])
  })

  it('먼저 오른 폭을 「+n」으로 적는다', () => {
    expect(levelPanelRows(before, after, 'gain', TEXT).map((r) => r.value))
      .toEqual(['+3', '+1', '+2', '+2', '+1', '+2'])
  })

  it('다음에 새 값을 적는다', () => {
    expect(levelPanelRows(before, after, 'value', TEXT).map((r) => r.value))
      .toEqual(['23', '12', '12', '14', '10', '15'])
  })

  it('안 오른 능력치는 +0이다 — 줄을 빼지 않는다', () => {
    const same = levelPanelRows(before, { ...after, def: before.def }, 'gain', TEXT)
    expect(same).toHaveLength(6)
    expect(same[2]?.value).toBe('+0')
  })
})

describe('그리기', () => {
  it('넘겨 준 글로 여섯 줄을 그리고, 어느 쪽인지 표시를 단다', () => {
    const html = renderToStaticMarkup(createElement(LevelPanel, { before, after, show: 'gain', text: TEXT }))
    expect(html).toContain('data-level-panel="gain"')
    for (const name of ['최대HP', '공격', '방어', '특수공격', '특수방어', '스피드']) expect(html).toContain(name)
    expect(html).toContain('+3')
  })

  it('자리는 부르는 쪽이 준다', () => {
    const html = renderToStaticMarkup(createElement(LevelPanel, {
      before, after, show: 'value', text: TEXT, className: 'battleCorner',
    }))
    expect(html).toContain('class="battleCorner"')
    expect(html).toContain('data-level-panel="value"')
  })
})
