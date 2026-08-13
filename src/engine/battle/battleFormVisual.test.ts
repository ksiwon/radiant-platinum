import { describe, expect, it } from 'vitest'
import { applyEvent, emptyView } from './view'
import { parseLine } from './sim/protocol'

describe('battle form visual state', () => {
  it('keeps a form number on switch-in', () => {
    const event = parseLine('|switch|p2a: 날씨|Castform-Rainy, L30|80/80')
    expect(event?.kind).toBe('switch')
    if (!event || event.kind !== 'switch') return
    expect(event.species).toBe(351)
    expect(event.form).toBe(2)
    expect(applyEvent(emptyView(), event).active.p2a?.form).toBe(2)
  })

  it('updates the active 3D form after a weather transformation', () => {
    const entered = parseLine('|switch|p2a: 날씨|Castform, L30|80/80')
    const changed = parseLine('|-formechange|p2a: 날씨|Castform-Sunny')
    expect(entered?.kind).toBe('switch')
    expect(changed?.kind).toBe('form')
    if (!entered || entered.kind !== 'switch' || !changed || changed.kind !== 'form') return
    const view = applyEvent(applyEvent(emptyView(), entered), changed)
    expect(view.active.p2a?.species).toBe(351)
    expect(view.active.p2a?.form).toBe(1)
  })
})
