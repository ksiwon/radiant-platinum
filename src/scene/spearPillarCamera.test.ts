// 붉은 사슬이 도는 동안만 카메라 내림각을 원작 값으로 못 박는다 (`startRedChain` · `redChainDone`)
import { afterEach, describe, expect, it } from 'vitest'
import { cameraSystem, SPEAR_PITCH_DEG } from '../engine/actor/camera'
import { redChainDone, spearPillarLive, startRedChain } from './spearPillarFx'

describe('붉은 사슬 장면의 카메라 각', () => {
  afterEach(() => { spearPillarLive.chain = null; cameraSystem.pitchHold = null })

  it('세우면 원작 각으로 올리고, 끝나면 놓는다', () => {
    expect(cameraSystem.pitchHold).toBeNull()
    startRedChain()
    expect(cameraSystem.pitchHold).toBe(SPEAR_PITCH_DEG)
    expect(redChainDone()).toBe(false)
    expect(cameraSystem.pitchHold).toBe(SPEAR_PITCH_DEG)
    spearPillarLive.chain!.state = 11
    expect(redChainDone()).toBe(true)
    expect(cameraSystem.pitchHold).toBeNull()
  })
})
