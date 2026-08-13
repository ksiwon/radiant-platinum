import { beforeEach, describe, expect, it } from 'vitest'
import { useCinematicStore } from './cinematicStore'

describe('cinematic store', () => {
  beforeEach(() => { useCinematicStore.getState().clear() })

  it('bridges an evolution into its final 3D form', () => {
    const store = useCinematicStore.getState()
    store.startEvolution({ species: 387, form: 0 }, { species: 388, form: 0 })
    expect(useCinematicStore.getState()).toMatchObject({ scene: 'evolution', phase: 'changing' })
    useCinematicStore.getState().finishEvolution()
    expect(useCinematicStore.getState()).toMatchObject({ scene: 'evolution', phase: 'done' })
  })

  it('bridges an egg into the born model', () => {
    const store = useCinematicStore.getState()
    store.startHatch({ species: 172, form: 0 })
    expect(useCinematicStore.getState().phase).toBe('shaking')
    useCinematicStore.getState().finishHatch()
    expect(useCinematicStore.getState().phase).toBe('born')
  })
})
