// 교체 화면이 파티를 제대로 읽는가 (PLAN §2.5)
//
// 여기서 지키는 것 둘: **벤치에 있는 애의 속사정이 요청에서 다 나온다**는 것과,
// **프로토콜의 특성 아이디를 롬 번호로 되돌릴 수 있다**는 것.
import { describe, it, expect } from 'vitest'
import { partySummary } from '../../engine/battle/choice'
import type { BattleRequest } from '../../engine/battle/events'
import { abilityIndex } from './SwitchScreen'

const mon = (over: Partial<BattleRequest['side']['pokemon'][0]>) => ({
  ident: 'p1: turtwig',
  details: 'Turtwig, L13, F',
  condition: '38/38',
  active: false,
  stats: { atk: 20, def: 22, spa: 18, spd: 18, spe: 15 },
  moves: ['tackle', 'withdraw'],
  baseAbility: 'overgrow',
  item: '',
  ...over,
})

const request = (pokemon: BattleRequest['side']['pokemon']): BattleRequest => ({
  side: { name: '나', id: 'p1', pokemon },
})

describe('교체 화면이 읽는 파티', () => {
  it('벤치에 있는 애의 체력·기술·특성까지 나온다', () => {
    // ⚠️ 이게 이 화면의 근거 전부다. `roster`에는 종족·이름·레벨만 있어서
    // 체력도 기술도 없다 — 요청에는 나와 있지 않은 애들 것까지 실려 온다
    const got = partySummary(request([
      mon({ active: true }),
      mon({ ident: 'p1: starly', condition: '12/30 brn', moves: ['quickattack'] }),
      mon({ ident: 'p1: shinx', condition: '0 fnt' }),
    ]))
    expect(got).toHaveLength(3)
    expect(got[0]).toMatchObject({ index: 1, key: 'turtwig', hp: 38, maxHp: 38, active: true })
    expect(got[1]).toMatchObject({ key: 'starly', hp: 12, maxHp: 30, status: 'brn', fainted: false })
    expect(got[2]).toMatchObject({ key: 'shinx', hp: 0, fainted: true, status: null })
    expect(got[1]!.moves.map((m) => m.id)).toEqual(['quickattack'])
    expect(got[0]!.ability).toBe('overgrow')
  })

  it('빈 턴 칸은 파티에 안 뜬다', () => {
    // 볼·도망이 턴을 쓰려고 끼워 넣은 기술(`IDLE_MOVE`)이다. 다섯 번째 기술로
    // 뜨면 안 되고, **나와 있는 한 마리에게만** 붙는다
    const rows = partySummary(
      request([
        mon({ active: true, moves: ['tackle', 'withdraw', 'absorb', 'razorleaf', 'splash'] }),
        mon({ ident: 'p1: starly', moves: ['tackle', 'growl', 'quickattack', 'splash'] }),
      ]),
      { hiddenSlot: 5 },
    )
    expect(rows[0]!.moves.map((m) => m.id)).toEqual(['tackle', 'withdraw', 'absorb', 'razorleaf'])
    // 벤치에 있는 애의 다섯 번째는 진짜 그 애의 기술이라 안 자른다
    expect(rows[1]!.moves).toHaveLength(4)
  })

  it('기술 번호는 풀어 주는 쪽이 준다', () => {
    const rows = partySummary(request([mon({})]), {
      moveId: (id) => (id === 'tackle' ? 33 : null),
    })
    expect(rows[0]!.moves).toEqual([
      { id: 'tackle', move: 33 }, { id: 'withdraw', move: null },
    ])
  })

  it('요청이 없으면 빈 목록', () => {
    expect(partySummary(null)).toEqual([])
  })
})

describe('특성 아이디 → 롬 번호', () => {
  // ⚠️ 표를 손으로 안 적는다. 프로토콜은 `sandstream`을 주고 우리에겐 같은
  // 차례의 영어 이름이 있다 — 둘을 같은 규칙으로 뭉개면 그대로 맞는다
  const names = ['-', 'Stench', 'Drizzle', 'Speed Boost', 'Battle Armor']

  it('사이의 빈칸과 대소문자를 무시하고 맞춘다', () => {
    expect(abilityIndex(names, 'speedboost')).toBe(3)
    expect(abilityIndex(names, 'battlearmor')).toBe(4)
    expect(abilityIndex(names, 'drizzle')).toBe(2)
  })

  it('없는 특성은 −1', () => {
    expect(abilityIndex(names, 'sandstream')).toBe(-1)
  })
})
