import { describe, expect, it } from 'vitest'
import { cinematicScale, evolutionPose, hatchPose } from './cinematicMotion'

describe('cinematic 3D motion', () => {
  it('keeps only the evolved body after the change', () => {
    expect(evolutionPose('done', 3)).toMatchObject({
      beforeVisible: false, afterVisible: true, afterScale: 1,
    })
  })

  it('restores the original body when evolution is canceled', () => {
    expect(evolutionPose('canceled', 1)).toMatchObject({
      beforeVisible: true, afterVisible: false, beforeScale: 1,
    })
  })

  it('hides the egg after hatching', () => {
    expect(hatchPose('born', 2).shellVisible).toBe(false)
  })

  it('fits tall models without enlarging them beyond the stage limit', () => {
    expect(cinematicScale(4)).toBeCloseTo(0.6125)
    expect(cinematicScale(0.4)).toBe(1.65)
  })
})
