import { describe, expect, it } from 'vitest'
import { battleWeatherKind, statusAuraColor, visibleSideConditions } from './BattleAtmosphere'

describe('battle atmosphere selection', () => {
  it.each([
    ['RainDance', 'rain'], ['Hail', 'snow'], ['Sandstorm', 'sand'], ['SunnyDay', 'sun'], [null, 'none'],
  ] as const)('maps weather %s', (weather, kind) => {
    expect(battleWeatherKind(weather)).toBe(kind)
  })

  it('maps visible status colors but ignores healthy monsters', () => {
    expect(statusAuraColor('brn')).toBe('#ff6a3d')
    expect(statusAuraColor('frz')).toBe('#8cecff')
    expect(statusAuraColor('ok')).toBeNull()
  })

  it('keeps only conditions with a 3D field representation', () => {
    const got = visibleSideConditions(new Map([
      ['reflect', 1], ['spikes', 2], ['tailwind', 1],
    ]))
    expect(got).toEqual(['reflect', 'spikes'])
  })
})
