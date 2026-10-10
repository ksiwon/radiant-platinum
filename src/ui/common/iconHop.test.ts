// 아이콘 뜀의 박자 (`iconHop.ts`) — 원작 만피 8f · 초록 12f · 노랑 24f · 빨강 40f.
//
// 색은 비율이 아니라 **게이지 픽셀 수**가 정한다 (`healthbar.barColorAt`). 48픽셀 중 24 넘으면 초록, 9 넘으면
// 노랑이다 — 79 중 16이 비율로는 노랑인데 픽셀로는 빨강인 자리가 있다.
import { describe, expect, it } from 'vitest'
import { HOP, iconHop, iconHopFrames } from './iconHop'

describe('박자', () => {
  it('만피는 8프레임이다', () => {
    expect(iconHopFrames(100, 100)).toBe(8)
    expect(iconHopFrames(1, 1)).toBe(8)
  })

  it('초록 12 · 노랑 24 · 빨강 40', () => {
    expect(iconHopFrames(99, 100)).toBe(12)
    expect(iconHopFrames(60, 100)).toBe(12)
    expect(iconHopFrames(50, 100)).toBe(24)
    expect(iconHopFrames(21, 100)).toBe(24)
    expect(iconHopFrames(20, 100)).toBe(40)
    expect(iconHopFrames(1, 100)).toBe(40)
  })

  it('경계는 픽셀로 정한다 — 79 중 16은 비율로는 노랑이지만 빨강이다', () => {
    expect(iconHopFrames(16, 79)).toBe(40)
    expect(iconHopFrames(17, 79)).toBe(24)
  })

  it('기절하면 안 뛴다', () => {
    expect(iconHopFrames(0, 100)).toBeNull()
    expect(iconHopFrames(-3, 100)).toBeNull()
    expect(iconHopFrames(10, 0)).toBeNull()
  })

  it('상태 이상이면 안 뛴다 — ok와 빈 이름은 상태가 아니다', () => {
    for (const status of ['psn', 'tox', 'brn', 'frz', 'par', 'slp']) {
      expect(iconHopFrames(100, 100, status), status).toBeNull()
    }
    expect(iconHopFrames(100, 100, 'ok')).toBe(8)
    expect(iconHopFrames(100, 100, null)).toBe(8)
    expect(iconHopFrames(100, 100, '')).toBe(8)
  })
})

describe('뜀의 폭', () => {
  it('위로 3, 아래로 1 원본px에 배율을 곱한다', () => {
    expect(HOP).toEqual({ up: 3, down: 1 })
    for (const scale of [1, 2, 3, 4] as const) {
      const hop = iconHop(100, 100, null, scale)!
      expect(hop.style).toMatchObject({ '--hop-up': `-${String(3 * scale)}px`, '--hop-down': `${String(1 * scale)}px` })
    }
  })

  it('박자가 초 단위 기간이 된다 (프레임 ÷ 60)', () => {
    expect(iconHop(100, 100, null, 1)!.style.animationDuration).toBe('0.1333s')
    expect(iconHop(10, 100, null, 1)!.style.animationDuration).toBe('0.6667s')
  })

  it('안 뛰면 null이다', () => {
    expect(iconHop(0, 100, null, 1)).toBeNull()
    expect(iconHop(100, 100, 'psn', 1)).toBeNull()
  })
})
