import { describe, expect, it } from 'vitest'
import type { Actor, BattleEvent } from './events'
import { applyEvent, emptyView } from './view'

const foe: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }

describe('battle world-space damage', () => {
  it('retains the exact HP delta for the 3D popup', () => {
    const enter: BattleEvent = {
      kind: 'switch',
      actor: foe,
      species: 25,
      speciesName: 'Pikachu',
      level: 18,
      gender: 'female',
      shiny: false,
      condition: { hp: 52, maxHp: 52, status: 'ok' },
      forced: false,
    }
    const damage: BattleEvent = {
      kind: 'damage',
      actor: foe,
      condition: { hp: 31, maxHp: 52, status: 'ok' },
      from: null,
      hit: { level: 'super', crit: true },
    }

    const view = applyEvent(applyEvent(emptyView(), enter), damage)
    expect(view.lastHit).toMatchObject({ slot: 'p2a', amount: 21, level: 'super', crit: true })
  })
})
