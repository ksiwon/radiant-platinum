import { describe, expect, it } from 'vitest'
import { resetStarterScene, starterScene } from './starterRefs'

describe('starter 3D preview state', () => {
  it('clears a selected 3D starter when the scene is reopened', () => {
    starterScene.opened = true
    starterScene.pick = 2
    starterScene.confirming = true
    resetStarterScene()
    expect(starterScene).toMatchObject({ opened: false, pick: 0, confirming: false })
  })
})
