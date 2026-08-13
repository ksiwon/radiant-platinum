import { describe, expect, it } from 'vitest'
import { CAST_FRAMES, REEL_FRAMES } from '../engine/actor/fishing'
import { fishingRodPitch } from './FieldActionEffects'

describe('fishingRodPitch', () => {
  it('casts forward and settles at the waiting angle', () => {
    expect(fishingRodPitch('cast', 0)).toBeLessThan(fishingRodPitch('cast', CAST_FRAMES))
    expect(fishingRodPitch('cast', CAST_FRAMES)).toBeCloseTo(fishingRodPitch('wait', 0))
  })

  it('keeps the rod forward during a bite', () => {
    expect(fishingRodPitch('bite', 12)).toBeCloseTo(1.05)
  })

  it('pulls the rod back while reeling', () => {
    expect(fishingRodPitch('reel', REEL_FRAMES)).toBeLessThan(fishingRodPitch('reel', 0))
  })
})
