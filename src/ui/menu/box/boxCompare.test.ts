// 박스 비교 — 알은 능력치도 기술도 안 보인다 (안에 든 종족이 새지 않게. 원작은 `compareMon->isEgg == FALSE`일 때만 그린다)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SpeciesTable } from '../../../data/gameData'
import type { PokemonInstance } from '../../../engine/pokemon/instance'
import { noOrigin } from '../../../engine/pokemon/origin'
import { BoxCompare } from './BoxCompare'

const mon = (over: Partial<PokemonInstance> = {}): PokemonInstance => ({
  species: 25, pid: 1, nickname: null, exp: 0, level: 50,
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  moves: [{ move: 1, pp: 10, ppUps: 0 }], hp: 20, status: 'ok', statusTurns: 0, heldItem: 0,
  friendship: 70, isEgg: false, otId: 0, otSecretId: 0, ball: 0,
  origin: noOrigin({ name: '', gender: 'male' }),
  form: 0, pokerus: 0, mail: null,
  ...over,
})

const species = {
  of: () => ({ id: 25, stats: { hp: 90, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 } }),
} as unknown as SpeciesTable
const NAMES: string[] = []
NAMES[25] = '피카츄'
NAMES[494] = '알'

/** 태그를 걷은 보이는 글 */
function text(page: number, mons: (PokemonInstance | null)[]): string {
  const html = renderToStaticMarkup(createElement(BoxCompare, {
    page, mons, names: NAMES, species, moveNames: ['', '몸통박치기'],
  }))
  return html.replace(/<[^>]*>/g, '|')
}

describe('박스 비교의 알', () => {
  it('알 둘은 능력치 쪽에 숫자가 하나도 없다', () => {
    const t = text(0, [mon({ isEgg: true }), mon({ isEgg: true })])
    expect(t).not.toMatch(/\d/)
    expect(t).toContain('알')
    expect(t).not.toContain('피카츄')
  })

  it('알 하나와 마리 하나 — 마리 쪽 숫자만 서고 알 쪽은 「—」이다', () => {
    const t = text(0, [mon({ isEgg: true }), mon()])
    const nums = t.split('|').filter((x) => /^\d+$/.test(x))
    expect(nums).toHaveLength(6)
    expect(t.split('|').filter((x) => x === '—').length).toBeGreaterThanOrEqual(6)
  })

  it('알은 기술 쪽에서 기술을 안 보인다', () => {
    const t = text(1, [mon({ isEgg: true }), mon()])
    expect(t.split('|').filter((x) => x === '몸통박치기')).toHaveLength(1)
  })

  it('알 둘이면 기술 이름이 하나도 없다', () => {
    expect(text(1, [mon({ isEgg: true }), mon({ isEgg: true })])).not.toContain('몸통박치기')
  })

  it('마리 둘이면 여섯 줄에 숫자 열둘이다 (알 규칙이 일반 마리를 안 건드린다)', () => {
    const nums = text(0, [mon(), mon()]).split('|').filter((x) => /^\d+$/.test(x))
    expect(nums.length).toBeGreaterThanOrEqual(12)
  })
})
