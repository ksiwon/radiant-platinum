import { beforeEach, describe, expect, it } from 'vitest'
import { doorYaw, useDoorVisualStore } from './doorVisualStore'

describe('3D door visual bridge', () => {
  beforeEach(() => { useDoorVisualStore.getState().clear() })

  it('faces the doorway back toward the player', () => {
    expect(doorYaw(5, 5, 5.5, 4.5)).toBeCloseTo(0)
    expect(doorYaw(5, 5, 4.5, 5.5)).toBeCloseTo(Math.PI / 2)
  })

  it('tracks load, open, close and unload commands by tag', () => {
    const store = useDoorVisualStore.getState()
    store.load(10, 11, 3, 10.5, 10.5)
    store.open(3)
    expect(useDoorVisualStore.getState().doors[3]?.phase).toBe('opening')
    useDoorVisualStore.getState().close(3)
    expect(useDoorVisualStore.getState().doors[3]?.phase).toBe('closing')
    useDoorVisualStore.getState().unload(3)
    expect(useDoorVisualStore.getState().doors[3]).toBeUndefined()
  })
})
