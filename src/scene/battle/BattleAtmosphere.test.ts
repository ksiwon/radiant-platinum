import { describe, expect, it } from 'vitest'
import { auraShown, battleWeatherKind, statusAuraColor, visibleSideConditions } from './BattleAtmosphere'
import type { ViewMon } from '../../engine/battle/view'

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

describe('몸에 붙는 연출은 몸이 선 자리에만', () => {
  const mon = (presence: ViewMon['presence']): ViewMon => ({
    slot: 'p2a', side: 'p2', key: 'foe-0', species: 129, speciesName: 'Magikarp', level: 5,
    gender: 'male', shiny: true, hp: presence === 'down' ? 0 : 10, maxHp: 10, status: 'par',
    boosts: {} as ViewMon['boosts'], fainted: presence === 'down', presence,
    volatiles: new Set(['confusion', 'substitute']),
  } as ViewMon)

  it('서 있는 몸에는 그린다', () => {
    expect(auraShown(mon('alive'), 'p2a', null)).toBe(true)
  })

  // 쓰러짐은 `presence`만 바꾸고 걸린 것은 남긴다 — 빈 자리에서 혼란 고리가 돌던 자리다
  it('쓰러진 자리에는 안 그린다', () => {
    expect(auraShown(mon('down'), 'p2a', null)).toBe(false)
  })

  // 잡힌 볼은 `active`를 비우지 않는다 — 색다른 반짝이가 볼 둘레를 돌던 자리다
  it('잡힌 자리에는 안 그리고, 놓친 볼이나 다른 자리는 그대로다', () => {
    const ball = (caught: boolean, slot: 'p2a' | 'p2b') => ({ slot, ball: 4, shakes: 3, caught, seq: 1 })
    expect(auraShown(mon('alive'), 'p2a', ball(true, 'p2a'))).toBe(false)
    expect(auraShown(mon('alive'), 'p2a', ball(false, 'p2a'))).toBe(true)
    expect(auraShown(mon('alive'), 'p2a', ball(true, 'p2b'))).toBe(true)
  })

  it('빈 자리에는 안 그린다', () => {
    expect(auraShown(null, 'p2b', null)).toBe(false)
  })
})
