import { describe, expect, it } from 'vitest'
import { idleRenderObjects, stampDrawn } from './glResourceRelease'

describe('렌더 물체 치우기 (`glResourceRelease`)', () => {
  it('오래 안 그려진 것만 고른다 — 잠깐 떨어진 것은 남긴다', () => {
    const now = 1_000_000
    const fresh = stampDrawn({ name: 'fresh' }, now - 5_000)
    const brief = stampDrawn({ name: 'brief' }, now - 119_000)
    const old = stampDrawn({ name: 'old' }, now - 120_000)
    expect(idleRenderObjects([fresh, brief, old], now).map((r) => r.name)).toEqual(['old'])
  })

  it('시각이 안 찍힌 것은 지금 만든 것으로 본다', () => {
    expect(idleRenderObjects([{}], 5)).toEqual([])
  })
})
