import { describe, expect, it } from 'vitest'
import { previewModelScale, previewNdcY } from './pokemonPreview3d'

describe('legendary 3D preview placement', () => {
  it('aims at the DOM frame center above the dialogue box', () => {
    expect(previewNdcY(1080)).toBeCloseTo(-0.6778, 3)
    expect(previewNdcY(720)).toBeCloseTo(-0.5167, 3)
  })

  it('normalizes tiny and huge species into the same portrait', () => {
    expect(previewModelScale(0.4)).toBe(1.3)
    expect(previewModelScale(4)).toBeCloseTo(0.13)
  })
})
