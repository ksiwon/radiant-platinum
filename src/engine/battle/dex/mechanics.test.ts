// 땅이 정하는 기술 셋 — 자연의힘 · 비밀의힘 · 위장 (`MechanicsRegistry.move`)
//
// 표는 `raw/decomp/include/data/terrain/to_move.h` · `to_type.h` · `to_secondary_effect.h` 그대로다. 롬 없이 도는 표 대조라
// `shimmed.test.shim.ts`(롬이 있어야 도는 실전 판)가 놓치는 경계를 잡는다: 땅 12(아론 방)부터는 전부 `TERRAIN_SPECIAL`이다
import { describe, expect, it, vi } from 'vitest'
import { MechanicsRegistry } from './mechanics'

type Fn = (this: unknown, ...a: unknown[]) => unknown
const hook = (move: string, name: string): Fn => {
  const f = MechanicsRegistry.move(move)?.[name]
  if (typeof f !== 'function') throw new Error(`${move}.${name}이 없다`)
  return f as Fn
}

/** [땅 번호, 자연의힘 기술, 위장 타입, 비밀의힘 부가효과] — to_move.h · to_type.h · to_secondary_effect.h */
const TABLE: readonly [number, string, string, Record<string, unknown>][] = [
  [0, 'earthquake', 'Ground', { boosts: { accuracy: -1 } }],
  [1, 'earthquake', 'Ground', { boosts: { accuracy: -1 } }],
  [2, 'seedbomb', 'Grass', { status: 'slp' }],
  [3, 'seedbomb', 'Grass', { status: 'slp' }],
  [4, 'rockslide', 'Rock', { volatileStatus: 'flinch' }],
  [5, 'rockslide', 'Rock', { volatileStatus: 'flinch' }],
  [6, 'blizzard', 'Ice', { status: 'frz' }],
  [7, 'hydropump', 'Water', { boosts: { atk: -1 } }],
  [8, 'icebeam', 'Ice', { status: 'frz' }],
  [9, 'triattack', 'Normal', { status: 'par' }],
  [10, 'mudbomb', 'Ground', { boosts: { spe: -1 } }],
  [11, 'airslash', 'Flying', { boosts: { evasion: -1 } }],
  [12, 'triattack', 'Normal', { status: 'par' }],
]

const nature = (terrain: number | undefined): string => {
  const useMove = vi.fn()
  hook('naturepower', 'onHit').call({ terrain, actions: { useMove } }, 'mon')
  expect(useMove).toHaveBeenCalledTimes(1)
  expect(useMove.mock.calls[0]![1]).toBe('mon')
  return useMove.mock.calls[0]![0] as string
}
const secret = (terrain: number | undefined): unknown => {
  const move: { secondaries?: unknown[] | null } = {}
  hook('secretpower', 'onModifyMove').call({ terrain }, move)
  return move.secondaries
}
/** 위장 — `[결과, 바뀐 타입]`. 이미 `has`이면 실패 */
const camo = (terrain: number | undefined, has = ''): [unknown, string | null] => {
  let set: string | null = null
  const add = vi.fn()
  const target = { hasType: (t: string) => t === has, setType: (t: string) => { set = t; return true } }
  const r = hook('camouflage', 'onHit').call({ terrain, add }, target)
  return [r, set]
}

describe('땅 열세 칸 — 원작 표 그대로', () => {
  it.each(TABLE)('땅 %i — 자연의힘 %s · 위장 %s', (terrain, move, type, effect) => {
    expect(nature(terrain)).toBe(move)
    expect(camo(terrain)).toEqual([undefined, type])
    expect(secret(terrain)).toEqual([{ chance: 30, ...effect }])
  })
})

describe('경계 — 12(아론 방)부터는 SPECIAL로 접힌다', () => {
  it('12 이상은 전부 SPECIAL 칸이다', () => {
    for (const t of [12, 13, 15, 99]) {
      expect(nature(t)).toBe('triattack')
      expect(camo(t)[1]).toBe('Normal')
      expect(secret(t)).toEqual([{ chance: 30, status: 'par' }])
    }
  })
  it('11(다리)은 아직 SPECIAL이 아니다', () => {
    expect(nature(11)).toBe('airslash')
    expect(secret(11)).toEqual([{ chance: 30, boosts: { evasion: -1 } }])
  })
  it('땅이 없으면 평지(0)다', () => {
    expect(nature(undefined)).toBe('earthquake')
    expect(camo(undefined)[1]).toBe('Ground')
    expect(secret(undefined)).toEqual([{ chance: 30, boosts: { accuracy: -1 } }])
  })
  it('음수는 평지로 올린다', () => {
    expect(nature(-3)).toBe('earthquake')
  })
})

describe('위장', () => {
  it('이미 그 타입이면 실패하고 아무것도 안 바꾼다', () => {
    expect(camo(9, 'Normal')).toEqual([false, null])
    expect(camo(6, 'Ice')).toEqual([false, null])
  })
  it('바꾸면 -start typechange를 적는다', () => {
    const add = vi.fn()
    hook('camouflage', 'onHit').call({ terrain: 7, add }, { hasType: () => false, setType: () => true })
    expect(add).toHaveBeenCalledWith('-start', expect.anything(), 'typechange', 'Water')
  })
  it('타입을 못 바꾸는 몸(setType 거짓)이면 실패다', () => {
    const r = hook('camouflage', 'onHit').call({ terrain: 7, add: vi.fn() }, { hasType: () => false, setType: () => false })
    expect(r).toBe(false)
  })
})
