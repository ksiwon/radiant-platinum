import { beforeEach, describe, expect, it } from 'vitest'
import { useIntroStageStore } from './introStageStore'

describe('intro 3D stage store', () => {
  beforeEach(() => {
    useIntroStageStore.getState().clear()
  })

  it('moves from Rowan to the opened ball and gender preview', () => {
    useIntroStageStore.getState().start()
    expect(useIntroStageStore.getState().scene).toBe('rowan')
    useIntroStageStore.getState().show('buneary')
    useIntroStageStore.getState().setGender('boy')
    useIntroStageStore.getState().show('gender')
    expect(useIntroStageStore.getState()).toMatchObject({ scene: 'gender', gender: 'boy' })
  })
})
