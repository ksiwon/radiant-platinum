import { describe, expect, it } from 'vitest'
import { add, cross, dist3, dot, len, lerp3, norm, scale, sub } from './vec3'

describe('vec3', () => {
  it('기본 연산', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9])
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3])
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6])
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32)
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
    expect(len([3, 4, 0])).toBe(5)
    expect(dist3([1, 1, 1], [1, 4, 5])).toBe(5)
  })
  it('norm은 길이 1 — 영벡터는 그대로 영벡터', () => {
    expect(len(norm([0, 3, 4]))).toBeCloseTo(1, 12)
    expect(norm([0, 0, 0])).toEqual([0, 0, 0])
  })
  it('lerp3는 양 끝과 가운데', () => {
    expect(lerp3([0, 2, 4], [10, 12, 14], 0)).toEqual([0, 2, 4])
    expect(lerp3([0, 2, 4], [10, 12, 14], 1)).toEqual([10, 12, 14])
    expect(lerp3([0, 2, 4], [10, 12, 14], 0.5)).toEqual([5, 7, 9])
  })
})
