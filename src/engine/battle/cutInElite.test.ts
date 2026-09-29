import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { eliteCutIn } from './cutInElite'
import type { CutInFrame } from './encounterCutIn'
import { readSpa } from './spl/resource'

const spa = [1, 2].map((n) => readSpa(new Uint8Array(readFileSync(`public/data/encounterEffect/eliteParticle${String(n)}.spa`))))
function run(effect: number, gender = 0): CutInFrame[] {
  const cut = eliteCutIn(effect, { trainerName: (id) => `#${String(id)}`, playerGender: gender, particles: (n) => spa[n - 1]! })!
  const frames: CutInFrame[] = []
  for (let t = 0; t < 400; t++) {
    const f = cut.tick()
    frames.push(f)
    if (f.done) return frames
  }
  throw new Error('안 끝난다')
}
const at = (f: CutInFrame, img: string) => f.draw!.sprites.find((s) => s.img === img)
const lastIndex = (frames: CutInFrame[], ok: (f: CutInFrame) => boolean): number => {
  for (let i = frames.length - 1; i >= 0; i--) if (ok(frames[i]!)) return i
  return -1
}

describe('사천왕 · 챔피언 컷인 (EncounterEffect_EliteFourChampion)', () => {
  // 사천왕은 떠는 틱이 32 · 챔피언은 9라 23틱 짧다
  it.each([[20, 118], [23, 118], [24, 95]])('%i번은 F%i에 희게 끝난다', (effect, end) => {
    const frames = run(effect)
    expect(frames.length - 1).toBe(end)
    expect(frames.at(-1)!.flash).toBe(1)
  })

  it('두 얼굴이 −128 → 56 · 384 → 200으로 들어온다 (Quad v0 ±80 · 6단)', () => {
    const xs = run(20).flatMap((f) => { const s = f.draw?.sprites.find((p) => p.img.startsWith('player')); return s ? [s.x] : [] })
    expect([...new Set(xs.map((x) => Math.round(x * 100) / 100))].slice(0, 7)).toEqual([-128, -56.22, -0.89, 38, 60.45, 66.45, 56])
  })

  it('떨고 난 기준 자리 — 사천왕은 주인공 (54, 90) · 상대 (202, 94)', () => {
    const frames = run(20)
    const next = frames[lastIndex(frames, (f) => f.draw?.name !== undefined) + 1]!
    // 들어오는 보간이 fx32 반올림으로 56.002 · 199.998에서 멈춘다 — 픽셀로는 원작 조사표 그대로다
    const px = (img: string): number[] => [Math.round(at(next, img)!.x), Math.round(at(next, img)!.y)]
    expect(px('playerMale')).toEqual([54, 90])
    expect(px('elite0')).toEqual([202, 94])
  })

  it('어두울 때는 주인공 팔레트가 뒤바뀌고 밝아지며 제 것이 된다 (원작 버그)', () => {
    const frames = run(20, 1)
    expect(frames.some((f) => at(f, 'playerFemaleSwap')?.dark === 14 / 16)).toBe(true)
    expect(frames.some((f) => at(f, 'playerFemale')?.dark === 0)).toBe(true)
  })

  it('입자 107은 얼굴 앞 · 108은 얼굴 뒤 — 107이 다 죽어야 밝아진다', () => {
    const frames = run(20)
    const first = frames.findIndex((f) => f.draw?.particles)
    expect(frames[first]!.draw!.particles!.front).toBe(true)
    const back = frames.findIndex((f) => f.draw?.particles?.front === false)
    expect(back).toBeGreaterThan(first)
    // 앞 입자가 사라진 뒤에 흰 번쩍임이 선다
    const lastFront = lastIndex(frames, (f) => f.draw?.particles?.front === true)
    const white = frames.findIndex((f, i) => i > lastFront && f.flash > 0)
    expect(white).toBeGreaterThan(lastFront)
  })

  it('얼린 들판은 4/16 — 번쩍임 여덟 틱째부터', () => {
    const frames = run(20)
    expect(frames.findIndex((f) => f.draw?.darken === 12 / 16)).toBe(10)
  })
})
