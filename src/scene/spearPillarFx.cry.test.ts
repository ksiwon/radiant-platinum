// 호수 요정 울음 음량 — 원작은 100이다 (`ov6_0223E140.c:1119·1342·1483`)
import { describe, expect, it, vi } from 'vitest'

const play = vi.hoisted(() => vi.fn())
vi.mock('../engine/audio/music', () => ({ music: { playCry: play, playEffect: vi.fn() } }))

const { LAKE_CRY } = await import('./spearPillarFx')

describe('호수 요정 울음', () => {
  it('음량 100 · 좌우 가운데', () => {
    expect(LAKE_CRY).toEqual({ pan: 0, volume: 100 })
  })
})
