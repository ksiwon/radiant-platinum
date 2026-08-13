// 움직이는 바닥 (PARITY §7.12)
//
// ⚠️ 여기서 재는 것은 **겹칠 때 어느 쪽을 딛는가**다. 판을 세우는 것은 쉽고,
// 승강판이 올라가는 동안 사람이 바닥으로 떨어지느냐 마느냐가 이 규칙 하나에
// 달려 있다.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearHeightPlates, heightPlateAt, heightPlateHeight, resolveDynamicHeight,
  setHeightPlate, setHeightPlateHeight,
} from './dynamicHeight'

describe('높이판', () => {
  beforeEach(() => { clearHeightPlates() })

  it('상자 안의 칸만 덮는다', () => {
    setHeightPlate(0, 3, 11, 3, 2, 5)
    expect(heightPlateAt(3, 11)).not.toBeNull()
    expect(heightPlateAt(5, 12)).not.toBeNull()
    expect(heightPlateAt(2, 11)).toBeNull()
    expect(heightPlateAt(6, 11)).toBeNull()
    expect(heightPlateAt(3, 13)).toBeNull()
  })

  it('상자는 그대로 두고 높이만 갈아 끼운다', () => {
    setHeightPlate(0, 0, 0, 2, 2, 0)
    setHeightPlateHeight(0, 4)
    expect(heightPlateHeight(0)).toBe(4)
    expect(heightPlateAt(1, 1)?.height).toBe(4)
  })

  it('앞 번호가 이긴다', () => {
    // 원작이 `..._GetPlateIndexOfTile`에서 처음 맞는 하나로 끝낸다
    setHeightPlate(1, 0, 0, 4, 4, 9)
    setHeightPlate(0, 0, 0, 4, 4, 3)
    expect(heightPlateAt(2, 2)?.height).toBe(3)
  })

  it('맵을 옮기면 없어진다', () => {
    setHeightPlate(0, 0, 0, 2, 2, 7)
    clearHeightPlates()
    expect(heightPlateAt(0, 0)).toBeNull()
  })
})

describe('무엇을 딛는가', () => {
  beforeEach(() => { clearHeightPlates() })

  it('판이 없는 칸은 구워진 높이 그대로다', () => {
    setHeightPlate(0, 10, 10, 2, 2, 5)
    expect(resolveDynamicHeight(2, 0, 0, 0)).toBe(2)
  })

  it('⚠️ 판이 바닥보다 낮거나 같으면 쳐다보지 않는다', () => {
    // 내려간 승강판이 바닥 밑에 숨는 자리가 있다. 가까운 쪽으로 고르면 그
    // 밑을 딛어서 사람이 바닥에 파묻힌다
    setHeightPlate(0, 0, 0, 2, 2, -3)
    expect(resolveDynamicHeight(0, 0, 0, -3)).toBe(0)
    setHeightPlate(0, 0, 0, 2, 2, 0)
    expect(resolveDynamicHeight(0, 0, 0, 0)).toBe(0)
  })

  it('⚠️ 높으면 지금 높이에 가까운 쪽을 딛는다', () => {
    // 승강판이 올라간 뒤 그 위에 선 사람은 판을, 밑을 지나는 사람은 바닥을 딛는다
    setHeightPlate(0, 0, 0, 2, 2, 10)
    expect(resolveDynamicHeight(0, 0, 0, 10)).toBe(10)
    expect(resolveDynamicHeight(0, 0, 0, 0)).toBe(0)
    // 딱 가운데면 바닥이 이긴다 (`bdhcHeightDiff <= dynamicHeightDiff`)
    expect(resolveDynamicHeight(0, 0, 0, 5)).toBe(0)
  })

  it('구워진 높이가 없는 칸이면 판이 곧 지면이다', () => {
    setHeightPlate(0, 0, 0, 2, 2, 4)
    expect(resolveDynamicHeight(null, 0, 0, 0)).toBe(4)
    expect(resolveDynamicHeight(null, 9, 9, 0)).toBeNull()
  })
})
