// 도감 두 수 (`dexCounts.ts`)
//
// ⚠️ **카드와 도감 머리가 같은 수를 말해야 한다.** 도감 화면은 머리의 「발견한 수 · 잡은 수」를 안 거른 목록
// (`dexList(…, NO_FILTER)`)의 빈 칸 아닌 줄로 센다(`PokedexScreen.tsx`). 여기 셈이 그것과 갈리면 같은 판의 두 화면 숫자가
// 다시 어긋난다 — 구운 신오 · 전국 목록 위에서 아무렇게나 채운 도감 여럿으로 둘을 맞댄다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dexList, NO_FILTER } from '../../engine/pokemon/dexSort'
import { DEX_BYTES, dexHas, dexSet } from '../../engine/pokemon/dex'
import { DATA, withData } from '../../data/romData.testkit'
import { dexCounts, nationalDexCompleted } from './dexCounts'

/** 잡은 것은 본 것이기도 하다 — 원작도 잡으면 본 비트를 같이 세운다 */
function fill(seen: readonly number[], caught: readonly number[]): { seen: Uint8Array, caught: Uint8Array } {
  let s = new Uint8Array(DEX_BYTES), c = new Uint8Array(DEX_BYTES)
  for (const n of [...seen, ...caught]) s = dexSet(s, n)
  for (const n of caught) c = dexSet(c, n)
  return { seen: s, caught: c }
}

/** 도감 머리의 셈 — `PokedexScreen.tsx`의 `counts`와 같은 줄이다 */
function screenCounts(lists: Record<string, number[]>, national: boolean, dex: { seen: Uint8Array, caught: Uint8Array }) {
  const order = dexList(lists, { ...NO_FILTER, national }, (s) => dexHas(dex.seen, s), (s) => dexHas(dex.caught, s))
  return order.reduce(
    (acc, e) => (e.blank ? acc : { seen: acc.seen + 1, caught: acc.caught + (dexHas(dex.caught, e.species) ? 1 : 0) }),
    { seen: 0, caught: 0 },
  )
}

describe('dexCounts — 지어낸 목록', () => {
  const lists = { sinnoh: [387, 388, 396, 25], national: [1, 25, 151, 387, 388, 396] }

  it('전국도감 전에는 신오 목록 안의 것만 센다 — 뮤(151)는 안 든다', () => {
    const dex = fill([387, 396, 25, 151], [387, 151])
    expect(dexCounts(lists, false, dex)).toEqual({ seen: 3, caught: 1 })
    expect(dexCounts(lists, true, dex)).toEqual({ seen: 4, caught: 2 })
  })

  it('목록이 없으면 0이다 — 전국 수로 대신하지 않는다', () => {
    expect(dexCounts({}, false, fill([1, 2, 3], []))).toEqual({ seen: 0, caught: 0 })
  })
})

withData('pokedexSort.ko.json')('dexCounts — 구운 목록 위에서 도감 머리와 같다', () => {
  const lists = (JSON.parse(readFileSync(resolve(DATA, 'pokedexSort.ko.json'), 'utf8')) as { lists: Record<string, number[]> }).lists

  it('아무렇게나 채운 도감 스물 × 신오 · 전국', () => {
    let seed = 7
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
    for (let k = 0; k < 20; k++) {
      const seen = Array.from({ length: rand(300) }, () => 1 + rand(493))
      const caught = seen.filter(() => rand(3) === 0)
      const dex = fill(seen, caught)
      for (const national of [false, true]) {
        expect(dexCounts(lists, national, dex), `${String(k)} ${String(national)}`).toEqual(screenCounts(lists, national, dex))
      }
    }
  })
})

describe('nationalDexCompleted', () => {
  const all = Array.from({ length: 493 }, (_, i) => i + 1)
  const EXCLUDED = [151, 249, 250, 251, 385, 386, 489, 490, 491, 492, 493]

  it('뺀 열하나 없이 482종이면 다 찬 것이다', () => {
    expect(nationalDexCompleted(fill([], all.filter((n) => !EXCLUDED.includes(n))).caught)).toBe(true)
  })

  it('하나라도 모자라면 아니다 — 뺀 것을 잡아도 그 자리를 못 메운다', () => {
    const short = all.filter((n) => n !== 1)
    expect(nationalDexCompleted(fill([], short).caught)).toBe(false)
  })

  it('본 것은 안 센다 — 잡은 것만이다', () => {
    expect(nationalDexCompleted(fill(all, []).caught)).toBe(false)
  })
})
