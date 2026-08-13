import { describe, expect, it } from 'vitest'
import type { BattleEvent } from './events'
import { applyEvent, emptyView } from './view'

function ball(shakes: number, caught: boolean): BattleEvent {
  return {
    kind: 'ball',
    actor: { slot: 'p2a', side: 'p2', name: 'wild' },
    ball: 4,
    shakes,
    caught,
  }
}

describe('battle ball visual state', () => {
  it('retains every capture attempt with a fresh sequence number', () => {
    const first = applyEvent(emptyView(), ball(1, false))
    const second = applyEvent(first, ball(3, false))
    expect(first.lastBall).toMatchObject({ slot: 'p2a', ball: 4, shakes: 1, seq: 1 })
    expect(second.lastBall).toMatchObject({ shakes: 3, seq: 2 })
    expect(second.ended).toBe(false)
  })

  it('ends the view only after a successful capture', () => {
    const view = applyEvent(emptyView(), ball(4, true))
    expect(view.lastBall?.caught).toBe(true)
    expect(view.ended).toBe(true)
  })
})
