// 안개제거·플래시 표식은 워프로 굴이 아닌 맵에 들어설 때 풀린다 (`field_map_change_flags.c` 80–85)
import { describe, expect, it } from 'vitest'
import { clearLightFlagsOnWarp } from './field'
import { SYSTEM_FLAG } from './commands'

const MAP_TYPE_CAVE = 3

function fakeVars() {
  const set = new Set<number>([SYSTEM_FLAG.flashActive, SYSTEM_FLAG.defogActive])
  return { set, clearFlag: (f: number) => { set.delete(f) } }
}

describe('안개제거·플래시 표식 (워프)', () => {
  it('굴이 아닌 맵으로 워프하면 두 표식이 풀린다', () => {
    for (const type of [0, 1, 2, 4, 5]) {
      const v = fakeVars()
      clearLightFlagsOnWarp(v, type)
      expect(v.set.size).toBe(0)
    }
  })

  it('굴로 워프하면 표식이 남는다', () => {
    const v = fakeVars()
    clearLightFlagsOnWarp(v, MAP_TYPE_CAVE)
    expect(v.set.has(SYSTEM_FLAG.flashActive)).toBe(true)
    expect(v.set.has(SYSTEM_FLAG.defogActive)).toBe(true)
  })
})
