// 야생 조우 검증 (DATA.md §2.8).
//
// 인카운터 표는 원작 대조로 고정한다. 201번도로에서 찌르꼬가 아닌 것이 나오면
// 424B 배치 가정이 깨진 것이다.
//
// 슬롯 확률은 별개다 — 롬에 없는 상수라 원작 대조가 불가능하고, 합이 100인지와
// 가중치대로 뽑히는지만 확인할 수 있다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  LAND_SLOT_RATES, WATER_SLOT_RATES, graceSteps, isEncounterTile, newEncounterState,
  rollLand, rollWater, shouldEncounter, type EncounterTable,
} from './encounter'
import { Behavior } from '../map/zone'

const DATA = resolve(__dirname, '../../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const present = existsSync(resolve(DATA, 'encounters.json'))
const maybe = present ? describe : describe.skip

/** 정해진 값을 차례로 내놓는 가짜 RNG — 슬롯 선택을 정확히 지목한다 */
const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]! }

describe('슬롯 확률표', () => {
  it('육상 12슬롯과 물 5슬롯 모두 합이 100이다', () => {
    expect(LAND_SLOT_RATES.reduce((a, b) => a + b, 0)).toBe(100)
    expect(WATER_SLOT_RATES.reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('타일 판정', () => {
  it('풀숲에서만 야생이 나온다', () => {
    expect(isEncounterTile(Behavior.TALL_GRASS)).toBe(true)
    expect(isEncounterTile(Behavior.NORMAL)).toBe(false)
    expect(isEncounterTile(Behavior.WATER_OPEN)).toBe(false)
    expect(isEncounterTile(Behavior.WATER_POND)).toBe(false)
  })
})

// 관문이 셋이다 (pokeplatinum `ShouldGetRandomEncounter`):
//   ① 조우 직후 유예 구간이면 95%가 떨어진다
//   ② 평평한 40% 관문
//   ③ 표의 출현률
// ②를 빠뜨리면 실효 확률이 2.5배가 되어 풀숲을 지나갈 수가 없다 — 실제로 그랬다.
describe('출현 판정', () => {
  /** 유예를 다 쓴 상태. 걸음마다의 정상 판정을 보려면 이게 필요하다 */
  const settled = () => ({ attempts: 8 })

  it('출현률 0이면 절대 나오지 않는다', () => {
    expect(shouldEncounter(0, settled(), () => 0)).toBe(false)
  })

  it('평평한 관문에서 60%가 떨어진다', () => {
    // ②는 rng()*100 < 40. 39.9는 통과하고 40.1은 출현률을 보지도 못한다
    expect(shouldEncounter(30, settled(), seq(0.399, 0))).toBe(true)
    expect(shouldEncounter(30, settled(), seq(0.401, 0))).toBe(false)
  })

  it('관문을 지나면 출현률 30에서 29.9는 나오고 30.1은 안 나온다', () => {
    expect(shouldEncounter(30, settled(), seq(0, 0.299))).toBe(true)
    expect(shouldEncounter(30, settled(), seq(0, 0.301))).toBe(false)
  })

  it('유예 구간 길이는 출현률이 높을수록 짧다', () => {
    // 우리 표에 있는 여섯 값 전부. 원작의 8 - (rate<<8 / 10 >> 8)이다
    expect([0, 5, 10, 15, 30, 35].map(graceSteps)).toEqual([8, 8, 7, 7, 5, 5])
  })

  it('유예 구간에서는 95%가 첫 관문에서 떨어진다', () => {
    const state = newEncounterState()
    // 5 이상이면 즉시 실패. 뒤 관문을 다 통과할 값을 줘도 안 나온다
    expect(shouldEncounter(30, state, seq(0.05, 0, 0))).toBe(false)
    expect(state.attempts).toBe(1)
    // 5 미만이면 통과해서 ②③을 본다
    expect(shouldEncounter(30, state, seq(0.049, 0, 0))).toBe(true)
    expect(state.attempts).toBe(2)
  })

  it('유예를 다 쓰면 첫 관문이 사라진다', () => {
    const state = { attempts: graceSteps(30) }
    // 첫 값이 ②로 바로 간다 — 유예가 살아 있었다면 0.5는 즉시 실패였다
    expect(shouldEncounter(30, state, seq(0.399, 0))).toBe(true)
    expect(state.attempts, '유예가 끝나면 더 안 센다').toBe(graceSteps(30))
  })

  it('201번도로에서 평균 13걸음에 한 번 나온다', () => {
    // 관문 ②③만 보면 0.40 × 0.30 = 12%로 8.3걸음인데, 조우 뒤 5걸음의 유예가
    // 붙어 12.8걸음이 된다. 관문 ②를 빼면 7.8, 유예까지 빼면 3.3걸음이다 —
    // 세 번째가 옛날 우리 식이었고, 그래서 걸을 때마다 튀어나왔다
    let seed = 12345
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    let state = newEncounterState()
    let steps = 0
    const gaps: number[] = []
    for (let i = 0; i < 200_000; i++) {
      steps++
      if (shouldEncounter(30, state, rng)) {
        gaps.push(steps)
        steps = 0
        state = newEncounterState() // 조우하면 유예가 다시 열린다
      }
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    expect(gaps.length).toBeGreaterThan(1000)
    expect(mean, `평균 ${mean.toFixed(1)}걸음`).toBeGreaterThan(11)
    expect(mean, `평균 ${mean.toFixed(1)}걸음`).toBeLessThan(15)
  })
})

maybe('인카운터 표', () => {
  const tables = read('encounters.json').tables as EncounterTable[]
  const maps = read('maps.json').maps as { name: string; encounters: number | null }[]
  const names = read('names/species.ko.json') as string[]
  const table = (zone: string) => {
    const m = maps.find((x) => x.name === zone)!
    expect(m.encounters, `${zone}에 인카운터 표가 없다`).not.toBeNull()
    return tables[m.encounters!]!
  }

  it('183개 표가 있다', () => expect(tables.length).toBe(183))

  it('201번도로가 원작과 일치한다', () => {
    const t = table('R201')
    expect(t.landRate).toBe(30)
    expect(t.land.slice(0, 4).map((s) => `L${s.level} ${names[s.species]}`))
      .toEqual(['L2 찌르꼬', 'L2 비버니', 'L3 찌르꼬', 'L3 귀뚤뚜기'])
    expect(t.day.map((id) => names[id])).toEqual(['찌르꼬', '비버니'])
    expect(t.night.map((id) => names[id])).toEqual(['귀뚤뚜기', '비버니'])
    expect(t.swarm.map((id) => names[id])).toEqual(['두두', '두두'])
  })

  it('트윈리프타운은 육상은 없고 물만 있다 — 마을 연못이다', () => {
    const t = table('T01')
    expect(t.landRate).toBe(0)
    expect(t.surf.rate).toBe(10)
    expect(names[t.surf.slots[0]!.species]).toBe('고라파덕')
    expect(t.surf.slots[0]!.min).toBe(20)
    expect(t.surf.slots[0]!.max).toBe(30)
  })

  it('슬롯 0을 지목하면 그 슬롯이 나온다', () => {
    const t = table('R201')
    // pickSlot은 rng()*100에서 가중치를 빼 나간다. 0이면 무조건 첫 슬롯
    expect(rollLand(t, seq(0))).toEqual({ species: t.land[0]!.species, level: t.land[0]!.level, slot: 0 })
    // 0.999 → 99.9에서 20,20,10,10,10,10,5,5,4,4,1을 빼면 마지막 슬롯
    expect(rollLand(t, seq(0.999))?.slot).toBe(11)
  })

  it('육상 표가 비어 있으면 null이다', () => {
    expect(rollLand(table('T01'), seq(0))).toBeNull()
  })

  it('물 조우 레벨은 min~max 안에 들어온다', () => {
    const t = table('T01')
    for (const r of [0, 0.5, 0.999]) {
      const e = rollWater(t.surf, seq(0, r))!
      const slot = t.surf.slots[e.slot]!
      expect(e.level).toBeGreaterThanOrEqual(slot.min)
      expect(e.level).toBeLessThanOrEqual(slot.max)
    }
  })

  it('육상 슬롯이 있는 표는 전부 종족·레벨이 유효하다', () => {
    for (const t of tables) {
      if (t.landRate === 0) continue
      for (const s of t.land) {
        expect(s.species).toBeGreaterThan(0)
        expect(s.level).toBeGreaterThan(0)
        expect(s.level).toBeLessThanOrEqual(100)
        expect(names[s.species], `종족 ${s.species} 이름 없음`).toBeTruthy()
      }
    }
  })
})
