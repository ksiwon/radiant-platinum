import { describe, expect, it } from 'vitest'
import { cinematicScale, evolutionPose, hatchPose, tradePose } from './cinematicMotion'
import { EVO_BEATS, EVO_CLAMP_FRAMES } from '../engine/pokemon/evolutionBeat'
import { EGG_BEATS } from '../engine/pokemon/hatchBeat'

describe('cinematic 3D motion', () => {
  it('keeps only the evolved body after the change', () => {
    expect(evolutionPose('done', EVO_BEATS.end, EVO_BEATS)).toMatchObject({
      beforeVisible: false, afterVisible: true, afterScale: 1, beforeScale: 0,
    })
    // 교대가 끝나는 프레임에 이미 새 몸으로 앉는다 — 가게가 늦게 알려도 마찬가지다
    expect(evolutionPose('changing', EVO_BEATS.swap, EVO_BEATS)).toMatchObject({
      beforeVisible: false, afterVisible: true, afterScale: 1,
    })
  })

  it('restores the original body when evolution is canceled', () => {
    expect(evolutionPose('canceled', 1, EVO_BEATS)).toMatchObject({
      beforeVisible: true, afterVisible: false, beforeScale: 1, white: 0,
    })
  })

  it('holds the old body still until the clamp has closed', () => {
    // 띠가 닫히는 40프레임 동안은 교대가 시작하지 않는다 (`CLAMP_IN`)
    for (const f of [0, 10, 39]) {
      const pose = evolutionPose('changing', f, EVO_BEATS)
      expect(pose.beforeScale, `프레임 ${String(f)}`).toBe(1)
      expect(pose.afterScale).toBe(0)
    }
    expect(evolutionPose('changing', EVO_CLAMP_FRAMES + 16, EVO_BEATS).afterScale)
      .toBeGreaterThan(0)
  })

  it('bleaches both bodies white while they trade places', () => {
    expect(evolutionPose('changing', 0, EVO_BEATS).white).toBe(0)
    // 80프레임이면 다 하얘진다 (`PokemonSprite_StartFade(…, 0, 16, 4, …)`)
    expect(evolutionPose('changing', 80, EVO_BEATS).white).toBeCloseTo(1)
    expect(evolutionPose('done', EVO_BEATS.end, EVO_BEATS).white).toBeCloseTo(0)
  })

  it('hides the egg after hatching', () => {
    expect(hatchPose('born', 2, EGG_BEATS).shellVisible).toBe(false)
  })

  it('holds the egg still for the first 25 frames', () => {
    // 원작이 `subStateTimer >= 25`를 세고 나서야 흔든다
    expect(hatchPose('shaking', 10, EGG_BEATS).rock).toBe(0)
    expect(hatchPose('shaking', 10, EGG_BEATS).shellVisible).toBe(true)
    // 껍질은 터진 뒤에 사라진다
    expect(hatchPose('shaking', EGG_BEATS.hide, EGG_BEATS).shellVisible).toBe(false)
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
