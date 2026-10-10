import { describe, expect, it } from 'vitest'
import { EVO_BEATS } from '../../engine/pokemon/evolutionBeat'
import { canStopEvolution } from './evolutionRules'

describe('진화를 멈출 수 있는 때', () => {
  const inside = (EVO_BEATS.swap + 40) / 2

  it('레벨 진화는 교대하는 동안 멈춘다', () => {
    expect(canStopEvolution(true, inside)).toBe(true)
  })

  it('도구 · 교환 진화는 같은 때라도 못 멈춘다', () => {
    expect(canStopEvolution(false, inside)).toBe(false)
  })

  it('띠가 닫히는 동안과 교대가 끝난 뒤에는 레벨 진화도 못 멈춘다', () => {
    expect(canStopEvolution(true, 10)).toBe(false)
    expect(canStopEvolution(true, EVO_BEATS.swap)).toBe(false)
    expect(canStopEvolution(true, EVO_BEATS.end)).toBe(false)
  })
})
