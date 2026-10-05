import { describe, expect, it } from 'vitest'
import { outerFloorY } from './OuterFloor'

describe('던전 가장자리 원판', () => {
  it('가장 낮은 땅 밑 0.3칸에 깔고, 땅을 못 쟀으면 안 깐다', () => {
    expect(outerFloorY(2)).toBeCloseTo(1.7, 9)
    expect(outerFloorY(-1.5)).toBeCloseTo(-1.8, 9)
    expect(outerFloorY(null)).toBeNull()
  })
})
