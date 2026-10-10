// 기술 배우기 상태 기계 (`learnFlow.ts`) — 배틀과 진화가 **한 벌**을 쓴다 (SYSTEM 4.19).
//
// 원작 `SEQ_GET_EXP_*`의 차례:
//
//   ask  ─예→ pick  ─칸→ 답(i)
//    │            └─그만둔다 · X→ wellThen ─→ confirmGiveUp ─포기→ 답(null)
//    └─아니오→ wellThen                          └─포기하지 않는다 · X→ ask
//
// 껍데기가 뿌리에 `data-learn-stage` · `data-learn-new`를 달고, 하네스(`drive.mjs`)가 글이 아니라 그 속성으로 단을
// 읽는다 — 그래서 이 이름과 값이 **계약**이다.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LearnMove } from '../battle/LearnMove'
import { afterAsk, afterConfirm, afterWellThen, pickAt, type LearnSlot } from './learnFlow'

// 롬 글은 안 받는다 — 단과 속성만 잰다
vi.mock('../../data/gameData', async (orig) => ({
  ...(await orig<typeof import('../../data/gameData')>()),
  loadDialogueBank: () => Promise.resolve([]),
}))

const SLOTS: LearnSlot[] = [
  { move: 33, pp: 35, maxPp: 35 },
  { move: 45, pp: 40, maxPp: 40 },
  { move: 73, pp: 10, maxPp: 10 },
  { move: 98, pp: 30, maxPp: 30 },
]

describe('차례', () => {
  it('첫 물음: 예면 고르러 가고 아니오면 「그럼...」으로 물러선다', () => {
    expect(afterAsk(true)).toBe('pick')
    expect(afterAsk(false)).toBe('wellThen')
  })

  it('「그럼...」 다음은 늘 포기 확인이다', () => {
    expect(afterWellThen()).toBe('confirmGiveUp')
  })

  it('포기하면 안 배운다(null)고 답하고, 안 하면 처음 물음으로 돌아간다', () => {
    expect(afterConfirm(true)).toEqual({ answer: null })
    expect(afterConfirm(false)).toEqual({ stage: 'ask' })
  })
})

describe('잊을 칸을 눌렀다', () => {
  it('기술 칸이면 그 번호로 답한다', () => {
    for (let i = 0; i < 4; i++) expect(pickAt(i, SLOTS)).toEqual({ kind: 'forget', index: i })
  })

  it('다섯째(꼬리) 칸은 그만둔다다', () => {
    expect(pickAt(4, SLOTS)).toEqual({ kind: 'cancel' })
  })

  it('비전기술은 까닭을 띄우고 답하지 않는다', () => {
    const lock = (move: number): string | null => (move === 73 ? '중요한 기술입니다.' : null)
    expect(pickAt(2, SLOTS, lock)).toEqual({ kind: 'refused', why: '중요한 기술입니다.' })
    expect(pickAt(1, SLOTS, lock)).toEqual({ kind: 'forget', index: 1 })
  })

  it('빈 칸은 목록에서 빠진다 — 꼬리의 번호는 기술 수다', () => {
    const rows = SLOTS.slice(0, 2).filter((s) => s.move !== null)
    expect(pickAt(2, rows)).toEqual({ kind: 'cancel' })
  })
})

describe('껍데기 뿌리의 계약', () => {
  const html = (): string => renderToStaticMarkup(createElement(LearnMove, {
    move: 57,
    who: '모부기',
    slots: SLOTS,
    moveName: (id: number) => `기술${String(id)}`,
    moveData: () => undefined,
    typeName: () => undefined,
    onAnswer: () => undefined,
  }))

  it('처음에는 ask 단이고 새 기술 번호가 data-learn-new다', () => {
    const out = html()
    expect(out).toContain('data-learn-stage="ask"')
    expect(out).toContain('data-learn-new="57"')
  })

  it('뿌리는 display: contents라 칸 배치를 안 바꾼다 — 자식은 명령 목록의 줄이다', () => {
    // 클래스 이름은 해시라 그 이름이 learnRoot인지는 소스로 본다
    const css = new URL('../battle/command.css.ts', import.meta.url)
    expect(readFileSync(css, 'utf8')).toContain("learnRoot = style({ display: 'contents' })")
  })
})
