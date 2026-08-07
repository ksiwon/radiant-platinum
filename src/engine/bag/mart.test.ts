// 상점 재고 검증 (DATA.md §2.12)
//
// 뱃지 사다리를 잘못 옮기면 첫 상점에 회복약이 다 깔린다 — 그래도 화면은
// 멀쩡해 보이고 아무 계산도 안 틀린다. 그래서 원작의 첫 재고를 못박아 둔다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MartTable } from '../../data/schema'
import { badgeCount, commonStock, specialtyStock, stockTier } from './mart'
import { withData } from '../../data/romData.testkit'

describe('뱃지 사다리', () => {
  it('원작 `switch (badgeNum)`와 같다', () => {
    // 0→1 · 1~2→2 · 3~4→3 · 5~6→4 · 7→5 · 8→6
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(stockTier)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 6])
  })

  it('범위 밖은 1로 받는다 — 원작 default와 같다', () => {
    expect(stockTier(9)).toBe(1)
    expect(stockTier(-1)).toBe(1)
  })

  it('뱃지 비트를 센다', () => {
    expect(badgeCount(0)).toBe(0)
    expect(badgeCount(0b101)).toBe(2)
    expect(badgeCount(0xff)).toBe(8)
    // 9번째 비트는 뱃지가 아니다
    expect(badgeCount(0x1ff)).toBe(8)
  })
})

const FILE = resolve(__dirname, '../../../public/data/marts.json')
const maybe = withData('marts.json')

maybe('상점 재고', () => {
  const table = JSON.parse(readFileSync(FILE, 'utf8')) as MartTable

  it('뱃지가 없으면 네 가지만 판다', () => {
    // 원작 첫 상점(모래사장마을)이 몬스터볼·상처약·해독제·마비회복 넷이다
    expect(commonStock(table, 0)).toHaveLength(4)
  })

  it('뱃지를 딸수록 늘고 줄지 않는다', () => {
    let last = 0
    for (let badges = 0; badges <= 8; badges++) {
      const mask = (1 << badges) - 1
      const count = commonStock(table, mask).length
      expect(count).toBeGreaterThanOrEqual(last)
      last = count
    }
    expect(last).toBe(table.common.length)
  })

  it('슈퍼볼은 뱃지 셋, 하이퍼볼은 다섯부터다', () => {
    // 슈퍼볼이 계단 3, 하이퍼볼이 4다. 사다리가 3개→3, 5개→4이므로 이 숫자가 나온다
    const at = (badges: number) => new Set(commonStock(table, (1 << badges) - 1))
    const GREAT = table.common[1]!.item
    const ULTRA = table.common[2]!.item
    expect(at(2).has(GREAT)).toBe(false)
    expect(at(3).has(GREAT)).toBe(true)
    expect(at(4).has(ULTRA)).toBe(false)
    expect(at(5).has(ULTRA)).toBe(true)
  })

  it('지역 상점 20곳이 저마다 재고를 갖는다', () => {
    expect(table.specialties).toHaveLength(20)
    for (let i = 0; i < 20; i++) expect(specialtyStock(table, i).length).toBeGreaterThan(0)
    // 없는 번호를 물으면 빈 상점이다. 다른 상점 물건이 새면 안 된다
    expect(specialtyStock(table, 99)).toEqual([])
  })
})
