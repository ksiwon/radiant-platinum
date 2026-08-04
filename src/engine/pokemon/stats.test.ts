// 능력치·성격을 @pkmn/data와 대조한다.
//
// 우리가 이걸 직접 구현하는 이유는 배틀 **밖에서도** 같은 값이 필요해서다(파티
// 메뉴, 조우 표시). 그런데 배틀 안에서는 sim이 자기 식으로 다시 계산하므로,
// 두 구현이 한 칸이라도 다르면 배틀에 들어간 순간 HP가 튄다.
//
// 그래서 손으로 고른 몇 개가 아니라 **무작위 수천 건**을 돌린다. 반올림 방향이나
// 성격 배수를 곱하는 순서 같은 건 특정 조합에서만 어긋나기 때문이다.
import { describe, it, expect } from 'vitest'
import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/sim'
import type { Stats } from '../../data/schema'
import {
  NATURE_COUNT, NATURE_STATS, computeStats, hpStat, isNeutralNature,
  natureEffect, natureMultiplier, otherStat,
} from './stats'

// @pkmn/sim의 ModdedDex와 @pkmn/data가 요구하는 Dex는 구조가 같은데 이름이 달라
// TS가 거부한다. 두 패키지를 함께 쓰는 표준 방식이라 여기서만 좁혀 준다
const gen4 = new Generations(Dex as unknown as ConstructorParameters<typeof Generations>[0]).get(4)

/**
 * 성격 번호 순서. 롬 내부 순서이자 4세대 성격 표의 표준 순서다.
 * 이 목록이 틀리면 아래 대조에서 보정이 어긋나므로 함께 검증된다
 */
const NATURE_NAMES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
]

describe('성격', () => {
  it('25종이고 무보정이 5종이다', () => {
    expect(NATURE_NAMES).toHaveLength(NATURE_COUNT)
    const neutral = NATURE_NAMES.map((_, i) => i).filter(isNeutralNature)
    expect(neutral).toEqual([0, 6, 12, 18, 24])
  })

  it('보정이 sim의 성격 데이터와 일치한다 — 25종 전부', () => {
    const bad: string[] = []
    for (let n = 0; n < NATURE_COUNT; n++) {
      const ps = gen4.natures.get(NATURE_NAMES[n]!)!
      const e = natureEffect(n)
      // sim은 무보정을 undefined로 준다
      const up = ps.plus ?? null
      const down = ps.minus ?? null
      if (e.up !== up || e.down !== down) {
        bad.push(`${n} ${NATURE_NAMES[n]}: 우리 +${e.up}/-${e.down} vs sim +${up}/-${down}`)
      }
    }
    expect(bad, bad.join(' / ')).toHaveLength(0)
  })

  it('HP는 성격의 영향을 받지 않는다', () => {
    expect(NATURE_STATS).not.toContain('hp')
    for (let n = 0; n < NATURE_COUNT; n++) {
      expect(natureMultiplier(n, 'hp')).toBe(1)
    }
  })

  it('범위 밖 번호도 안전하다 — 25로 감는다', () => {
    expect(natureEffect(25)).toEqual(natureEffect(0))
    expect(natureEffect(-1)).toEqual(natureEffect(24))
  })
})

/** 재현 가능한 난수 (mulberry32) — 실패하면 같은 사례가 다시 나와야 한다 */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const

describe('실능력치', () => {
  it('알려진 값과 맞는다 — 가브리아스 Lv100 31/0 무보정', () => {
    expect(hpStat(108, 31, 0, 100)).toBe(357)
    expect(otherStat(130, 31, 0, 100, 1)).toBe(296)
    expect(otherStat(130, 31, 0, 100, 1.1)).toBe(325)
  })

  it('성격 배수는 마지막에 곱하고 버린다', () => {
    // 앞에서 곱하면 소수점이 살아남아 값이 어긋난다. 실제로 갈리는 조합을 고른다
    const early = Math.floor(((2 * 130 + 31 + 0) * 100) / 100 + 5 * 1.1)
    expect(otherStat(130, 31, 0, 100, 1.1)).not.toBe(early)
    expect(otherStat(130, 31, 0, 100, 1.1)).toBe(Math.floor(296 * 1.1))
  })

  it('무작위 3000건이 sim과 한 칸도 다르지 않다', () => {
    const r = rng(20260804)
    const all = [...gen4.species].filter((s) => s.num > 0 && s.num <= 493 && !s.forme)
    const bad: string[] = []
    for (let i = 0; i < 3000; i++) {
      const sp = all[Math.floor(r() * all.length)]!
      const level = 1 + Math.floor(r() * 100)
      const nature = Math.floor(r() * NATURE_COUNT)
      const ivs = {} as Stats
      const evs = {} as Stats
      for (const k of STAT_KEYS) {
        ivs[k] = Math.floor(r() * 32)
        // 노력치는 개별 255·합계 510 제한이 있지만, 계산식은 합계를 모른다.
        // 여기서는 식만 검증하므로 개별 상한만 지킨다
        evs[k] = Math.floor(r() * 256)
      }
      const mine = computeStats({ base: sp.baseStats, ivs, evs, level, nature, speciesId: sp.num })
      const psNature = gen4.natures.get(NATURE_NAMES[nature]!)!
      for (const k of STAT_KEYS) {
        const theirs = gen4.stats.calc(k, sp.baseStats[k], ivs[k], evs[k], level, psNature)
        if (mine[k] !== theirs) {
          bad.push(`${sp.name} Lv${level} ${NATURE_NAMES[nature]} ${k}`
            + ` iv${ivs[k]} ev${evs[k]}: 우리 ${mine[k]} vs sim ${theirs}`)
        }
      }
      if (bad.length > 5) break
    }
    expect(bad, bad.join('\n')).toHaveLength(0)
  })

  it('껍질몬은 HP가 언제나 1이다 — 공식이 아니라 게임의 예외다', () => {
    const shedinja = gen4.species.get('Shedinja')!
    const full = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
    const evs = { hp: 252, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
    for (const level of [1, 50, 100]) {
      const s = computeStats({ base: shedinja.baseStats, ivs: full, evs, level, nature: 0, speciesId: shedinja.num })
      expect(s.hp, `Lv${level}`).toBe(1)
    }
    // 번호를 안 주면 예외가 안 걸린다 — 그래야 공식 자체는 그대로 검증된다
    expect(computeStats({ base: shedinja.baseStats, ivs: full, evs, level: 100, nature: 0 }).hp)
      .toBeGreaterThan(1)
  })

  it('1레벨에서도 성립한다 — 나눗셈이 0으로 죽지 않는다', () => {
    const s = computeStats({
      base: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      level: 1, nature: 0,
    })
    for (const k of STAT_KEYS) expect(s[k], k).toBeGreaterThan(0)
  })
})
