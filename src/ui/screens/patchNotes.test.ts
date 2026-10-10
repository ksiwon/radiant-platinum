// 패치노트 창 — 갈래별 건수는 `items`를 세어 낸다 (판의 얼굴 맨 아래 줄)
import { describe, expect, it } from 'vitest'
import { kindCounts } from './PatchNotes'
import { NOTES } from './patchLog'

describe('갈래별 건수', () => {
  it('추가 · 변경 · 수정 차례로 세고 0건은 적지 않는다', () => {
    expect(kindCounts([{ kind: 'fix' }, { kind: 'add' }, { kind: 'fix' }, { kind: 'change' }]))
      .toBe('추가 1 · 변경 1 · 수정 2')
    expect(kindCounts([{ kind: 'add' }, { kind: 'add' }])).toBe('추가 2')
    expect(kindCounts([])).toBe('')
  })

  it('모든 판의 건수 합이 줄 수와 같다 — 어느 갈래도 안 새는다', () => {
    for (const note of NOTES) {
      const total = kindCounts(note.items).split(' · ').reduce((n, part) => n + Number(part.split(' ')[1]), 0)
      expect(total, note.v).toBe(note.items.length)
    }
  })
})
