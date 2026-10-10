// 요약 기술 쪽의 줄 모델 (`summaryMoves.ts`) — 빈 칸 · 가르침 줄 · 「---」
import { describe, expect, it } from 'vitest'
import { CLASS_LINE } from '../common/TypeBadge'
import { PARTY } from '../battle/romText'
import { accuracyOf, MOVE_SLOTS, moveRows, powerOf } from './summaryMoves'

describe('줄 모델', () => {
  it('칸은 넷을 늘 그린다 — 아는 기술 뒤는 빈 칸이다', () => {
    const rows = moveRows(2, false)
    expect(rows).toHaveLength(MOVE_SLOTS)
    expect(rows.map((r) => r.kind)).toEqual(['move', 'move', 'empty', 'empty'])
  })

  it('커서 번호는 아는 기술만 갖는다 — 빈 칸은 null이다 (`rows = moves.length`)', () => {
    expect(moveRows(3, false).map((r) => r.cursor)).toEqual([0, 1, 2, null])
    expect(moveRows(4, false).map((r) => r.cursor)).toEqual([0, 1, 2, 3])
    expect(moveRows(0, false).map((r) => r.cursor)).toEqual([null, null, null, null])
  })

  it('가르침 모드는 다섯째 줄이 새 기술이고 칸 번호는 아는 기술 수다 (`MOVE_TO_LEARN_SLOT`)', () => {
    const full = moveRows(4, true)
    expect(full).toHaveLength(5)
    expect(full[4]).toEqual({ kind: 'teach', cursor: 4 })
    // 기술이 둘뿐이어도 새 기술 줄의 커서는 셋째 칸이다 — 빈 칸은 건너뛴다
    const few = moveRows(2, true)
    expect(few.at(-1)).toEqual({ kind: 'teach', cursor: 2 })
    expect(few.filter((r) => r.cursor !== null).map((r) => r.cursor)).toEqual([0, 1, 2])
  })
})

describe('값이 없을 때 롬의 「---」다 (원작 `PrintBattleMoveAttributes`)', () => {
  it('위력 ≤ 1은 「---」', () => {
    expect(powerOf(0, '---')).toBe('---')
    expect(powerOf(1, '---')).toBe('---')
    expect(powerOf(2, '---')).toBe('2')
    expect(powerOf(120, '---')).toBe('120')
  })

  it('명중 0은 「---」', () => {
    expect(accuracyOf(0, '---')).toBe('---')
    expect(accuracyOf(100, '---')).toBe('100')
  })

  it('기술 정보를 못 받았으면 「---」다', () => {
    expect(powerOf(undefined, '---')).toBe('---')
    expect(accuracyOf(undefined, '---')).toBe('---')
  })
})

describe('분류 글 번호 (뱅크 3)', () => {
  it('물리 54 · 변화 55 · 특수 56, 이름표는 53', () => {
    expect(CLASS_LINE.physical).toBe(54)
    expect(CLASS_LINE.status).toBe(55)
    expect(CLASS_LINE.special).toBe(56)
    expect(PARTY.moveCategoryLabel).toBe(53)
  })
})
