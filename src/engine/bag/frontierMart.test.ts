// 배틀프런티어 교환 코너 (PARITY §12.3)
//
// ⚠️ **재고도 값도 디컴프에서 손으로 옮긴 표다.** 아카이브에 없어서 추출기가
// 대신 세어 줄 수 없다 — 그래서 여기서 수와 모양을 못 박는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { itemFileSchema } from '../../data/schema'
import { DATA, withData } from '../../data/romData.testkit'
import {
  addBattlePoints, bpPriceOf, BP_PRICE, FRONTIER_MART_IDS, FRONTIER_STOCK_LEFT,
  FRONTIER_STOCK_RIGHT, frontierStock, isFrontierMart, MAX_BATTLE_POINTS, spendBattlePoints,
} from './frontierMart'
import { SHARDS } from './shards'

describe('재고', () => {
  it('오른쪽 열다섯 · 왼쪽 스물여섯 + 조각 넷', () => {
    expect(FRONTIER_STOCK_RIGHT).toHaveLength(15)
    expect(FRONTIER_STOCK_LEFT).toHaveLength(26 + 4)
    // ⚠️ 조각은 **맨 뒤**다. 앞의 스물여섯은 원작 차례라 밀면 안 된다
    expect(FRONTIER_STOCK_LEFT.slice(-4)).toEqual(SHARDS)
  })

  it('창구 번호는 둘뿐이고 목록이 서로 다르다', () => {
    for (const id of FRONTIER_MART_IDS) expect(isFrontierMart(id)).toBe(true)
    expect(isFrontierMart(2)).toBe(false)
    expect(frontierStock(2)).toEqual([])
    expect(frontierStock(0)).toEqual(FRONTIER_STOCK_RIGHT)
    expect(frontierStock(1)).toEqual(FRONTIER_STOCK_LEFT)
    const both = [...FRONTIER_STOCK_RIGHT, ...FRONTIER_STOCK_LEFT]
    expect(new Set(both).size).toBe(both.length)
  })

  it('⚠️ 파는 것에 값이 다 붙어 있다 — 0원짜리가 없다', () => {
    for (const item of [...FRONTIER_STOCK_RIGHT, ...FRONTIER_STOCK_LEFT]) {
      expect(bpPriceOf(item), `도구 ${String(item)}`).toBeGreaterThan(0)
    }
    // 표에 없는 것은 0이다 — 원작도 0을 준다
    expect(bpPriceOf(1)).toBe(0)
  })

  it('값이 원작의 여섯 층에만 있다 — 조각도 새 층을 안 만든다', () => {
    const tiers = new Set(Object.values(BP_PRICE))
    expect([...tiers].sort((a, b) => a - b)).toEqual([1, 16, 32, 40, 48, 64, 80])
    for (const shard of SHARDS) expect(bpPriceOf(shard)).toBe(1)
  })
})

describe('BP 셈', () => {
  it('상한 9,999에서 멈춘다', () => {
    expect(addBattlePoints(0, 5)).toBe(5)
    expect(addBattlePoints(MAX_BATTLE_POINTS - 1, 100)).toBe(MAX_BATTLE_POINTS)
  })

  it('⚠️ 모자라면 0이 된다 — 음수로 안 간다', () => {
    expect(spendBattlePoints(10, 4)).toBe(6)
    expect(spendBattlePoints(3, 10)).toBe(0)
  })
})

const maybe = withData('items.json')

maybe('롬 표와 맞댄다', () => {
  const file = itemFileSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'items.json'), 'utf8')),
  )

  it('⚠️ 재고가 전부 롬 도구다 — 번호를 잘못 옮기면 여기서 걸린다', () => {
    for (const item of [...FRONTIER_STOCK_RIGHT, ...FRONTIER_STOCK_LEFT]) {
      expect(file.items[item], `도구 ${String(item)}`).toBeDefined()
      expect(file.items[item]!.data, `도구 ${String(item)}`).not.toBeNull()
    }
  })

  it('오른쪽 창구는 기술머신뿐이다', () => {
    for (const item of FRONTIER_STOCK_RIGHT) {
      expect(file.items[item]!.constant, `도구 ${String(item)}`).toMatch(/^ITEM_TM\d\d$/)
    }
  })

  it('조각 넷이 롬 이름표와 맞는다', () => {
    expect(SHARDS.map((id) => file.items[id]!.constant)).toEqual([
      'ITEM_RED_SHARD', 'ITEM_BLUE_SHARD', 'ITEM_YELLOW_SHARD', 'ITEM_GREEN_SHARD',
    ])
  })
})
