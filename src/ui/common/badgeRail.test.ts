// 배지 줄 — 위 줄(0~3)과 아래 줄(4~7)이 같은 정사각 칸의 같은 기준선에 서고, 확대는 40 창의 정수배만이다
// (DECISIONS 사용자 지적 ①). 카드(`TrainerCard`)와 타이틀 · 시작 엿보기가 같은 창을 쓴다.
import { describe, expect, it } from 'vitest'
import { DATA, decodePng, withData } from '../../data/romData.testkit'
import { resolve } from 'node:path'
import { BADGE_WINDOW, BADGE_WINDOW_TOP, badgeArtStyle, badgeScale } from './BadgeRail'

describe('창과 배율', () => {
  it('창은 40이고 위 줄은 0, 아래 줄은 23에서 시작한다', () => {
    expect(BADGE_WINDOW).toBe(40)
    expect([...BADGE_WINDOW_TOP]).toEqual([0, 0, 0, 0, 23, 23, 23, 23])
  })

  it('40 이상은 정수배만 쓴다', () => {
    expect(badgeScale(40)).toBe(1)
    expect(badgeScale(80)).toBe(2)
    expect(badgeScale(95)).toBe(2)
    expect(badgeScale(20)).toBe(0.5)
  })

  it('위 줄과 아래 줄이 창 안에서 다른 높이를 잘라 같은 기준선에 선다', () => {
    const top = badgeArtStyle(null, 0, 2)
    const low = badgeArtStyle(null, 4, 2)
    expect(top.width).toBe(80)
    expect(low.height).toBe(80)
    expect(top.backgroundPosition).toBe('-0px -0px')
    expect(low.backgroundPosition).toBe(`-${String(4 * 40 * 2)}px -${String(23 * 2)}px`)
  })
})

withData('trainerCase/badges.png')('배지 그림 — 정사각 창에 도트가 다 든다', () => {
  it('네 줄 모두 여덟 칸 도트가 40×40 창(`BADGE_WINDOW_TOP`) 안에 있다', () => {
    const { width, height, pixels } = decodePng(resolve(DATA, 'trainerCase/badges.png'))
    const cell = { w: 40, h: 63 }
    expect(width).toBe(cell.w * 8)
    expect(height).toBe(cell.h * 4)
    for (let row = 0; row < 4; row++) {
      for (let bit = 0; bit < 8; bit++) {
        let min = Infinity
        let max = -Infinity
        for (let y = 0; y < cell.h; y++) {
          for (let x = 0; x < cell.w; x++) {
            if (pixels[((row * cell.h + y) * width + bit * cell.w + x) * 4 + 3]! > 0) { min = Math.min(min, y); max = Math.max(max, y) }
          }
        }
        expect(min).toBeGreaterThanOrEqual(BADGE_WINDOW_TOP[bit]!)
        expect(max).toBeLessThan(BADGE_WINDOW_TOP[bit]! + BADGE_WINDOW)
      }
    }
  })
})
