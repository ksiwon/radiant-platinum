import { describe, expect, it } from 'vitest'
import { bannerCutIn } from './cutInBanner'
import type { CutInFrame } from './encounterCutIn'

const ctx = { trainerName: (id: number) => `#${String(id)}`, playerGender: 0 }
/** F0부터 끝난 틱까지 */
function run(effect: number): CutInFrame[] {
  const cut = bannerCutIn(effect, ctx)!
  const frames: CutInFrame[] = []
  for (let t = 0; t < 400; t++) {
    const f = cut.tick()
    frames.push(f)
    if (f.done) return frames
  }
  throw new Error('안 끝난다')
}

describe('띠 · 전설 컷인 (encounter_effect_core.c)', () => {
  // 원작 태스크를 틱마다 밟아 센 끝 틱 — 번쩍임 한 번(열 틱)에 관장은 VS 열여섯 부름 · 얼굴 다섯 걸음 · 밝기 둘 · 기다림 26 · 페이드 15
  it.each([[12, 122], [19, 122], [25, 86], [26, 135], [28, 75]])('%i번은 F%i에 끝난다', (effect, at) => {
    expect(run(effect).length - 1).toBe(at)
  })

  it('관장 — 끝은 희고 검지 않다 (BRIGHTNESS_OUT · COLOR_WHITE)', () => {
    const last = run(12).at(-1)!
    expect(last.flash).toBe(1)
    expect(last.black).toBe(0)
  })

  it('관장 — 띠는 톱니로 오른쪽부터 드러나 한 틱에 30px씩 흐른다', () => {
    const frames = run(12)
    const first = frames.findIndex((f) => f.draw?.banner)
    const b = frames[first]!.draw!.banner!
    // 건 틱은 255에서 톱니를 뺀 자리 — 40줄은 톱니 16
    expect(b.reveal![0]).toBe(239)
    expect(frames[first + 1]!.draw!.banner!.scroll).toBe(30)
    // 일곱 번째 보간이 0이고 그다음 틱에 창이 꺼진다
    expect(frames[first + 7]!.draw!.banner!.reveal![0]).toBe(0)
    expect(frames[first + 8]!.draw!.banner!.reveal).toBeNull()
  })

  it('관장 — 얼굴이 272 → 220.375 · 193.5 · 191.375 · 214로 들어와 선다 (Quad v0 −64 · 4단)', () => {
    const xs = run(12).flatMap((f) => f.draw?.sprites.filter((s) => s.img === 'leader0').map((s) => s.x) ?? [])
    expect([...new Set(xs)].slice(0, 5)).toEqual([272, 220.375, 193.5, 191.375, 214])
  })

  it('관장 — 흰 번쩍임이 끝나는 틱에 얼굴이 제 색 · 3D가 14/16 어두워지고 이름이 x 122에 선다', () => {
    const frames = run(12)
    const lit = frames.findIndex((f) => f.draw?.name)
    expect(frames[lit]!.flash).toBe(1)
    expect(frames[lit]!.draw!.darken).toBe(14 / 16)
    expect(frames[lit]!.draw!.name).toEqual({ text: '#246', x: 122, y: 80, w: 128 })
    expect(frames[lit - 1]!.draw!.sprites[0]!.dark).toBe(14 / 16)
    expect(frames[lit]!.draw!.sprites[0]!.dark).toBe(0)
  })

  it('갤럭시 보스 — 「G」가 열다섯 단에 비치고, 날개가 닫힌 앞 틱은 온통 검다', () => {
    const frames = run(28)
    const alphas = frames.flatMap((f) => f.draw?.sprites.map((s) => s.alpha ?? 1) ?? [])
    expect(alphas[0]).toBe(0)
    expect(alphas).toContain(1)
    const closed = frames.at(-2)!.draw!.mask
    expect(closed).toHaveLength(192)
    expect(closed.every(([x, , w]) => x === 0 && w === 256)).toBe(true)
  })

  it('환상 — 카메라 컷 열여섯이 원작 기다림(4 · 4 · 4 · 3 …)대로 선다', () => {
    const frames = run(25)
    const cuts: number[] = []
    let last = ''
    for (const [t, f] of frames.entries()) {
      const key = JSON.stringify([f.orbit, f.fovScale])
      if (f.orbit && key !== last) cuts.push(t)
      last = key
    }
    // 컷 사이는 **다음 컷의** 기다림 + 1이다 (셈이 0 밑으로 내려간 틱에 선다) — 둘째 · 셋째 · 넷째가 4 · 4 · 3
    expect(cuts.slice(1, 4).map((t, i) => t - cuts[i]!)).toEqual([5, 5, 4])
    expect(frames.find((f) => f.blur)?.blur).toEqual({ eva: 3, evb: 15 })
  })

  it('전설 — 화각이 0x5C1에서 0x6C1로 넓어진 뒤 돌진하고, 팔은 25%에서 멈춘다', () => {
    const frames = run(26)
    const zoom = frames.map((f) => f.fovScale ?? 1)
    expect(Math.max(...zoom)).toBeCloseTo(Math.tan((0x6c1 * Math.PI * 2) / 65536) / Math.tan((0x5c1 * Math.PI * 2) / 65536), 6)
    expect(Math.min(...frames.map((f) => f.dolly))).toBe(0.25)
    expect(frames.find((f) => f.blur)?.blur).toEqual({ eva: 5, evb: 13 })
  })
})
