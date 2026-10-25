// 시원이 준 운명적 만남 레지기가스 — 놓아주기 막기와 놓아 버린 옛 리포트의 재지급 (SIWON.md §5)
import { describe, it, expect } from 'vitest'
import {
  FLAG_GAME_COMPLETED, isSiwonRegigigas, regigigasLockedForRuins, siwonTurn, VAR_RUINS_STATE,
  SIWON_GIFTS, SIWON_SPECIES, type SiwonProbe,
} from './siwon'
import { planSiwonTalk } from '../script/siwonScene'
import { releaseRefusal } from '../pokemon/boxes'
import type { PokemonInstance } from '../pokemon/instance'
import { noOrigin } from '../pokemon/origin'

function mon(species: number, fateful: boolean): PokemonInstance {
  return {
    species, pid: species, nickname: null, exp: 0, level: 50,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [], hp: 20, status: 'ok', statusTurns: 0, heldItem: 0,
    friendship: 70, isEgg: false, otId: 0, otSecretId: 0, ball: 0,
    origin: { ...noOrigin({ name: '', gender: 'male' }), fateful },
    form: 0, pokerus: 0, mail: null,
  }
}

const REGI = SIWON_SPECIES.regigigas
const vars = (over: Record<number, number> = {}) => (id: number) => over[id] ?? 0
const lockedOf = (m: PokemonInstance, given: number, v: (id: number) => number) =>
  regigigasLockedForRuins(m, given, v)

describe('시원의 레지기가스 — 레지를 잡기 전까지 못 놓는다', () => {
  it('(a) 290 전: 운명적 레지기가스는 막힌다 · 눈설신전 레지기가스와 다른 운명적 개체는 안 막힌다', () => {
    expect(lockedOf(mon(REGI, true), 6, vars())).toBe(true)
    // 유적 상태 270·280도 아직 잡은 것이 아니다 (유적을 나서면 0으로 돌아간다)
    expect(lockedOf(mon(REGI, true), 7, vars({ [VAR_RUINS_STATE[0]]: 270 }))).toBe(true)
    expect(lockedOf(mon(REGI, false), 6, vars())).toBe(false)
    expect(lockedOf(mon(492, true), 6, vars())).toBe(false)
  })

  it('(b) 290 뒤: 셋 중 어느 유적이든 풀린다', () => {
    for (const id of VAR_RUINS_STATE) {
      expect(lockedOf(mon(REGI, true), 6, vars({ [id]: 290 }))).toBe(false)
    }
  })

  it('(c) 선물 6(6번째)을 받기 전이면 해당 없다', () => {
    for (const given of [0, 1, 5]) expect(lockedOf(mon(REGI, true), given, vars())).toBe(false)
  })

  it('releaseRefusal이 표시 여부를 그대로 받는다 — 알·편지 같은 앞 사유가 먼저다', () => {
    const regi = mon(REGI, true)
    expect(releaseRefusal(regi, [mon(1, false), regi], true, true)).toBe('siwonRegi')
    expect(releaseRefusal(regi, [mon(1, false), regi], true, false)).toBeNull()
    expect(releaseRefusal({ ...regi, isEgg: true }, [regi], false, true)).toBe('egg')
  })

  it('isSiwonRegigigas: 종 486 + 운명적 만남만', () => {
    expect(isSiwonRegigigas(mon(REGI, true))).toBe(true)
    expect(isSiwonRegigigas(mon(REGI, false))).toBe(false)
  })
})

describe('놓아 버린 옛 리포트 — 시원이 한 번 더 준다', () => {
  const probe = (has: boolean, v: Record<number, number> = {}): SiwonProbe => ({
    flag: (id) => id === FLAG_GAME_COMPLETED,
    variable: (id) => v[id] ?? 0,
    hasFatefulRegigigas: () => has,
  })

  it('선물 6 이후 · 마리가 어디에도 없고 · 레지를 못 잡았으면 같은 선물을 다시 준다 (피리까지 줬어도)', () => {
    for (const given of [6, 7]) {
      const turn = siwonTurn(given, probe(false))
      expect(turn.kind).toBe('gift')
      if (turn.kind !== 'gift') return
      expect(turn.regift).toBe(true)
      expect(turn.entry).toBe(SIWON_GIFTS[5])
    }
  })

  it('마리가 파티·박스·육성가 어딘가에 있으면 다시 안 준다 (중복 지급 없음)', () => {
    expect(siwonTurn(6, probe(true))).toEqual({ kind: 'wait', at: 5 })
    expect(siwonTurn(7, probe(true))).toEqual({ kind: 'done' })
  })

  it('이미 레지를 잡았으면(290) 마리가 없어도 다시 안 준다', () => {
    expect(siwonTurn(6, probe(false, { [VAR_RUINS_STATE[1]]: 290 })).kind).toBe('gift')
    const t6 = siwonTurn(6, probe(false, { [VAR_RUINS_STATE[1]]: 290 }))
    expect(t6.kind === 'gift' && t6.regift).toBeFalsy()
    expect(siwonTurn(7, probe(false, { [VAR_RUINS_STATE[1]]: 290 }))).toEqual({ kind: 'done' })
  })

  it('받기 전(given ≤ 5)에는 재지급이 아니다 · 신호를 안 채운 probe는 옛 동작 그대로', () => {
    const t = siwonTurn(5, probe(false))
    expect(t.kind === 'gift' && t.regift).toBeFalsy()
    const plain: SiwonProbe = { flag: (id) => id === FLAG_GAME_COMPLETED, variable: () => 0 }
    expect(siwonTurn(7, plain)).toEqual({ kind: 'done' })
  })

  it('재지급은 마리를 건네되 「주었다」 수를 올리지 않는다', () => {
    const calls = { fateful: 0, count: 0 }
    const plan = planSiwonTalk({
      locale: 'ko', given: 7, probe: probe(false),
      canFitItem: () => true, hasPartyRoom: () => true,
      giveFateful: () => { calls.fateful++; return true },
      giveMon: () => true, giveEgg: () => true, setVar: () => {},
      countGiven: () => { calls.count++ },
    })
    plan.commit?.()
    expect(calls).toEqual({ fateful: 1, count: 0 })
  })

  it('파티가 가득이면 재지급 대신 파티 가득 말을 한다', () => {
    const plan = planSiwonTalk({
      locale: 'ko', given: 7, probe: probe(false),
      canFitItem: () => true, hasPartyRoom: () => false,
      giveFateful: () => true, giveMon: () => true, giveEgg: () => true, setVar: () => {},
      countGiven: () => {},
    })
    expect(plan.commit).toBeNull()
  })
})
