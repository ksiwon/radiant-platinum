import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FILTER_SHAPE_COUNT, FILTER_TYPE_COUNT, FILTER_TYPE_OF, NO_FILTER, SORT_ORDER_COUNT,
  SortOrder, dexList, isPlain, type DexLists,
} from './dexSort'

/** 손으로 만든 작은 세계. 규칙만 본다 */
const LISTS: DexLists = {
  sinnoh: [1, 2, 3, 4],
  national: [1, 2, 3, 4, 5],
  // 무거운 순 — 도감 번호와 일부러 어긋나게 둔다
  heaviest: [3, 1, 4, 2, 5],
  alphabetical: [2, 4, 1, 3, 5],
  typeNormal: [1, 3],
  shapeQuadruped: [1, 2],
  nameAbc: [1, 4],
}

const all = () => true
const only = (...ids: number[]) => (s: number) => ids.includes(s)

describe('본 것만 남는다', () => {
  it('안 본 자리는 번호순에서 **빈 칸**으로 남는다 — 번호가 안 밀린다', () => {
    const got = dexList(LISTS, NO_FILTER, only(2, 4), only(2))
    expect(got.map((e) => e.species)).toEqual([1, 2, 3, 4])
    expect(got.map((e) => e.blank)).toEqual([true, false, true, false])
  })

  it('전국도감을 켜면 다섯째가 들어온다', () => {
    const got = dexList(LISTS, { ...NO_FILTER, national: true }, all, all)
    expect(got).toHaveLength(5)
  })
})

describe('정렬', () => {
  it('무거운 순은 그 목록 차례를 그대로 쓴다', () => {
    const got = dexList(LISTS, { ...NO_FILTER, sort: SortOrder.HEAVIEST }, all, all)
    expect(got.map((e) => e.species)).toEqual([3, 1, 4, 2])
  })

  it('⚠️ 가나다순 말고는 「본 적만 있는」 종이 빠진다', () => {
    // 무게는 잡아 봐야 아는 것이라 원작이 `keepUncaught`를 안 켠다
    const weight = dexList(LISTS, { ...NO_FILTER, sort: SortOrder.HEAVIEST }, all, only(1, 4))
    expect(weight.map((e) => e.species)).toEqual([1, 4])
    // 이름은 본 것만으로도 안다
    const abc = dexList(LISTS, { ...NO_FILTER, sort: SortOrder.ALPHABETICAL }, all, only(1, 4))
    expect(abc.map((e) => e.species)).toEqual([2, 4, 1, 3])
  })

  it('정렬을 걸면 빈 칸이 사라진다', () => {
    const got = dexList(LISTS, { ...NO_FILTER, sort: SortOrder.HEAVIEST }, only(1, 3), all)
    expect(got.every((e) => !e.blank)).toBe(true)
  })
})

describe('거르기', () => {
  it('거르기는 **지금 차례**를 지킨다 — 앞서 고른 정렬이 살아남는다', () => {
    const got = dexList(
      LISTS, { ...NO_FILTER, sort: SortOrder.HEAVIEST, type1: 1 }, all, all,
    )
    // 무거운 순 [3,1,4,2] 중 노말 [1,3] → 3이 1보다 앞이다
    expect(got.map((e) => e.species)).toEqual([3, 1])
  })

  it('둘을 겹쳐 걸면 교집합이다', () => {
    const got = dexList(LISTS, { ...NO_FILTER, type1: 1, shape: 1 }, all, all)
    expect(got.map((e) => e.species)).toEqual([1])
  })

  it('아무것도 안 남으면 빈 목록이다', () => {
    const got = dexList(LISTS, { ...NO_FILTER, type1: 1, name: 1, shape: 1 }, only(4), all)
    expect(got).toEqual([])
  })

  it('거르기를 걸면 번호순이라도 빈 칸이 없다', () => {
    const got = dexList(LISTS, { ...NO_FILTER, name: 1 }, all, all)
    expect(got.map((e) => e.species)).toEqual([1, 4])
  })
})

describe('갈래 수', () => {
  it('원작 열거형과 같다', () => {
    expect(SORT_ORDER_COUNT).toBe(6)
    expect(FILTER_TYPE_COUNT).toBe(18)
    expect(FILTER_SHAPE_COUNT).toBe(15)
  })

  it('⚠️ 타입 거르기의 자리가 타입 번호와 다르다 — ???(9번)이 표에 없다', () => {
    expect(FILTER_TYPE_OF).toHaveLength(18)
    expect(FILTER_TYPE_OF[9]).toBe(0)
    expect(FILTER_TYPE_OF[8]).toBe(9)   // 강철
    expect(FILTER_TYPE_OF[10]).toBe(10) // 불꽃
    // 0(안 거른다) 말고는 겹치는 자리가 없다
    const used = FILTER_TYPE_OF.filter((v) => v !== 0)
    expect(new Set(used).size).toBe(used.length)
  })

  it('걸린 것이 없을 때만 「그냥 목록」이다', () => {
    expect(isPlain(NO_FILTER)).toBe(true)
    expect(isPlain({ ...NO_FILTER, sort: SortOrder.HEAVIEST })).toBe(false)
    expect(isPlain({ ...NO_FILTER, type2: 3 })).toBe(false)
    // 전국도감은 「거른 것」이 아니다
    expect(isPlain({ ...NO_FILTER, national: true })).toBe(true)
  })
})

// ── 실제 롬 목록 ────────────────────────────────────────────────────────────

const FILE = resolve(__dirname, '../../../public/data/pokedexSort.ko.json')
const real: { lists: Record<string, number[]>; shapes: number[] } | null = existsSync(FILE)
  ? JSON.parse(readFileSync(FILE, 'utf8')) as { lists: Record<string, number[]>; shapes: number[] }
  : null

describe('롬에서 뽑은 목록', () => {
  it.runIf(real)('전국 493 · 신오 210이다', () => {
    expect(real!.lists.national).toHaveLength(493)
    expect(real!.lists.sinnoh).toHaveLength(210)
    expect(real!.lists.sinnoh[0]).toBe(387)
  })

  it.runIf(real)('정렬 목록 다섯이 전국 493종을 다 담는다', () => {
    for (const name of ['alphabetical', 'heaviest', 'lightest', 'tallest', 'smallest']) {
      expect(real!.lists[name]).toHaveLength(493)
      expect(new Set(real!.lists[name]).size).toBe(493)
    }
  })

  it.runIf(real)('무거운 순과 가벼운 순이 서로 뒤집힌 것이 아니다 — 동률의 차례가 다르다', () => {
    // ⚠️ 이 시험이 막는 것: 무게로 다시 정렬해서 목록을 만들어 내는 것.
    // 뒤집기만 하면 같은 무게끼리의 차례가 원작과 어긋난다
    const heavy = real!.lists.heaviest!
    const light = [...real!.lists.lightest!].reverse()
    expect(heavy).not.toEqual(light)
  })

  it.runIf(real)('몸 모양 열넷이 493종을 빠짐없이 나눠 갖는다', () => {
    const counts = new Array<number>(14).fill(0)
    for (let s = 1; s <= 493; s++) {
      const shape = real!.shapes[s]!
      expect(shape).toBeGreaterThanOrEqual(0)
      counts[shape]!++
    }
    expect(counts.reduce((a, b) => a + b, 0)).toBe(493)
  })

  it.runIf(real)('이름 뭉치 아홉을 합치면 493종이다 — 겹치지 않는다', () => {
    const seen = new Set<number>()
    for (const name of ['nameAbc', 'nameDef', 'nameGhi', 'nameJkl', 'nameMno',
      'namePqr', 'nameStu', 'nameVwx', 'nameYz']) {
      for (const s of real!.lists[name]!) {
        expect(seen.has(s)).toBe(false)
        seen.add(s)
      }
    }
    expect(seen.size).toBe(493)
  })
})
