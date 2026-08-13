import { describe, expect, it } from 'vitest'
import {
  appearanceEntry,
  materialVariantKey,
  type MonEntry,
  type MonVariantIndex,
} from './monModel'

const normal: MonEntry = { file: 'variants/female/202.glb', height: 1.2, scale: 1.1 }
const shiny: MonEntry = { file: 'variants/female-shiny/202.glb', height: 1.2, scale: 1.1 }
const variants: MonVariantIndex = {
  version: 1,
  shiny: {},
  female: { '202': normal },
  femaleShiny: { '202': shiny },
}

describe('Pokemon model appearances', () => {
  it('selects only exact female GLBs and keeps the male base reusable', () => {
    expect(appearanceEntry(variants, '202', { gender: 'female' })).toBe(normal)
    expect(appearanceEntry(variants, '202', { gender: 'female', shiny: true })).toBe(shiny)
    expect(appearanceEntry(variants, '202', { gender: 'male', shiny: true })).toBeNull()
    expect(appearanceEntry(variants, '25', { gender: 'female' })).toBeNull()
  })

  it('matches a rare material to the base GLB material by suffix', () => {
    expect(materialVariantKey('pm0025_00_00-BodyA_rare')).toBe('BodyA')
    expect(materialVariantKey('pm0025_00_00-LEye')).toBe('LEye')
  })
})
