import { describe, expect, it } from 'vitest'
import { fallbackKind } from './NpcFallbackModels'

describe('fallbackKind', () => {
  it.each([
    ['YOUNGSTER', 'human'],
    ['PROF_ROWAN', 'human'],
    ['GRUNTS_GROUP_OF_4', 'human'],
    ['PIKACHU', 'pokemon'],
    ['GIRATINA_ALTERED', 'pokemon'],
    ['ROTOM_WASH', 'pokemon'],
    ['STRENGTH_BOULDER', 'rock'],
    ['MOSS_ROCK', 'rock'],
    ['CUT_TREE', 'tree'],
    ['POKEBALL', 'ball'],
    ['BRIEFCASE', 'case'],
    ['GALACTIC_HQ_DOOR', 'machine'],
    ['CAVE_PAINTING_SHARDS_LEFT', 'machine'],
  ] as const)('%s는 %s 입체 폴백을 쓴다', (name, kind) => {
    expect(fallbackKind(name)).toBe(kind)
  })

  it('모르는 graphicsID도 평면으로 돌아가지 않고 사람형 3D로 선다', () => {
    expect(fallbackKind('UNKNOWN_EVENT_ACTOR')).toBe('human')
  })
})
