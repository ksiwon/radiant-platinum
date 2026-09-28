// 원작 밖에서 더한 야생 — 신오도감 여덟 종의 길 (PARITY §6.13 · `wildAdditions.ts`)
//
// 칸을 나눠 쓰는 규칙을 가짜 표로 재고, 지금 롬의 다섯 자리에서 나눌 칸에 원래 종이 서 있는지와
// 몫이 반인지를 실제 표로 잰다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rollLand, timedLand, type EncounterTable } from './encounter'
import { applyWildAdditions, SHARE_CHANCE, WILD_ADDITIONS, withWildHabitats } from './wildAdditions'
import { TimeOfDay } from '../map/timeOfDay'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]! }

function fakeTable(): EncounterTable {
  const land = Array.from({ length: 12 }, (_, i) => ({ level: 10 + i, species: 100 + i }))
  return {
    landRate: 30, land, swarm: [0, 0], day: [0, 0], night: [300, 301], radar: [0, 0, 0, 0],
    forms: [0, 0], unownTable: 0,
    surf: { rate: 0, slots: [] }, oldRod: { rate: 0, slots: [] }, goodRod: { rate: 0, slots: [] }, superRod: { rate: 0, slots: [] },
    shares: [{ slot: 5, base: 105, species: 434 }, { slot: 2, base: 300, species: 198 }],
  }
}

describe('칸을 나눠 쓴다', () => {
  it('나뉜 칸이 뽑히고 둘째 굴림이 몫 안이면 새 종이 그 칸의 레벨로 나온다', () => {
    // 0.75 → 칸 5 (가중치를 쌓으면 70~80)
    expect(rollLand(fakeTable(), seq(0.75, SHARE_CHANCE - 0.01))).toMatchObject({ species: 434, level: 15, slot: 5 })
    expect(rollLand(fakeTable(), seq(0.75, SHARE_CHANCE))).toMatchObject({ species: 105, level: 15, slot: 5 })
  })

  it('안 나뉜 칸은 한 번만 굴린다', () => {
    let calls = 0
    const rng = () => { calls++; return 0.05 }
    expect(rollLand(fakeTable(), rng)).toMatchObject({ species: 100, slot: 0 })
    expect(calls).toBe(1)
  })

  it('원래 종이 그 칸에 안 서 있으면 안 나눈다 — 밤 칸은 밤에만', () => {
    // 0.45 → 칸 2. 아침엔 표의 102, 밤엔 300(해골몽 자리)
    expect(rollLand(fakeTable(), seq(0.45, 0), TimeOfDay.MORNING)).toMatchObject({ species: 102 })
    expect(rollLand(fakeTable(), seq(0.45, 0), TimeOfDay.NIGHT)).toMatchObject({ species: 198, level: 12 })
  })

  it('레이더가 흔들린 칸과 특성이 집은 칸은 안 나눈다', () => {
    const t = fakeTable()
    t.radar = [105, 105, 105, 105]
    // 레이더 칸 4·5·10·11 — 종이 105로 같아도 레이더가 세운 것이라 레이더 종 그대로
    expect(rollLand(t, seq(0.75, 0), TimeOfDay.MORNING, { radarHard: true })).toMatchObject({ species: 105 })
    expect(rollLand(fakeTable(), seq(0), TimeOfDay.MORNING, { pick: () => 5 })).toMatchObject({ species: 105 })
  })
})

withData('encounters.json', 'maps.json', 'pokedexHabitat.json')('지금 롬의 다섯 자리', () => {
  const tables = (read('encounters.json') as { tables: EncounterTable[] }).tables
  const maps = (read('maps.json') as { maps: { encounters?: number | null }[] }).maps
  applyWildAdditions(tables, maps)
  const tableOf = (map: number) => tables[maps[map]!.encounters!]!

  it('나눌 칸에 원래 종이 서 있다 — 밤 칸은 밤 표로 본다', () => {
    for (const [map, shares] of Object.entries(WILD_ADDITIONS)) {
      const t = tableOf(Number(map))
      for (const s of shares) {
        const at = [2, 3].includes(s.slot) ? timedLand(t, TimeOfDay.NIGHT) : t.land
        expect(at[s.slot]?.species, `맵 ${map} 칸 ${String(s.slot)}`).toBe(s.base)
      }
    }
  })

  it('여러 번 얹어도 같다', () => {
    applyWildAdditions(tables, maps)
    expect(tableOf(395).shares).toHaveLength(2)
  })

  /**
   * 결정적인 난수 — 시험이 흔들리지 않게 (mulberry32).
   *
   * ⚠️ **선형 합동 난수를 쓰지 않는다.** 칸을 고르는 값과 몫을 가르는 값이 이어 나오는데, 그 둘이 서로 얽혀서
   * 몫이 5%가 아니라 4.5~5.6%로 쟀다 — 규칙이 아니라 자가 틀린 것이었다
   */
  const mulberry = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const tally = (map: number, time: number, n = 200_000) => {
    const out = new Map<number, number>()
    const rng = mulberry(7)
    for (let i = 0; i < n; i++) {
      const e = rollLand(tableOf(map), rng, time as never)
      if (e) out.set(e.species, (out.get(e.species) ?? 0) + 1)
    }
    return (sp: number) => (out.get(sp) ?? 0) / n
  }

  it('222번도로 — 나옹마 · 몬냥이가 5%씩, 갈모매 · 코일은 5%씩 남는다', () => {
    const p = tally(395, TimeOfDay.DAY)
    for (const sp of [431, 432, 278, 81]) expect(p(sp), String(sp)).toBeCloseTo(0.05, 2)
  })

  it('로스트타워 1F — 밤에만 니로우 · 무우마가 5%씩, 해골몽은 10%', () => {
    const night = tally(357, TimeOfDay.NIGHT)
    expect(night(198)).toBeCloseTo(0.05, 2)
    expect(night(200)).toBeCloseTo(0.05, 2)
    expect(night(355)).toBeCloseTo(0.10, 2)
    const day = tally(357, TimeOfDay.DAY)
    expect(day(198) + day(200)).toBe(0)
  })

  it('도감 서식지에 여섯 종이 선다 — 원래 있던 종의 자리는 그대로', () => {
    const was = read('pokedexHabitat.json')
    const h = withWildHabitats(was)
    for (const sp of [198, 200, 431, 432, 434, 435]) expect(Object.keys(h.species[String(sp)] ?? {}).length, String(sp)).toBeGreaterThan(0)
    expect(h.species['355']).toEqual(was.species['355'])
  })
})
