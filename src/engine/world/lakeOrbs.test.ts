// 호수의 구슬 셋 (`lakeOrbs.ts` · `ov6_0223E140.c`의 `ov6_0223FAF8`)
import { describe, expect, it } from 'vitest'
import { lakeOrbsStart, lakeOrbsTick, orbTiles, type OrbEvent } from './lakeOrbs'

/** 끝날 때까지 돌리고 틱마다 일어난 것을 적는다 */
function run(): { t: number, ev: OrbEvent }[] {
  const o = lakeOrbsStart()
  const out: { t: number, ev: OrbEvent }[] = []
  let t = 0
  while (o.state !== 6 && t < 2000) {
    t++
    for (const ev of lakeOrbsTick(o)) out.push({ t, ev })
  }
  out.push({ t, ev: { kind: 'se', seq: -1 } })
  return out
}

describe('호수의 구슬 셋', () => {
  it('차례 — 유크시 · 아그놈 · 엠라이트가 울고 셋 다 뛰어든 뒤 끝난다', () => {
    const got = run()
    const cries = got.filter((e) => e.ev.kind === 'cry').map((e) => (e.ev as { species: number }).species)
    expect(cries).toEqual([480, 482, 481])
    expect(got.filter((e) => e.ev.kind === 'se' && e.ev.seq === 1750)).toHaveLength(3)
    // 엠라이트가 한 번 보였다가 숨는다
    expect(got.filter((e) => e.ev.kind === 'mesprit').map((e) => (e.ev as { visible: boolean }).visible)).toEqual([true, false])
    // 두리번거림 넷 — 서 · 남 · (난천 서 · 주인공 동) · 북
    const faces = got.filter((e) => e.ev.kind === 'face').map((e) => e.ev)
    expect(faces).toEqual([
      { kind: 'face', cynthia: 2, player: 2 }, { kind: 'face', cynthia: 1, player: 1 },
      { kind: 'face', cynthia: 2, player: 3 }, { kind: 'face', cynthia: 0, player: 0 },
    ])
  })

  it('때 — 첫 구슬은 31틱째 선다 · 유크시가 52틱째 울고 106틱째 뛰어든다 · 모두 695틱쯤', () => {
    const o = lakeOrbsStart()
    let spawned = -1
    for (let t = 1; t <= 40 && spawned < 0; t++) { lakeOrbsTick(o); if (o.state === 1) spawned = t }
    expect(spawned).toBe(31)
    const got = run()
    expect(got.find((e) => e.ev.kind === 'cry')?.t).toBe(52)
    expect(got.find((e) => e.ev.kind === 'se')?.t).toBe(106)
    const end = got.at(-1)!.t
    expect(Math.abs(end - 695)).toBeLessThanOrEqual(3)
  })

  it('자리 — 한가운데(504, 439유닛 = 31.5, 27.4칸)로 뛰어든다 · 높이 99유닛', () => {
    const o = lakeOrbsStart()
    for (let t = 0; t < 106; t++) lakeOrbsTick(o)
    expect([orbTiles(o.x), +orbTiles(o.y).toFixed(3), +orbTiles(o.z).toFixed(3)]).toEqual([31.5, 6.188, 27.438])
  })
})
