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

  it('stands a companion beside the new body and slides the body aside, both gone on the next scene', () => {
    const store = useCinematicStore.getState()
    store.startEvolution({ species: 290, form: 0 }, { species: 291, form: 0 })
    useCinematicStore.getState().setCompanion({ species: 292, form: 0 })
    useCinematicStore.getState().setBodyShift(true)
    expect(useCinematicStore.getState()).toMatchObject({ companion: { species: 292 }, bodyShift: true })
    expect(useCinematicStore.getState().companionAt).toBeGreaterThan(0)
    useCinematicStore.getState().announceEvolution({ species: 1, form: 0 }, { species: 2, form: 0 })
    expect(useCinematicStore.getState()).toMatchObject({ companion: null, bodyShift: false })
  })
})
