// 타입 상성표 대조. 손으로 적은 표는 반드시 어딘가 틀리므로, 실제 배틀을 굴리는
// @pkmn의 4세대 덱스와 324칸 전부를 맞춰 본다.
import { Dex } from '@pkmn/sim'
import { describe, it, expect } from 'vitest'
import { TYPE, TYPE_COUNT, effectivenessOf, typeMultiplier } from './typeChart'

/** 롬 타입 번호 → sim 타입 이름. 9번(???)은 sim에 없다 */
const SIM_NAME: (string | null)[] = [
  'Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost',
  'Steel', null, 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice',
  'Dragon', 'Dark',
]

const gen4 = Dex.forGen(4)

describe('타입 상성표', () => {
  it('324칸이 @pkmn 4세대 덱스와 하나도 안 어긋난다', () => {
    const mismatches: string[] = []
    for (let atk = 0; atk < TYPE_COUNT; atk++) {
      for (let def = 0; def < TYPE_COUNT; def++) {
        const an = SIM_NAME[atk]
        const dn = SIM_NAME[def]
        // 9번은 대조할 상대가 없다. 아래에서 따로 확인한다
        if (an === null || dn === null) continue
        const want = gen4.getEffectiveness(an, dn)
        const immune = !gen4.getImmunity(an, dn)
        const expected = immune ? 0 : 2 ** want
        const got = typeMultiplier(atk, def)
        if (got !== expected) mismatches.push(`${an}→${dn}: ${got} ≠ ${expected}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('???(9번)은 어느 쪽으로도 1배다', () => {
    // 롬 표에만 있는 자리다. 1이 아니면 아무도 안 쓰는 타입이 조용히 배수를 바꾼다
    for (let i = 0; i < TYPE_COUNT; i++) {
      expect(typeMultiplier(TYPE.MYSTERY, i), `9→${i}`).toBe(1)
      expect(typeMultiplier(i, TYPE.MYSTERY), `${i}→9`).toBe(1)
    }
  })

  it('범위 밖 번호는 1배로 흘린다', () => {
    expect(typeMultiplier(-1, TYPE.NORMAL)).toBe(1)
    expect(typeMultiplier(TYPE.NORMAL, 99)).toBe(1)
  })
})

describe('복합 타입 배수', () => {
  it('4배와 0.25배가 나온다', () => {
    // 얼음 → 드래곤/비행(볼드론). 2 × 2
    expect(effectivenessOf(TYPE.ICE, [TYPE.DRAGON, TYPE.FLYING])).toBe(4)
    // 벌레 → 불꽃/비행(리자몽). 0.5 × 0.5
    expect(effectivenessOf(TYPE.BUG, [TYPE.FIRE, TYPE.FLYING])).toBe(0.25)
  })

  it('한 쪽이 무효면 전체가 0이다', () => {
    // 땅 → 비행/강철(에어몬드). 강철이 2배라도 비행이 0이면 0이다
    expect(effectivenessOf(TYPE.GROUND, [TYPE.FLYING, TYPE.STEEL])).toBe(0)
  })

  it('같은 타입이 두 번 와도 한 번만 곱한다', () => {
    // 단일 타입 종족은 타입 칸 둘이 같다. 두 번 곱하면 강철톤이 격투에 4배를 맞는다
    expect(effectivenessOf(TYPE.FIGHTING, [TYPE.STEEL, TYPE.STEEL])).toBe(2)
  })
})
