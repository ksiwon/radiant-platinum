import { describe, expect, it } from 'vitest'
import { MAX_REMINDER_MOVES, relearnableMoves } from './relearn'

const set = (...pairs: [number, number][]) => pairs.map(([level, move]) => ({ level, move }))

describe('되살릴 수 있는 기술', () => {
  it('지금 레벨까지의 레벨업 기술이다', () => {
    const learnset = set([1, 33], [5, 45], [13, 71], [22, 235])
    expect(relearnableMoves(learnset, 13, [])).toEqual([33, 45, 71])
  })

  it('지금 쓰고 있는 기술은 뺀다', () => {
    const learnset = set([1, 33], [5, 45], [13, 71])
    expect(relearnableMoves(learnset, 20, [45])).toEqual([33, 71])
  })

  it('같은 기술이 두 레벨에 있어도 한 번만 나온다', () => {
    const learnset = set([1, 110], [5, 110], [9, 71])
    expect(relearnableMoves(learnset, 20, [])).toEqual([110, 71])
  })

  it('⚠️ 높은 레벨 자리에서 멈추지 않고 건너뛴다', () => {
    // 레벨 표가 오름차순이 아닌 종이 있다. 멈추면 뒤가 통째로 사라진다
    const learnset = set([1, 33], [40, 63], [9, 71])
    expect(relearnableMoves(learnset, 20, [])).toEqual([33, 71])
  })

  it('아무것도 없으면 빈 목록이다', () => {
    expect(relearnableMoves(set([40, 63]), 10, [])).toEqual([])
  })

  it('스물다섯을 넘지 않는다', () => {
    const learnset = set(...Array.from({ length: 40 }, (_, i) => [1, i + 1] as [number, number]))
    expect(relearnableMoves(learnset, 50, [])).toHaveLength(MAX_REMINDER_MOVES)
  })
})
