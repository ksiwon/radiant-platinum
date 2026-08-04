// 개체 생성과 PID 유도 검증.
//
// PID에서 나오는 네 값(성격·특성·성별·색)은 전부 원작이 정한 식이다. 성별만은
// 종족 데이터가 필요하고, 그 성비 해석을 **sim의 성비와 대조**할 수 있다 —
// 우리는 롬 바이트를 문턱값으로 읽고 sim은 분수로 갖고 있어서 서로 독립이다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/sim'
import type { Species } from '../../data/schema'
import { speciesFileSchema } from '../../data/schema'
import { NATURE_COUNT } from './stats'
import { expForLevel, levelForExp } from './exp'
import {
  abilitySlotOf, createWild, genderOf, isShiny, natureOf, randomPid, setExp,
  statsOf, wildMoves,
} from './instance'

// @pkmn/sim의 ModdedDex와 @pkmn/data가 요구하는 Dex는 구조가 같은데 이름이 달라
// TS가 거부한다. 두 패키지를 함께 쓰는 표준 방식이라 여기서만 좁혀 준다
const gen4 = new Generations(Dex as unknown as ConstructorParameters<typeof Generations>[0]).get(4)
const all = speciesFileSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/species.json'), 'utf8')),
).species
const byId = new Map(all.map((s) => [s.id, s]))
const speciesNames = JSON.parse(
  readFileSync(resolve(__dirname, '../../../public/data/names/species.en.json'), 'utf8'),
) as string[]

/** 재현 가능한 난수 (mulberry32) */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const turtwig = byId.get(387)!
const starly = byId.get(396)!

describe('PID 유도', () => {
  it('u32 범위 안에서 고르게 나온다', () => {
    const r = rng(1)
    let min = Infinity, max = -Infinity
    const buckets = new Array(16).fill(0)
    for (let i = 0; i < 4000; i++) {
      const pid = randomPid(r)
      expect(Number.isSafeInteger(pid)).toBe(true)
      expect(pid).toBeGreaterThanOrEqual(0)
      expect(pid).toBeLessThan(2 ** 32)
      min = Math.min(min, pid); max = Math.max(max, pid)
      buckets[Math.floor(pid / (2 ** 32 / 16))]! += 1
    }
    // 한 구간에 몰리면 상위 비트를 안 채우고 있는 것이다
    for (const b of buckets) expect(b).toBeGreaterThan(100)
    expect(max - min).toBeGreaterThan(2 ** 31)
  })

  it('성격은 25로 나눈 나머지고 전부 나온다', () => {
    const r = rng(2)
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) {
      const pid = randomPid(r)
      const n = natureOf(pid)
      expect(n).toBe(pid % NATURE_COUNT)
      seen.add(n)
    }
    expect(seen.size).toBe(NATURE_COUNT)
  })

  it('특성 슬롯은 최하위 비트 하나다', () => {
    expect(abilitySlotOf(0)).toBe(0)
    expect(abilitySlotOf(1)).toBe(1)
    expect(abilitySlotOf(0xfffffffe)).toBe(0)
    expect(abilitySlotOf(0xffffffff)).toBe(1)
  })

  it('색은 트레이너 ID에 달려 있다 — 같은 PID라도 사람마다 다르다', () => {
    // 정의상 tid^sid^hi^lo < 8이므로, 그 조건을 만족하는 PID를 직접 만든다
    const tid = 12345, sid = 54321
    const hi = 0x1234
    const lo = (tid ^ sid ^ hi) & 0xffff // → xor 결과 0
    const pid = hi * 0x10000 + lo
    expect(isShiny(pid, tid, sid)).toBe(true)
    // ⚠️ tid를 1만 바꾸면 xor 결과가 1이라 **여전히** 8 미만이다. 8 이상으로
    // 밀어내는 비트를 건드려야 반례가 된다
    expect(isShiny(pid, tid ^ 0x0100, sid)).toBe(false)
    expect(isShiny(pid, tid, sid ^ 0x0100)).toBe(false)
    // 빈도는 1/8192 언저리여야 한다
    const r = rng(3)
    let shiny = 0
    const n = 200_000
    for (let i = 0; i < n; i++) if (isShiny(randomPid(r), tid, sid)) shiny++
    expect(shiny / n, `색이 다른 비율 ${(shiny / n * 8192).toFixed(2)}/8192`)
      .toBeGreaterThan(1 / 8192 / 3)
    expect(shiny / n).toBeLessThan((1 / 8192) * 3)
  })
})

describe('성별', () => {
  it('성비 해석이 sim과 일치한다 — 493종 전부', () => {
    const bad: string[] = []
    for (const s of all) {
      if (s.id > 493) continue
      const ps = gen4.species.get(speciesNames[s.id]!)
      if (!ps) continue
      // sim: gender 'N'=무성 'M'=항상수컷 'F'=항상암컷, 아니면 genderRatio.F 분수
      const simFemale = ps.gender === 'N' ? null
        : ps.gender === 'M' ? 0
          : ps.gender === 'F' ? 1
            : ps.genderRatio.F
      const ourFemale = s.genderRatio === 255 ? null
        : s.genderRatio === 0 ? 0
          : s.genderRatio === 254 ? 1
            : s.genderRatio / 256
      if (simFemale === null || ourFemale === null) {
        if (simFemale !== ourFemale) bad.push(`${s.id} ${speciesNames[s.id]}: 무성 여부 불일치`)
        continue
      }
      if (Math.abs(simFemale - ourFemale) > 0.02) {
        bad.push(`${s.id} ${speciesNames[s.id]}: 우리 ${ourFemale.toFixed(3)} vs sim ${simFemale}`)
      }
    }
    expect(bad, bad.slice(0, 6).join(' / ')).toHaveLength(0)
  })

  it('0·254·255는 문턱이 아니라 표식이다', () => {
    // 254를 문턱으로 쓰면 256분의 2가 수컷으로 새어 나온다
    for (let low = 0; low < 256; low++) {
      expect(genderOf(low, 0), `수컷 전용 pid ${low}`).toBe('male')
      expect(genderOf(low, 254), `암컷 전용 pid ${low}`).toBe('female')
      expect(genderOf(low, 255), `무성 pid ${low}`).toBe('genderless')
    }
  })

  it('문턱값이 실제로 성비를 만든다', () => {
    // 성비 31 = 암컷 12.5%
    let female = 0
    for (let low = 0; low < 256; low++) if (genderOf(low, 31) === 'female') female++
    expect(female / 256).toBeCloseTo(31 / 256, 5)
  })
})

describe('야생 개체', () => {
  it('기술은 그 레벨까지 배운 마지막 4개다', () => {
    // 모다피 계열처럼 초반에 5개 이상 배우는 종으로 확인한다
    const s = byId.get(1)!
    const early = wildMoves(s, 1)
    expect(early.length).toBeGreaterThan(0)
    expect(early.length).toBeLessThanOrEqual(4)

    const late = wildMoves(s, 100)
    expect(late).toHaveLength(4)
    const learnable = s.learnset.filter((l) => l.level <= 100)

    // 가장 늦게 배우는 기술은 반드시 들어 있다 — "마지막 4개"의 뜻이 그것이다
    expect(late.map((m) => m.move)).toContain(learnable[learnable.length - 1]!.move)
    // 반대로, 뒤에 5개 이상이 더 오는 기술은 밀려나야 한다.
    // 이게 없으면 "그냥 배운 것 아무거나 4개"여도 통과한다
    const dropped = learnable[learnable.length - 5]!.move
    if (!learnable.slice(-4).some((l) => l.move === dropped)) {
      expect(late.map((m) => m.move)).not.toContain(dropped)
    }

    // 레벨 제한이 실제로 걸린다
    for (const slot of wildMoves(s, 7)) {
      const learnedAt = s.learnset.find((l) => l.move === slot.move)!.level
      expect(learnedAt, `${slot.move}`).toBeLessThanOrEqual(7)
    }
  })

  it('같은 기술을 두 번 배워도 중복되지 않는다', () => {
    for (const s of all) {
      const m = wildMoves(s, 100)
      expect(new Set(m.map((x) => x.move)).size, `${s.id}`).toBe(m.length)
    }
  })

  it('레벨에 맞는 경험치로 시작한다', () => {
    const r = rng(7)
    for (const level of [2, 13, 50, 100]) {
      const mon = createWild({ species: turtwig, level, rng: r, otId: 1, otSecretId: 2 })
      expect(mon.level).toBe(level)
      expect(mon.exp).toBe(expForLevel(turtwig.growthRate, level))
      expect(levelForExp(turtwig.growthRate, mon.exp)).toBe(level)
    }
  })

  it('개체값이 0~31이고 노력치는 0이다', () => {
    const r = rng(11)
    for (let i = 0; i < 300; i++) {
      const mon = createWild({ species: starly, level: 3, rng: r, otId: 1, otSecretId: 2 })
      for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
        expect(mon.ivs[k]).toBeGreaterThanOrEqual(0)
        expect(mon.ivs[k]).toBeLessThanOrEqual(31)
        expect(mon.evs[k]).toBe(0)
      }
    }
  })

  it('실능력치가 나온다 — 무쿠렁 Lv2는 HP 두 자리다', () => {
    const mon = createWild({ species: starly, level: 2, rng: rng(13), otId: 1, otSecretId: 2 })
    const s = statsOf(mon, starly)
    expect(s.hp).toBeGreaterThan(10)
    expect(s.hp).toBeLessThan(20)
    for (const k of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
      expect(s[k], k).toBeGreaterThan(0)
    }
  })

  it('setExp는 레벨을 함께 맞춘다 — 따로 두면 어긋난다', () => {
    const mon = createWild({ species: turtwig, level: 5, rng: rng(17), otId: 1, otSecretId: 2 })
    setExp(mon, turtwig, expForLevel(turtwig.growthRate, 16))
    expect(mon.level).toBe(16)
    setExp(mon, turtwig, expForLevel(turtwig.growthRate, 16) - 1)
    expect(mon.level).toBe(15)
    setExp(mon, turtwig, -100)
    expect(mon.exp).toBe(0)
    expect(mon.level).toBe(1)
  })
})

/** 종족 데이터가 테스트 기대와 어긋나면 먼저 알려 준다 */
describe('전제', () => {
  it('테스트가 쓰는 종족이 데이터에 있다', () => {
    const check: [number, string, Species | undefined][] = [
      [387, 'Turtwig', turtwig], [396, 'Starly', starly], [1, 'Bulbasaur', byId.get(1)],
    ]
    for (const [id, name, s] of check) {
      expect(s, `${id} ${name}`).toBeDefined()
      // 롬 이름은 전부 대문자다 (TURTWIG). sim은 Turtwig — 그래서 브리지가 번호를 쓴다
      expect(speciesNames[id]!.toLowerCase()).toBe(name.toLowerCase())
      expect(speciesNames[id], '롬 이름은 대문자다').toBe(name.toUpperCase())
    }
  })
})
