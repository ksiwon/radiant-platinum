import { describe, expect, it } from 'vitest'
import { BrainIntro, FactoryBattleWipe, type FactoryTransitionFrame } from './factoryTransition'

function run(t: { tick(): FactoryTransitionFrame }): FactoryTransitionFrame[] {
  const out: FactoryTransitionFrame[] = []
  for (let i = 0; i < 400; i++) {
    const f = t.tick()
    out.push(f)
    if (f.done) return out
  }
  throw new Error('안 끝난다')
}

describe('배틀팩토리에서 배틀로 (FrontierScrCmd_3F 3 · FrontierScrCmd_47 2)', () => {
  it('보통 상대 — 흰 번쩍임 둘 뒤 띠가 밀리며 마흔 틱에 검어지고 F64에 끝난다', () => {
    const frames = run(new FactoryBattleWipe())
    expect(frames.length - 1).toBe(64)
    expect(frames.filter((f) => f.flash === 1).length).toBe(6)
    const first = frames.findIndex((f) => f.bands)
    // 첫 틱 — 띠 0은 줄 12를 한 칸 밀어, 가운데 띠 48은 줄 0, 맨 밑 띠는 −11(→ 11)을 −6(→ 250)만큼
    expect([frames[first]!.bands!.x[0], frames[first]!.bands!.y[0]]).toEqual([1, 12])
    expect([frames[first]!.bands!.x[48], frames[first]!.bands!.y[48]]).toEqual([1, 0])
    expect([frames[first]!.bands!.x[95], frames[first]!.bands!.y[95]]).toEqual([250, 11])
    expect(frames.at(-2)!.dim).toBe(1)
  })

  it('수철 — 띠가 y 80에서 여덟 줄씩 46~114로 열리고 팔레트가 틱마다 돈다', () => {
    const frames = run(new BrainIntro('수철'))
    const open = frames.map((f) => { const r = f.draw?.banner?.reveal; return r ? [r.indexOf(0), r.lastIndexOf(0) + 1] : null })
    const first = open.findIndex((b) => b !== null && b[0] !== -1)
    expect(open.slice(first, first + 6)).toEqual([[72, 88], [64, 96], [56, 104], [48, 112], [46, 114], [46, 114]])
    const pals = frames.slice(first, first + 3).map((f) => f.draw!.banner!.img.slice(-1))
    expect(new Set(pals).size).toBe(3)
  })

  it('수철 — 얼굴이 256 → 241 · 226 · 211 · 208로 들어오고, 희게 번쩍인 뒤 이름 · 어두운 방 · 제 색 얼굴', () => {
    const frames = run(new BrainIntro('수철'))
    const xs = frames.flatMap((f) => f.draw?.sprites.filter((s) => s.img === 'factoryHead').map((s) => s.x) ?? [])
    expect([...new Set(xs)]).toEqual([256, 241, 226, 211, 208])
    const lit = frames.findIndex((f) => f.draw?.name)
    expect(frames[lit]!.draw!.name).toEqual({ text: '수철', x: 116, y: 80, w: 88 })
    expect(frames[lit]!.draw!.darken).toBe(14 / 16)
    expect(frames[lit]!.flash).toBe(1)
    expect(frames.length - 1).toBe(122)
    expect(frames.at(-1)!.flash).toBe(1)
  })
})
