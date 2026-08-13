import { describe, expect, it } from 'vitest'
import { fieldWeatherKind, weatherFogProfile, weatherProfile } from './weatherVisual'

describe('overworld 3D weather', () => {
  it('maps the original weather ids into visual families', () => {
    expect(fieldWeatherKind(2)).toBe('rain')
    expect(fieldWeatherKind(7)).toBe('blizzard')
    expect(fieldWeatherKind(10)).toBe('sand')
    expect(fieldWeatherKind(14)).toBe('fog')
    expect(fieldWeatherKind(34)).toBe('snow')
  })

  it('keeps unknown special map effects out of generic weather', () => {
    expect(fieldWeatherKind(29)).toBe('clear')
  })

  it('uses more particles and tighter fog for severe weather', () => {
    expect(weatherProfile('storm')!.count).toBeGreaterThan(weatherProfile('rain')!.count)
    expect(weatherFogProfile('blizzard').farScale).toBeLessThan(weatherFogProfile('snow').farScale)
  })
})
