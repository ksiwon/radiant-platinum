import { describe, expect, it } from 'vitest'
import { distortionShardLayout } from './DistortionAmbience'

describe('distortionShardLayout', () => {
  it('is deterministic and fills three dimensions', () => {
    const first = distortionShardLayout(24)
    expect(distortionShardLayout(24)).toEqual(first)
    expect(new Set(first.map((shard) => shard.y)).size).toBeGreaterThan(4)
    expect(first.every((shard) => Math.hypot(shard.x, shard.z) >= 4.999)).toBe(true)
  })
})
