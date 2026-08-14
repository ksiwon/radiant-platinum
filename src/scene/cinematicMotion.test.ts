import { describe, expect, it } from 'vitest'
import { cinematicScale, evolutionPose, hatchPose, tradePose } from './cinematicMotion'

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

  it('shows exactly one body per trade phase — never both', () => {
    for (const phase of ['sending', 'transit', 'arriving'] as const) {
      for (const t of [0, 0.3, 1, 2, 5]) {
        const pose = tradePose(phase, t)
        expect(pose.sendingVisible && pose.receivingVisible).toBe(false)
      }
    }
  })

  it('empties the stage while the pair crosses the link', () => {
    const pose = tradePose('transit', 0.5)
    expect(pose.sendingVisible).toBe(false)
    expect(pose.receivingVisible).toBe(false)
  })

  it('holds the sent body still while the two lines are read', () => {
    // 원작이 글 두 줄을 60프레임 간격으로 띄우고, 그동안 몸은 제자리다
    expect(tradePose('sending', 0).lift).toBe(0)
    expect(tradePose('sending', 1.5).lift).toBe(0)
    expect(tradePose('sending', 2.6).lift).toBeGreaterThan(0)
  })

  it('settles the received body on the floor at full size', () => {
    const landed = tradePose('arriving', 1)
    expect(landed.lift).toBe(0)
    expect(landed.scale).toBeCloseTo(1)
    expect(tradePose('arriving', 0).lift).toBeGreaterThan(0)
  })

  it('fits tall models without enlarging them beyond the stage limit', () => {
    expect(cinematicScale(4)).toBeCloseTo(0.6125)
    expect(cinematicScale(0.4)).toBe(1.65)
  })
})
