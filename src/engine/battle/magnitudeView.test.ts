// 매그니튜드가 굴린 수가 연출까지 닿는가 — 굴림 줄(`-activate … move: Magnitude N`)은 기술 줄 **앞에** 온다
import { describe, expect, it } from 'vitest'
import { parseLine } from './sim/protocol'
import { applyEvent, emptyView } from './view'

describe('매그니튜드 굴림', () => {
  it('굴림 줄은 기술 줄 뒤에서 파싱되고, 기술 사건의 `magnitude`가 `lastMove`로 간다', () => {
    const roll = parseLine('|-activate|p1a: 모부기|move: Magnitude|7')!
    expect(roll).toMatchObject({ kind: 'activate', effect: { id: 'magnitude' }, extra: { num: 7 } })
    const move = parseLine('|move|p1a: 모부기|Magnitude|p2a: 한카리아스')!
    expect(move.kind).toBe('move')
    const view = applyEvent(emptyView(), { ...move, magnitude: 7 } as typeof move)
    expect(view.lastMove?.magnitude).toBe(7)
    const next = applyEvent(view, parseLine('|move|p1a: 모부기|Tackle|p2a: 한카리아스')!)
    expect(next.lastMove?.magnitude).toBeUndefined()
  })
})
