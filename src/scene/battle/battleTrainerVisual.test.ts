import { describe, expect, it } from 'vitest'
import { trainerFallbackPalette, trainerModelTag } from './battleTrainerVisual'

describe('battle trainer visuals', () => {
  it('maps story trainer classes to their exact BDSP characters', () => {
    expect(trainerModelTag(63)).toBe('friend')
    expect(trainerModelTag(69)).toBe('champion')
    expect([62, 64, 74, 75, 76, 77, 78, 79].map(trainerModelTag)).toEqual([
      'gym01',
      'gym06',
      'gym02',
      'gym04',
      'gym03',
      'gym05',
      'gym07',
      'gym08',
    ])
  })

  it('has a deterministic procedural fallback for unknown classes', () => {
    expect(trainerModelTag(null)).toBeNull()
    expect(trainerModelTag(103)).toBeNull()
    expect(trainerFallbackPalette(103)).toEqual(trainerFallbackPalette(103))
    expect(trainerFallbackPalette(103)).not.toEqual(trainerFallbackPalette(104))
  })
})
