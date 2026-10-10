import { afterEach, describe, expect, it, vi } from 'vitest'
import { worldState } from './worldState'

describe('게임 시각', () => {
  afterEach(() => { vi.useRealTimers() })

  it('기계 시계를 따라 흐른다 — 켜 둔 채로 시각이 바뀐다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 17, 37, 0))
    worldState.time.gameHour = 17 + 37 / 60
    vi.setSystemTime(new Date(2026, 9, 10, 18, 34, 0))
    expect(Math.floor(worldState.time.gameHour)).toBe(18)
    expect(Math.round((worldState.time.gameHour % 1) * 60)).toBe(34)
  })

  it('값을 쓰면 시계를 맞추고, 그 자리에서부터 흐른다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 9, 0, 0))
    worldState.time.gameHour = 20
    expect(worldState.time.gameHour).toBe(20)
    vi.setSystemTime(new Date(2026, 9, 10, 9, 30, 0))
    expect(worldState.time.gameHour).toBe(20.5)
  })

  it('정각을 쓰면 바로 그 정각을 읽는다 — 소수 오차로 한 시간대 내려가지 않는다', () => {
    for (const h of [0, 4, 10, 12, 17, 20, 23]) {
      worldState.time.gameHour = h
      expect(Math.floor(worldState.time.gameHour)).toBe(h)
    }
  })

  it('자정을 넘으면 0으로 돌아간다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0))
    worldState.time.gameHour = 23.5
    vi.setSystemTime(new Date(2026, 9, 10, 13, 0, 0))
    expect(worldState.time.gameHour).toBe(0.5)
  })

  it('음수 · 24 이상도 하루 안으로 접는다', () => {
    worldState.time.gameHour = -1
    expect(Math.floor(worldState.time.gameHour)).toBe(23)
    worldState.time.gameHour = 25
    expect(Math.floor(worldState.time.gameHour)).toBe(1)
  })
})
