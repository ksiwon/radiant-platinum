// 가방 줄 모델 — 기술머신 줄은 기술 이름 · 번호, 나무열매 번호, 옮기기, 「닫는다」 줄
import { describe, expect, it } from 'vitest'
import { POCKET_BERRIES, POCKET_TMHMS } from '../../engine/bag/bag'
import { ITEM_TABLE } from '../../import/platinum/itemTable'
import {
  berryNumber, cursorRows, movablePocket, pad2, reorder, rowKind, tmNumber,
} from './bagRows'

const id = (constant: string): number => ITEM_TABLE.findIndex(([name]) => name === constant)

describe('줄 꼴', () => {
  it('기술머신은 tm, 비전머신은 hm이다 — 비전머신은 개수가 없다', () => {
    expect(rowKind(POCKET_TMHMS, { constant: 'ITEM_TM01', preventToss: 0 })).toBe('tm')
    expect(rowKind(POCKET_TMHMS, { constant: 'ITEM_TM92', preventToss: 0 })).toBe('tm')
    expect(rowKind(POCKET_TMHMS, { constant: 'ITEM_HM01', preventToss: 0 })).toBe('hm')
    expect(rowKind(POCKET_TMHMS, { constant: 'ITEM_HM08', preventToss: 0 })).toBe('hm')
  })

  it('나무열매는 번호가 붙고 중요한 물건은 개수가 없다', () => {
    expect(rowKind(POCKET_BERRIES, { constant: 'ITEM_CHERI_BERRY', preventToss: 0 })).toBe('berry')
    expect(rowKind(7, { constant: 'ITEM_BICYCLE', preventToss: 1 })).toBe('key')
    expect(rowKind(1, { constant: 'ITEM_POTION', preventToss: 0 })).toBe('plain')
  })
})

describe('번호', () => {
  it('기술머신 번호는 1부터, 비전머신도 1부터 다시 센다', () => {
    expect(tmNumber({ constant: 'ITEM_TM01' })).toBe(1)
    expect(tmNumber({ constant: 'ITEM_TM27' })).toBe(27)
    expect(tmNumber({ constant: 'ITEM_HM01' })).toBe(1)
    expect(tmNumber({ constant: 'ITEM_HM08' })).toBe(8)
    expect(tmNumber({ constant: 'ITEM_POTION' })).toBeNull()
  })

  it('나무열매는 오랭열매가 1번이다', () => {
    expect(berryNumber(id('ITEM_CHERI_BERRY'))).toBe(1)
    expect(berryNumber(id('ITEM_CHERI_BERRY') + 63)).toBe(64)
  })

  it('두 자리로 채운다', () => {
    expect(pad2(1)).toBe('01')
    expect(pad2(27)).toBe('27')
  })
})

describe('줄 옮기기 (`StartMovingItem`)', () => {
  it('나무열매와 기술머신은 저절로 늘어서므로 못 옮긴다', () => {
    expect(movablePocket(POCKET_BERRIES)).toBe(false)
    expect(movablePocket(POCKET_TMHMS)).toBe(false)
    expect(movablePocket(0)).toBe(true)
    expect(movablePocket(7)).toBe(true)
  })

  it('빼서 끼운다', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('목록 밖이거나 제자리면 그대로다', () => {
    expect(reorder(['a', 'b'], 0, 0)).toEqual(['a', 'b'])
    expect(reorder(['a', 'b'], 0, 2)).toEqual(['a', 'b'])
    expect(reorder(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
  })
})

describe('커서 줄 수', () => {
  it('도구 줄 + 「닫는다」 한 줄 — 빈 주머니는 한 줄이다', () => {
    expect(cursorRows(0)).toBe(1)
    expect(cursorRows(9)).toBe(10)
  })
})
