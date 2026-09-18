// 청크 그림 묶음 고르기 (FP-04 P0 — 이웃 지역 자홍)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bestSet, lendersFor, lendKey, missingIn, pickSheet } from './chunkSheets'
import type { TexNames, TexSheet } from './chunkMesh'
import { withData } from '../data/romData.testkit'

const sheet = (...names: string[]): TexSheet => ({
  width: 1, height: 1, pixels: new Uint8ClampedArray(4),
  items: names.map((n) => ({ tex: n, pal: n, x: 0, y: 0, w: 1, h: 1 })),
})
const m = (tex: string | null) => ({ tex, pal: tex })

describe('청크 그림 묶음', () => {
  const road = sheet('grass', 'r214_path')
  const city = sheet('grass', 'c07_base_u', 'c07_road_r')
  const cityChunk = [m('grass'), m('c07_base_u'), m('c07_road_r')]

  it('현재 묶음이 다 가진 청크는 안 바꾼다 — 원작처럼 현재 묶음이다', () => {
    expect(pickSheet(city, [{ set: 18, sheet: road }], [m('grass')])).toBeNull()
  })

  it('현재 묶음에 없는 그림을 쓰면 제 집 묶음으로 바꾼다', () => {
    expect(missingIn(road, cityChunk)).toBe(2)
    expect(pickSheet(road, [{ set: 7, sheet: city }], cityChunk)).toBe(7)
  })

  it('집 묶음도 똑같이 모자라면 안 바꾼다. 후보가 현재 묶음 자신이면 안 바꾼다', () => {
    expect(pickSheet(road, [{ set: 7, sheet: sheet('grass') }], cityChunk)).toBeNull()
    expect(pickSheet(road, [], cityChunk)).toBeNull()
    expect(pickSheet(road, [{ set: 18, sheet: road }], cityChunk)).toBeNull()
  })

  it('그림 없는 재질(정점색만)은 모자란 것으로 안 센다', () => {
    expect(missingIn(road, [m(null), m('grass')])).toBe(0)
  })

  it('집이 없는 청크는 창의 이웃 묶음 중 가장 덜 모자란 것을 쓴다', () => {
    const forest = [m('tree3_02'), m('conttree3_2'), m('grass')]
    const route224 = sheet('grass')
    const cands = [
      { set: 13, sheet: route224 },
      { set: 17, sheet: sheet('grass', 'tree3_02') },
      { set: 19, sheet: sheet('grass', 'tree3_02', 'conttree3_2') },
    ]
    expect(pickSheet(route224, cands, forest)).toBe(19)
    // 현재 묶음이 다 가지면 안 바꾼다
    expect(pickSheet(cands[2]!.sheet, cands, forest)).toBeNull()
    // 나은 후보가 없으면 안 바꾼다
    expect(pickSheet(route224, [cands[0]!], forest)).toBeNull()
  })

  it('같이 모자라면 앞의 후보(제 집)가 이긴다', () => {
    const a = sheet('x'), b = sheet('x')
    expect(pickSheet(sheet(), [{ set: 1, sheet: a }, { set: 2, sheet: b }], [m('x')])).toBe(1)
  })

  it('창에도 없으면 그림 목록에서 이름을 가장 많이 가진 묶음을 찾는다 — 같으면 번호가 작은 쪽', () => {
    const names = [
      [['grass', 'grass']],
      [['grass', 'grass'], ['tree3_02', 'tree3_02']],
      [['tree3_02', 'tree3_02'], ['conttree3_2', 'conttree3_2']],
      [['tree3_02', 'tree3_02'], ['conttree3_2', 'conttree3_2']],
    ] as const
    const forest = [m('tree3_02'), m('conttree3_2'), m(null)]
    expect(bestSet(names, 0, forest)).toBe(2)
    expect(bestSet(names, 2, forest)).toBeNull()
    expect(bestSet(names, 0, [m('grass')])).toBeNull()
  })
})

describe('한 묶음으로 못 그리는 청크 — 모자란 그림만 빌려 온다', () => {
  const names = [
    [['room', 'room']],
    [['h_kage', 'h_kage_pl'], ['other', 'other']],
    [['h_kage', 'h_kage_pl']],
    [['gym04_d', 'gym04_d']],
  ] as unknown as TexNames[]

  it('팔레트까지 같은 묶음을 찾는다 — 번호가 작은 쪽', () => {
    const got = lendersFor(names, [{ tex: 'h_kage', pal: 'h_kage_pl' }])
    expect(got).toEqual([{ key: lendKey('h_kage', 'h_kage_pl'), tex: 'h_kage', pal: 'h_kage_pl', set: 1, loose: false }])
  })

  /**
   * ⚠️ **이미 쥔 묶음도 후보다.** 영원 체육관 위층의 `gym04_d`는 묶음 25에만 있고
   * 팔레트 이름이 `gym04_d`다. 청크는 그 묶음을 이미 쥐고 있었는데 팔레트가 달라
   * 못 찾았고, 건너뛰기까지 걸려 10삼각형이 자홍으로 남았다 (실측 40,787픽셀)
   */
  it('이미 쥔 묶음이라도 팔레트만 다른 것은 빌려 온다', () => {
    const got = lendersFor(names, [{ tex: 'gym04_d', pal: 'gym04_d_pl' }])
    expect(got).toEqual([{
      key: lendKey('gym04_d', 'gym04_d_pl'), tex: 'gym04_d', pal: 'gym04_d', set: 3, loose: true,
    }])
  })

  it('그림 없는 재질은 빌릴 것이 없다', () => {
    expect(lendersFor(names, [{ tex: null, pal: null }])).toEqual([])
  })

  it('어디에도 없는 이름은 안 돌려준다 — 없는 것을 있다고 하지 않는다', () => {
    expect(lendersFor(names, [{ tex: 'nowhere', pal: 'nowhere_pl' }])).toEqual([])
  })
})

// ── 실제 롬 자료 ─────────────────────────────────────────────────────────────

const maybeTex = withData('tex/index.json')

maybeTex('실제 자료 — 영원시티 집의 그림자', () => {
  /**
   * 맵 73·74·75(영원시티 집 셋)의 청크는 묶음 57의 방 그림과 함께 `h_kage`를 쓴다.
   * 묶음 57에 그 이름이 없어서 **85삼각형이 자홍**이었다 (실측 2026-09-17).
   * 이름은 다른 묶음에 있으므로 빌려 올 수 있어야 한다
   */
  it('묶음 57에는 없고, 팔레트까지 같은 묶음이 있다', () => {
    const idx = JSON.parse(readFileSync(
      resolve(__dirname, '../../public/data/tex/index.json'), 'utf8',
    )) as { sets: { items: [string, string, number, number, number, number][] }[] }
    const names = idx.sets.map((s) => s.items.map((i) => [i[0], i[1]])) as unknown as TexNames[]
    expect(names[57]!.some(([t]) => t === 'h_kage')).toBe(false)
    const got = lendersFor(names, [{ tex: 'h_kage', pal: 'h_kage_pl' }])
    expect(got).toHaveLength(1)
    expect(got[0]!.loose).toBe(false)
    expect(names[got[0]!.set]!.some(([t, p]) => t === 'h_kage' && p === 'h_kage_pl')).toBe(true)
  })
})
