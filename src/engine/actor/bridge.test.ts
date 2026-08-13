// 다리 위인가 밑인가 (PARITY §1.16)
//
// ⚠️ 여기서 재는 것은 **들어온 길이 층을 정한다**는 것이다. 칸 하나에 통행
// 허가도 거동값도 하나뿐이라, 이 상태가 없으면 다리 밑이 곧 다리 위가 된다.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BRIDGE_START, isBikeBridge, isBikeBridgeEastWest, isBikeBridgeNorthSouth,
  isBridge, isBridgeStart, onBridgeAfterStep, onElevatedBridge, resetBridge, trackBridge,
} from './bridge'

/** `map_tile_behaviors.h`에서 실측한 자리 */
const PLAIN = 0x00
const BRIDGE = 0x71
const BRIDGE_OVER_WATER = 0x73
const BRIDGE_OVER_SAND = 0x74
const BRIDGE_OVER_SNOW = 0x75
const BIKE_NS = 0x76
const BIKE_NS_SAND = 0x79
const BIKE_EW = 0x7a
const BIKE_EW_SAND = 0x7d

describe('다리 거동값', () => {
  it('어귀는 다리가 아니다', () => {
    // 원작이 `IsBridgeStart`와 `IsBridge`를 따로 두고, 어귀는 `IsBridge`에서 빠진다.
    // 합쳐 두면 어귀에 서 있는 동안 「내려선 것」이 안 된다
    expect(isBridgeStart(BRIDGE_START)).toBe(true)
    expect(isBridge(BRIDGE_START)).toBe(false)
  })

  it('0x71부터 0x7d까지가 다리다', () => {
    for (const b of [BRIDGE, BRIDGE_OVER_WATER, BRIDGE_OVER_SAND, BRIDGE_OVER_SNOW,
      BIKE_NS, BIKE_NS_SAND, BIKE_EW, BIKE_EW_SAND]) {
      expect(isBridge(b), `0x${b.toString(16)}`).toBe(true)
    }
    expect(isBridge(0x70)).toBe(false)
    expect(isBridge(0x7e)).toBe(false)
  })

  it('⚠️ 자전거 다리는 0x76부터다 — 모래·눈 다리는 아니다', () => {
    // 0x74·0x75를 자전거 다리로 묶으면 사막과 설원의 다리에서 자전거가 잠긴다
    expect(isBikeBridge(BRIDGE_OVER_SAND)).toBe(false)
    expect(isBikeBridge(BRIDGE_OVER_SNOW)).toBe(false)
    expect(isBikeBridgeNorthSouth(BIKE_NS)).toBe(true)
    expect(isBikeBridgeNorthSouth(BIKE_NS_SAND)).toBe(true)
    expect(isBikeBridgeNorthSouth(BIKE_EW)).toBe(false)
    expect(isBikeBridgeEastWest(BIKE_EW)).toBe(true)
    expect(isBikeBridgeEastWest(BIKE_EW_SAND)).toBe(true)
  })
})

describe('들어온 길이 층을 정한다', () => {
  beforeEach(() => { resetBridge() })

  it('어귀를 밟아야 올라선다', () => {
    expect(onBridgeAfterStep(false, BRIDGE_START)).toBe(true)
  })

  it('⚠️ 옆에서 다리 칸에 들어서는 것으로는 안 오른다', () => {
    // 이게 「다리 밑을 지나간다」의 전부다
    expect(onBridgeAfterStep(false, BRIDGE)).toBe(false)
    expect(onBridgeAfterStep(false, BIKE_NS)).toBe(false)
  })

  it('다리를 건너는 내내 붙어 있다', () => {
    let on = onBridgeAfterStep(false, BRIDGE_START)
    for (const b of [BRIDGE, BRIDGE_OVER_WATER, BIKE_NS]) on = onBridgeAfterStep(on, b)
    expect(on).toBe(true)
  })

  it('다리가 아닌 칸을 밟으면 풀린다', () => {
    const on = onBridgeAfterStep(onBridgeAfterStep(false, BRIDGE_START), PLAIN)
    expect(on).toBe(false)
  })

  it('맵을 옮기면 풀린다', () => {
    trackBridge(BRIDGE_START)
    expect(onElevatedBridge()).toBe(true)
    resetBridge()
    expect(onElevatedBridge()).toBe(false)
  })

  it('밑으로 지나간 다음에도 위로 올라갈 수 있다', () => {
    // 밑을 지나 (다리 칸 여럿) → 어귀를 밟고 올라선다
    trackBridge(BRIDGE)
    trackBridge(BRIDGE_OVER_WATER)
    expect(onElevatedBridge()).toBe(false)
    trackBridge(BRIDGE_START)
    trackBridge(BRIDGE)
    expect(onElevatedBridge()).toBe(true)
  })
})
