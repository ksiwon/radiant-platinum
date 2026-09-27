// 플레이 시간 (`play_time.c`) — 흐른 초만큼 더하고 999:59:59에서 선다
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLAYTIME_MAX_MS, addPlaytimeCapped, startPlayClock } from './playTime'
import { useSaveStore } from '../../state/saveStore'

afterEach(() => { vi.useRealTimers() })

describe('플레이 시간', () => {
  it('999:59:59에서 멈춘다', () => {
    expect(PLAYTIME_MAX_MS).toBe(3_599_999_000)
    expect(addPlaytimeCapped(PLAYTIME_MAX_MS - 1000, 5000)).toBe(PLAYTIME_MAX_MS)
    expect(addPlaytimeCapped(0, -5)).toBe(0)
  })

  it('초 단위로 더하고, 모자란 몫은 다음에 넘긴다', () => {
    vi.useFakeTimers()
    let t = 0
    const added: number[] = []
    const stop = startPlayClock((ms) => { added.push(ms) }, () => t)
    t = 900; vi.advanceTimersByTime(250)
    expect(added).toEqual([])
    t = 2400; vi.advanceTimersByTime(250)
    expect(added).toEqual([2000])
    t = 3100; stop()
    expect(added).toEqual([2000, 1000])
    // 끈 뒤로는 안 더한다
    t = 9000; vi.advanceTimersByTime(1000)
    expect(added).toEqual([2000, 1000])
  })

  it('리포트의 플레이 시간이 는다 (`addPlaytime`)', () => {
    const before = useSaveStore.getState().trainer.playtimeMs
    useSaveStore.getState().addPlaytime(61_000)
    expect(useSaveStore.getState().trainer.playtimeMs).toBe(addPlaytimeCapped(before, 61_000))
  })
})
