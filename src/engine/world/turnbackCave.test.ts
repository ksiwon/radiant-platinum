import { describe, expect, it } from 'vitest'
import {
  MAX_ROOMS_VISITED, PILLAR_ROOMS, PILLARS_FOR_GIRATINA, ROOMS_PER_PILLAR, TURNBACK_MAP,
  TURNBACK_WARP_COUNT, turnbackDestination, turnbackEntryWarp,
} from './turnbackCave'

/** 늘 첫 방을 고르는 굴림 */
const first = () => 0
/** 늘 마지막 방을 고르는 굴림 (`Math.floor(0.999 × 6)` = 5) */
const last = () => 0.999

describe('다음 방', () => {
  it('기둥 셋을 다 보면 기라티나 방이다 — 방을 몇 개 돌았든', () => {
    expect(turnbackDestination(PILLARS_FOR_GIRATINA, 0, first)).toBe(TURNBACK_MAP.giratinaRoom)
    expect(turnbackDestination(9, MAX_ROOMS_VISITED, first)).toBe(TURNBACK_MAP.giratinaRoom)
  })

  it('서른 방을 돌면 입구로 뱉어낸다', () => {
    expect(turnbackDestination(0, MAX_ROOMS_VISITED, first)).toBe(TURNBACK_MAP.entrance)
    expect(turnbackDestination(2, MAX_ROOMS_VISITED, first)).toBe(TURNBACK_MAP.entrance)
  })

  it('⚠️ 차례가 있다 — 기둥 셋이 서른 방보다 먼저다', () => {
    expect(turnbackDestination(3, MAX_ROOMS_VISITED, first)).toBe(TURNBACK_MAP.giratinaRoom)
  })

  it('본 기둥 수만큼 다른 여섯 방에서 고른다', () => {
    expect(turnbackDestination(0, 0, first)).toBe(PILLAR_ROOMS[0])
    expect(turnbackDestination(0, 0, last)).toBe(PILLAR_ROOMS[ROOMS_PER_PILLAR - 1])
    expect(turnbackDestination(1, 0, first)).toBe(PILLAR_ROOMS[ROOMS_PER_PILLAR])
    expect(turnbackDestination(2, 0, last)).toBe(PILLAR_ROOMS[ROOMS_PER_PILLAR * 3 - 1])
  })

  it('⚠️ 방 표가 두 토막이다 — 넷째부터 맵 번호가 훌쩍 뛴다', () => {
    // 271·272·273 다음이 274가 아니라 518이다. 이어질 것으로 보고 세면
    // 기둥 1의 넷째 방부터 통째로 딴 데가 나온다
    expect(PILLAR_ROOMS.slice(0, 4)).toEqual([271, 272, 273, 518])
    expect(PILLAR_ROOMS).toHaveLength(ROOMS_PER_PILLAR * 3)
    expect(new Set(PILLAR_ROOMS).size).toBe(PILLAR_ROOMS.length)
  })
})

describe('들어온 문', () => {
  it('x가 11일 때만 z를 본다', () => {
    expect(turnbackEntryWarp(11, 1)).toBe(0)
    expect(turnbackEntryWarp(11, 20)).toBe(2)
    expect(turnbackEntryWarp(11, 7)).toBe(5)
  })

  it('⚠️ x가 11이 아니면 z를 아예 안 본다', () => {
    expect(turnbackEntryWarp(20, 1)).toBe(1)
    expect(turnbackEntryWarp(20, 20)).toBe(1)
    expect(turnbackEntryWarp(3, 20)).toBe(3)
  })

  it('⚠️ 5번 문은 없다 — 문이 넷인데 값이 다섯까지 나온다', () => {
    // 원작 그대로다. 「어느 문도 아니다」라는 뜻이 되어, 그 방에서는 네 문이
    // 전부 같은 곳으로 이어진다
    expect(turnbackEntryWarp(11, 7)).toBeGreaterThanOrEqual(TURNBACK_WARP_COUNT)
  })
})
