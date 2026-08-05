// 가방 검증 (DATA.md §2.12)
//
// 사전 하나로 만들었다면 전부 자동으로 맞았을 것들이다. 원작 구조를 따르기로
// 했으니 그 구조가 만드는 **한계**가 실제로 걸리는지를 본다 — 칸 수, 개수
// 상한, 그리고 주머니마다 다른 나열 순서.
import { describe, expect, it } from 'vitest'
import {
  addItem, canFit, emptyBag, MAX_QUANTITY, MAX_QUANTITY_TMHM, POCKET_BERRIES,
  POCKET_SIZE, POCKET_TMHMS, quantity, removeItem, type Pockets,
} from './bag'

const POCKET_BALLS = 2
const POCKET_ITEMS = 0

const fill = (pocket: number, count: number): Pockets => {
  let bag = emptyBag()
  for (let i = 1; i <= count; i++) bag = addItem(bag, pocket, i, 1)!
  return bag
}

describe('가방', () => {
  it('주머니 8개로 시작한다', () => {
    expect(emptyBag()).toHaveLength(8)
    expect(emptyBag().every((p) => p.length === 0)).toBe(true)
  })

  it('같은 도구는 한 칸에 쌓인다', () => {
    let bag = addItem(emptyBag(), POCKET_ITEMS, 17, 3)!
    bag = addItem(bag, POCKET_ITEMS, 17, 2)!
    expect(bag[POCKET_ITEMS]).toEqual([{ item: 17, count: 5 }])
  })

  it('볼 주머니는 15칸에서 막힌다', () => {
    // 개수가 아니라 **종류**로 막힌다. 원작 상한이 그렇다
    expect(POCKET_SIZE[POCKET_BALLS]).toBe(15)
    const full = fill(POCKET_BALLS, 15)
    expect(full[POCKET_BALLS]).toHaveLength(15)
    expect(canFit(full, POCKET_BALLS, 99, 1)).toBe(false)
    expect(addItem(full, POCKET_BALLS, 99, 1)).toBeNull()
    // 이미 있는 종류는 칸이 꽉 차 있어도 더 쌓인다
    expect(addItem(full, POCKET_BALLS, 1, 1)).not.toBeNull()
  })

  it('한 칸은 999개까지, 기술머신만 99개까지', () => {
    const many = addItem(emptyBag(), POCKET_ITEMS, 17, MAX_QUANTITY)!
    expect(addItem(many, POCKET_ITEMS, 17, 1)).toBeNull()
    const tm = addItem(emptyBag(), POCKET_TMHMS, 328, MAX_QUANTITY_TMHM)!
    expect(addItem(tm, POCKET_TMHMS, 328, 1)).toBeNull()
    expect(MAX_QUANTITY_TMHM).toBe(99)
  })

  it('나무열매와 기술머신만 번호순으로 다시 늘어선다', () => {
    // 다른 주머니는 주운 순서 그대로다. 이 차이가 가방 화면에 그대로 보인다
    let berries = addItem(emptyBag(), POCKET_BERRIES, 155, 1)!
    berries = addItem(berries, POCKET_BERRIES, 149, 1)!
    expect(berries[POCKET_BERRIES]?.map((s) => s.item)).toEqual([149, 155])

    let items = addItem(emptyBag(), POCKET_ITEMS, 155, 1)!
    items = addItem(items, POCKET_ITEMS, 149, 1)!
    expect(items[POCKET_ITEMS]?.map((s) => s.item)).toEqual([155, 149])
  })

  it('모자라면 못 뺀다', () => {
    const bag = addItem(emptyBag(), POCKET_ITEMS, 17, 2)!
    expect(removeItem(bag, POCKET_ITEMS, 17, 3)).toBeNull()
    expect(removeItem(bag, POCKET_ITEMS, 99, 1)).toBeNull()
    const left = removeItem(bag, POCKET_ITEMS, 17, 1)!
    expect(quantity(left, POCKET_ITEMS, 17)).toBe(1)
  })

  it('0이 되면 칸이 사라진다', () => {
    const bag = addItem(emptyBag(), POCKET_ITEMS, 17, 1)!
    const empty = removeItem(bag, POCKET_ITEMS, 17, 1)!
    expect(empty[POCKET_ITEMS]).toEqual([])
  })

  it('넣고 빼도 원래 가방은 안 바뀐다', () => {
    // 스토어가 변화를 알아채려면 새 값이어야 한다
    const bag = emptyBag()
    addItem(bag, POCKET_ITEMS, 17, 1)
    expect(bag[POCKET_ITEMS]).toEqual([])
  })
})
