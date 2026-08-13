import { beforeEach, describe, expect, it } from 'vitest'
import { useHallOfFameStageStore } from './hallOfFameStageStore'

describe('hall of fame 3D stage store', () => {
  beforeEach(() => {
    useHallOfFameStageStore.getState().clear()
  })

  it('keeps a ceremony party and advances from solo to the full party', () => {
    const store = useHallOfFameStageStore.getState()
    store.startCeremony(
      [
        { species: 387, form: 0 },
        { species: 390, form: 0 },
      ],
      'boy',
    )
    useHallOfFameStageStore.getState().setCeremony('solo', 1)
    expect(useHallOfFameStageStore.getState()).toMatchObject({
      mode: 'ceremony',
      phase: 'solo',
      selected: 1,
      gender: 'boy',
    })
    useHallOfFameStageStore.getState().setCeremony('party')
    expect(useHallOfFameStageStore.getState().phase).toBe('party')
  })

  it('clamps the selected archive model to the saved party', () => {
    useHallOfFameStageStore.getState().showArchive([{ species: 487, form: 1 }], 9)
    expect(useHallOfFameStageStore.getState()).toMatchObject({
      mode: 'archive',
      selected: 0,
      phase: 'party',
    })
  })
})
