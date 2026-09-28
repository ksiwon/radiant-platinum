// 창기둥의 붉은 맥동 (`spearPillarFx.ts` · `ov6_0223E140.c`의 `ov6_02240364`)
import { describe, expect, it } from 'vitest'
import { chainCover, chainStart, chainTick } from './spearPillarFx'

describe('붉은 사슬과 맥동', () => {
  it('단계마다 7틱을 쉬고 한 틱에 1씩 — 단계 0은 23틱 · 1은 16틱 · 2는 14틱', () => {
    const c = chainStart()
    const at: number[] = []
    let last = 0
    for (let t = 1; t <= 300 && at.length < 4; t++) {
      chainTick(c)
      if (c.step !== last) { at.push(t); last = c.step }
    }
    expect(at.slice(0, 3)).toEqual([23, 39, 53])
  })

  it('맥동 열둘이 (8,8) ↔ 낮은 쪽을 오가고, 사슬 201프레임 뒤 9틱에 검게 닫힌다 — 세우는 틱 뒤 210틱(모두 211)', () => {
    const c = chainStart()
    const lows: [number, number][] = []
    let t = 0
    while (c.state !== 11 && t < 400) {
      chainTick(c)
      t++
      if (c.wait === 0 && c.state === 3 && c.step % 2 === 1 && c.step > 1) lows.push([c.eva, c.evb])
    }
    expect(t).toBe(210)
    expect([c.eva, c.evb, c.visible]).toEqual([0, 0, false])
    // 맥동이 사슬보다 먼저 끝난다 (171틱) — 닫기는 사슬 끝(201)을 기다린다
    expect(lows.slice(0, 5)).toEqual([[2, 14], [2, 14], [3, 13], [3, 13], [4, 12]])
  })

  it('덮개 — 맥동 동안은 빨강만 비치고(합 16) 닫을 때 검게 내려간다', () => {
    expect(chainCover({ ...chainStart(), eva: 0, evb: 31 })).toEqual({ red: 0, black: 0 })
    expect(chainCover({ ...chainStart(), eva: 8, evb: 8 })).toEqual({ red: 0.5, black: 0 })
    expect(chainCover({ ...chainStart(), eva: 2, evb: 14 })).toEqual({ red: 0.125, black: 0 })
    expect(chainCover({ ...chainStart(), eva: 4, evb: 4 })).toEqual({ red: 0.5, black: 0.5 })
    expect(chainCover({ ...chainStart(), eva: 0, evb: 0 })).toEqual({ red: 0, black: 1 })
  })
})
