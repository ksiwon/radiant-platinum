// 씰케이스의 셈 (`unk_0202C9F4.c`)
import { describe, expect, it } from 'vitest'
import {
  canGiveOrTake, countSeal, giveOrTakeSeal, newSealCase, totalSeals, uniqueSeals,
} from './sealCase'
import { MAX_SEALS_PER_TYPE, SEAL_KINDS, SEAL_PRICE, SUNYSHORE_SEAL_STOCKS } from './sealTables'

describe('씰케이스', () => {
  it('번호는 1부터이고 빈 케이스는 전부 0이다', () => {
    const s = newSealCase()
    expect(s).toHaveLength(SEAL_KINDS)
    expect(countSeal(s, 1)).toBe(0)
    expect(countSeal(s, SEAL_KINDS)).toBe(0)
    expect(countSeal(s, 0)).toBe(0)
    expect(countSeal(s, SEAL_KINDS + 1)).toBe(0)
  })

  it('99장에서 멈추고 못 하면 그대로다 (`GiveOrTakeSeal`)', () => {
    let s: readonly number[] = newSealCase()
    s = giveOrTakeSeal(s, 3, 90).seals
    const over = giveOrTakeSeal(s, 3, 10)
    expect(over.ok).toBe(false)
    expect(over.seals).toBe(s)
    expect(giveOrTakeSeal(s, 3, 9).ok).toBe(true)
    expect(canGiveOrTake(s, 3, MAX_SEALS_PER_TYPE - 90)).toBe(true)
  })

  it('가진 것보다 많이 못 뺀다', () => {
    const s = giveOrTakeSeal(newSealCase(), 5, 2).seals
    expect(giveOrTakeSeal(s, 5, -3).ok).toBe(false)
    expect(countSeal(giveOrTakeSeal(s, 5, -2).seals, 5)).toBe(0)
  })

  it('번호 밖은 못 건드린다', () => {
    expect(giveOrTakeSeal(newSealCase(), 0, 1).ok).toBe(false)
    expect(giveOrTakeSeal(newSealCase(), SEAL_KINDS + 1, 1).ok).toBe(false)
  })

  it('종류 수와 총 장수를 센다', () => {
    let s: readonly number[] = newSealCase()
    s = giveOrTakeSeal(s, 1, 3).seals
    s = giveOrTakeSeal(s, 40, 2).seals
    expect(uniqueSeals(s)).toBe(2)
    expect(totalSeals(s)).toBe(5)
  })
})

describe('씰 표 (디컴프에서 구운 것)', () => {
  it('값은 씰마다 있고, 시장이 파는 씰은 전부 양수다 (값 0은 안 파는 씰)', () => {
    expect(SEAL_PRICE).toHaveLength(SEAL_KINDS)
    for (const day of SUNYSHORE_SEAL_STOCKS) {
      for (const id of day) expect(SEAL_PRICE[id - 1], `씰 ${String(id)}`).toBeGreaterThan(0)
    }
  })
  it('요일마다 일곱 종이고 번호가 범위 안이다', () => {
    expect(SUNYSHORE_SEAL_STOCKS).toHaveLength(7)
    for (const day of SUNYSHORE_SEAL_STOCKS) {
      expect(day).toHaveLength(7)
      for (const id of day) expect(id >= 1 && id <= SEAL_KINDS).toBe(true)
    }
  })
})

describe('옛 리포트', () => {
  it('씰 칸이 없어도 빈 케이스로 읽힌다 (`SAVE_VERSION`을 안 올린다)', async () => {
    const { parseSave } = await import('../../state/save/schema')
    const { createNewSave } = await import('../../state/saveStore')
    const old = { ...createNewSave() } as Record<string, unknown>
    delete old.sealCase
    const got = parseSave(old as never) as unknown as { sealCase: number[] }
    expect(got.sealCase).toEqual(newSealCase())
  })
})
