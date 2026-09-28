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
    useHallOfFameStageStore.getState().setCue('monIn', 1)
    expect(useHallOfFameStageStore.getState()).toMatchObject({
      mode: 'ceremony',
      phase: 'solo',
      beat: 'monIn',
      selected: 1,
      gender: 'boy',
    })
    // 창이 위로 걷히는 동안에도 그 마리는 남아 있다 (`Sprite_SetDrawFlag`는 다 걷힌 뒤다)
    useHallOfFameStageStore.getState().setCue('monOut', 1)
    expect(useHallOfFameStageStore.getState().phase).toBe('solo')
    useHallOfFameStageStore.getState().setCue('monGap', 1)
    expect(useHallOfFameStageStore.getState().phase).toBe('hidden')
    useHallOfFameStageStore.getState().setCue('partyIn', 0)
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
