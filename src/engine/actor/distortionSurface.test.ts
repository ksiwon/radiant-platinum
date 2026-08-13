import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import type { DistortionFrame } from '../world/distortion'
import { surfaceHeading, surfaceQuaternion, surfaceVector } from './distortionSurface'

const FLOOR: DistortionFrame = { axis: 'x', sign: 1, lock: 0, lockAxis: 'y' }
const CEILING: DistortionFrame = { axis: 'x', sign: -1, lock: 0, lockAxis: 'y' }
const WEST: DistortionFrame = { axis: 'y', sign: -1, lock: 0, lockAxis: 'x' }
const EAST: DistortionFrame = { axis: 'y', sign: 1, lock: 0, lockAxis: 'x' }

describe('distortion surface frame', () => {
  it.each([
    [FLOOR, [0, 1, 0]],
    [CEILING, [0, -1, 0]],
    [WEST, [1, 0, 0]],
    [EAST, [-1, 0, 0]],
  ] as const)('maps local up to the platform normal', (frame, normal) => {
    const got = surfaceVector(frame, 0, 1, 0, new Vector3()).toArray()
    got.forEach((value, index) => { expect(value).toBeCloseTo(normal[index]!) })
  })

  it('keeps the model forward tangent to every platform', () => {
    for (const frame of [FLOOR, CEILING, WEST, EAST]) {
      const q = surfaceQuaternion(frame, 0, new Quaternion())
      const got = new Vector3(0, 0, 1).applyQuaternion(q).toArray()
      got.forEach((value, index) => { expect(value).toBeCloseTo([0, 0, 1][index]!) })
    }
  })

  it('derives wall heading from vertical velocity', () => {
    expect(surfaceHeading(WEST, 0, -2, 0, 0)).toBeCloseTo(Math.PI / 2)
    expect(surfaceHeading(EAST, 0, 2, 0, 0)).toBeCloseTo(Math.PI / 2)
  })
})
