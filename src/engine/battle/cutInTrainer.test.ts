import { describe, expect, it } from 'vitest'
import { trainerCutIn } from './cutInTrainer'
import { specialCutInFor, type CutInFrame } from './encounterCutIn'
import { TRAINER_CLASS } from '../audio/battleSongs'

/** F0부터 끝난 틱까지 돌린다 */
function run(effect: number): { done: number, frames: CutInFrame[] } {
  const cut = trainerCutIn(effect)!
  const frames: CutInFrame[] = []
  for (let t = 0; t < 400; t++) {
    const f = cut.tick()
    frames.push(f)
    if (f.done) return { done: t, frames }
  }
  throw new Error('안 끝난다')
}

describe('트레이너 컷인 (encounter_effect_core.c)', () => {
  // 원작 셈을 따로 밟은 끝 틱 (F0 = 효과 태스크의 첫 틱) — 조사표
  it.each([
    [6, 47], [7, 47], [8, 45], [9, 47], [10, 49], [11, 86], [29, 47], [30, 42], [27, 74],
  ])('%i번은 F%i에 끝난다', (effect, at) => {
    expect(run(effect).done).toBe(at)
  })

  it('번쩍임 — F2부터 0 · 5 · 10 · 16 · 16 · 11 · 6 · 0을 두 번 (낮음은 검정)', () => {
    const { frames } = run(6)
    expect(frames.slice(2, 24).map((f) => Math.round(f.flash * 16)))
      .toEqual([0, 0, 0, -5, -10, -16, -16, -16, -11, -6, 0, 0, 0, -5, -10, -16, -16, -16, -11, -6, 0, 0])
  })

  it('풀숲 · 낮음 — 공이 0.01에서 1까지 커지고 반으로 갈라 255까지 민다', () => {
    const { frames } = run(6)
    const scale = frames.flatMap((f) => f.draw?.sprites.filter((s) => s.half === undefined).map((s) => s.scaleX) ?? [])
    expect(scale[0]).toBeCloseTo(0.01, 2)
    expect(scale.at(-1)).toBeCloseTo(1, 2)
    const xs = frames.flatMap((f) => f.draw?.sprites.filter((s) => s.half === 'top').map((s) => 128 - s.x) ?? [])
    // 세우는 틱(0)과 첫 보간(0) — 원작도 0이 두 번이다
    expect([...new Set(xs.map((x) => Math.round(x * 100) / 100))]).toEqual([0, 15.42, 41.67, 78.75, 126.67, 185.42, 255])
  })

  it('굴 · 높음 — 칸 마흔여덟이 밑 줄부터 한 칸씩 검어진다', () => {
    const { frames } = run(11)
    // 끝나는 틱은 온통 검다 — 그 앞 틱을 본다
    const last = frames.at(-2)!.draw!.paint
    expect(last).toHaveLength(48)
    expect(last[0]).toEqual([0, 160, 32, 32])
    expect(last[47]).toEqual([4 * 32, 0, 32, 32])
  })

  it('물 · 높음 — 기둥이 F31 · F36 · F39에 서고 물결은 F15부터 두 줄마다 뒤집힌다', () => {
    const { frames } = run(9)
    const first = (n: number): number => frames.findIndex((f) => (f.draw?.sprites.length ?? 0) >= n)
    expect([first(1), first(2), first(3)]).toEqual([31, 36, 39])
    expect(frames.findIndex((f) => f.ripple !== null)).toBe(15)
    expect(frames[20]!.ripple?.interleave).toBe(true)
  })

  it('갤럭시 조무래기 — 공 여섯이 F29 · 33 · 38 · 41 · 45 · 49에 나서 (128, 100)으로 모인다', () => {
    const { frames } = run(27)
    const launches: number[] = []
    let seen = 0
    for (const [t, f] of frames.entries()) {
      const n = f.draw?.sprites.length ?? 0
      if (n > seen) launches.push(t)
      seen = Math.max(seen, n)
      if (n < seen) seen = n
    }
    expect(launches.slice(0, 2)).toEqual([29, 33])
  })
})

describe('특별 컷인 고르기 (EncEffects_GetEffectPair)', () => {
  const C = TRAINER_CLASS
  const pick = (trainerClass: number | null, doubles: boolean, foeSpecies = 0): number | null =>
    specialCutInFor({ trainerClass, doubles, foeSpecies })
  it('관장 · 사천왕 · 챔피언은 제 것 — 라이벌과 보통 트레이너는 지형대로', () => {
    expect(pick(C.leaderRoark, false)).toBe(12)
    expect(pick(C.leaderVolkner, false)).toBe(19)
    expect(pick(C.eliteFourAaron, false)).toBe(20)
    expect(pick(C.championCynthia, false)).toBe(24)
    expect(pick(C.rival, false)).toBeNull()
    expect(pick(1, false)).toBeNull()
  })
  it('더블은 관장이어도 더블 — 갤럭시단만 더블이어도 제 것', () => {
    expect(pick(C.leaderVolkner, true)).toBe(30)
    expect(pick(1, true)).toBe(30)
    expect(pick(C.galacticGruntMale, true)).toBe(27)
    expect(pick(C.commanderMars, true)).toBe(28)
    expect(pick(C.galacticBoss, false)).toBe(28)
  })
  it('야생 — 쉐이미 · 기라티나 · 레지 · 히드런은 신화, 디아루가 · 유크시 · 아르세우스는 전설, 엠라이트 · 크레세리아는 지형대로', () => {
    expect(pick(null, false, 492)).toBe(25)
    expect(pick(null, false, 487)).toBe(25)
    expect(pick(null, false, 485)).toBe(25)
    expect(pick(null, false, 483)).toBe(26)
    expect(pick(null, false, 480)).toBe(26)
    expect(pick(null, false, 493)).toBe(26)
    expect(pick(null, false, 481)).toBeNull()
    expect(pick(null, false, 488)).toBeNull()
    expect(pick(null, true, 396)).toBe(30)
    expect(pick(null, true, 487)).toBe(25)
  })
})
