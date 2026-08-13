import { describe, expect, it } from 'vitest'
import { elementFamilyForType, moveVisualSignature } from './moveElements'

describe('elementFamilyForType', () => {
  it.each([
    [10, 'flame'],
    [11, 'water'],
    [13, 'spark'],
    [15, 'frost'],
    [12, 'leaf'],
    [5, 'stone'],
    [14, 'spirit'],
    [2, 'wind'],
    [3, 'venom'],
    [0, 'neutral'],
  ] as const)('maps type %s to %s geometry', (type, family) => {
    expect(elementFamilyForType(type)).toBe(family)
  })

  it('gives every generation-4 move a deterministic spatial signature', () => {
    const signatures = Array.from({ length: 471 }, (_, index) => moveVisualSignature(index + 1))
    expect(new Set(signatures.map((signature) => signature.phase)).size).toBe(471)
    expect(
      signatures.every(
        (signature) => signature.particles >= 7 && signature.particles <= 12 && signature.lift > 0,
      ),
    ).toBe(true)
  })
})
