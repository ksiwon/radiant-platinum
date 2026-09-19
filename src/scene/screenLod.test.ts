// 화면 픽셀로 고르는 LOD (FIRST_PERSON §10.2).
import { describe, expect, it } from 'vitest'
import {
  LOD_FAR_PX, LOD_HYSTERESIS, LOD_NEAR_PX, pickLod, screenPixels, type LodBand,
} from './screenLod'

describe('화면 픽셀', () => {
  it('명세의 식 그대로다', () => {
    // 높이 2 · 창 720 · 깊이 10 · 세로 화각 55°
    const got = screenPixels(2, 720, 10, 55)
    expect(got).toBeCloseTo((2 * 720) / (2 * 10 * Math.tan((55 * Math.PI) / 360)), 6)
  })

  it('깊이가 두 배면 절반이다', () => {
    expect(screenPixels(2, 720, 20, 55)).toBeCloseTo(screenPixels(2, 720, 10, 55) / 2, 6)
  })

  it('화각이 좁으면 같은 거리에서도 크다 — 월드 거리로는 못 가른다', () => {
    // 깨어진 세계는 8.09°다 (PARITY §6.10)
    expect(screenPixels(2, 720, 30, 8.09)).toBeGreaterThan(screenPixels(2, 720, 30, 55) * 6)
  })

  it('카메라 뒤나 코앞은 제일 자세한 쪽이다', () => {
    expect(screenPixels(2, 720, 0, 55)).toBe(Infinity)
    expect(screenPixels(2, 720, -3, 55)).toBe(Infinity)
    expect(pickLod(screenPixels(2, 720, -3, 55), null)).toBe(0)
  })
})

describe('문턱과 벌림', () => {
  it('처음 보는 것은 문턱 그대로 가른다', () => {
    expect(pickLod(LOD_NEAR_PX, null)).toBe(0)
    expect(pickLod(LOD_NEAR_PX - 0.01, null)).toBe(1)
    expect(pickLod(LOD_FAR_PX, null)).toBe(1)
    expect(pickLod(LOD_FAR_PX - 0.01, null)).toBe(2)
  })

  it('경계 근처에서 흔들어도 안 왕복한다', () => {
    // 제자리에서 고개를 까딱이는 동안 크기가 문턱 ±10%를 오간다
    let band: LodBand | null = null
    const seen: LodBand[] = []
    for (let i = 0; i < 200; i++) {
      const px = LOD_NEAR_PX * (1 + 0.1 * Math.sin(i * 0.7))
      band = pickLod(px, band)
      seen.push(band)
    }
    const flips = seen.filter((b, i) => i > 0 && b !== seen[i - 1]).length
    expect(flips, '±10% 흔들림에 모양이 바뀌었다').toBe(0)
  })

  it('15%를 넘게 벗어나면 넘어간다', () => {
    expect(pickLod(LOD_NEAR_PX * (1 - LOD_HYSTERESIS) - 0.1, 0)).toBe(1)
    expect(pickLod(LOD_NEAR_PX * (1 + LOD_HYSTERESIS) + 0.1, 1)).toBe(0)
    expect(pickLod(LOD_FAR_PX * (1 - LOD_HYSTERESIS) - 0.1, 1)).toBe(2)
    expect(pickLod(LOD_FAR_PX * (1 + LOD_HYSTERESIS) + 0.1, 2)).toBe(1)
  })

  it('한 번에 두 칸을 건너뛸 수 있다 — 순간이동 뒤', () => {
    expect(pickLod(5, 0)).toBe(2)
    expect(pickLod(1000, 2)).toBe(0)
  })
})
