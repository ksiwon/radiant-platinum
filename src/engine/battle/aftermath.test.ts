// 배틀 → 세이브 왕복. 여기가 어긋나면 다친 포켓몬의 HP가 옆 칸에 적힌다.
import { describe, it, expect } from 'vitest'
import type { FinalMon } from './events'
import type { PokemonInstance } from '../pokemon/instance'
import { applyResults, foeKey, isWipedOut, partyKey } from './aftermath'
import { noOrigin } from '../pokemon/origin'

function mon(species: number, hp: number): PokemonInstance {
  return {
    species, pid: 1, nickname: null, exp: 0, level: 10,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [], hp, status: 'ok', statusTurns: 0,
    heldItem: 0, friendship: 70, isEgg: false, otId: 1, otSecretId: 2, ball: 0,
    origin: noOrigin({ name: '', gender: 'male' }),
  }
}

const result = (key: string, hp: number, extra: Partial<FinalMon> = {}): FinalMon => ({
  key, hp, maxHp: 40, status: 'ok', fainted: hp <= 0, pp: [], ...extra,
})

describe('배틀 결과 되돌리기', () => {
  it('순서가 아니라 키로 짝짓는다', () => {
    // sim의 `sides[i].pokemon`은 교체할 때마다 순서가 바뀐다. 그 배열을 그대로
    // 파티에 겹쳐 쓰면 2번이 입은 데미지가 0번에 적힌다
    const party = [mon(387, 40), mon(405, 40), mon(19, 40)]
    const shuffled = [result(partyKey(2), 3), result(partyKey(0), 40), result(partyKey(1), 17)]
    const after = applyResults(party, shuffled)
    expect(after.map((m) => m.hp)).toEqual([40, 17, 3])
    expect(after.map((m) => m.species)).toEqual([387, 405, 19])
  })

  it('상태이상도 같이 온다', () => {
    const after = applyResults([mon(387, 40)], [result(partyKey(0), 20, { status: 'brn' })])
    expect(after[0]!.status).toBe('brn')
  })

  it('상태이상이 나으면 남은 턴도 0으로 돌아간다', () => {
    const sleeping = { ...mon(387, 40), status: 'slp' as const, statusTurns: 2 }
    const after = applyResults([sleeping], [result(partyKey(0), 20)])
    expect(after[0]!.status).toBe('ok')
    expect(after[0]!.statusTurns).toBe(0)
  })

  it('결과에 없는 개체는 건드리지 않는다', () => {
    // 배틀에 아예 안 나간 파티원이 있다. 여기서 0으로 밀어 버리면 세이브가 망가진다
    const party = [mon(387, 40), mon(405, 33)]
    const after = applyResults(party, [result(partyKey(0), 5)])
    expect(after[0]!.hp).toBe(5)
    expect(after[1]).toBe(party[1]) // 손댄 적이 없으니 같은 객체여야 한다
  })

  it('원본을 바꾸지 않는다', () => {
    const party = [mon(387, 40)]
    applyResults(party, [result(partyKey(0), 1)])
    expect(party[0]!.hp).toBe(40)
  })

  it('우리 키와 상대 키는 겹치지 않는다', () => {
    // 겹치면 상대 결과가 우리 파티에 들어간다
    for (let i = 0; i < 6; i++) expect(partyKey(i)).not.toBe(foeKey(i))
  })

  it('PP를 칸 순서가 아니라 기술 번호로 되돌린다', () => {
    // sim이 우리 칸 순서를 안 지켜 주므로 순서로 되돌리면 엉뚱한 칸에 적힌다.
    // 여기서는 sim 쪽 순서를 일부러 뒤집어 둔다
    const party = [mon(387, 40)]
    party[0]!.moves = [
      { move: 33, pp: 35, ppUps: 0 }, // 몸통박치기
      { move: 45, pp: 40, ppUps: 0 }, // 울음소리
      { move: 71, pp: 25, ppUps: 0 }, // 흡수
    ]
    const after = applyResults(party, [result(partyKey(0), 30, {
      pp: [{ move: 71, pp: 20 }, { move: 33, pp: 31 }],
    })])
    expect(after[0]!.moves.map((m) => m.pp)).toEqual([31, 40, 20])
  })

  it('PP는 0 밑으로 안 내려간다', () => {
    const party = [mon(387, 40)]
    party[0]!.moves = [{ move: 33, pp: 2, ppUps: 0 }]
    const after = applyResults(party, [result(partyKey(0), 30, {
      pp: [{ move: 33, pp: -3 }],
    })])
    expect(after[0]!.moves[0]!.pp).toBe(0)
  })

  it('결과에 없는 기술은 안 건드린다', () => {
    const party = [mon(387, 40)]
    party[0]!.moves = [{ move: 33, pp: 35, ppUps: 0 }]
    const after = applyResults(party, [result(partyKey(0), 30, { pp: [] })])
    expect(after[0]!.moves[0]!.pp).toBe(35)
  })

  it('전멸 판정 — 빈 파티는 전멸이 아니다', () => {
    expect(isWipedOut([mon(387, 0), mon(405, 0)])).toBe(true)
    expect(isWipedOut([mon(387, 0), mon(405, 1)])).toBe(false)
    // 파티가 비어 있는 것은 "졌다"가 아니라 "아직 아무도 없다"다
    expect(isWipedOut([])).toBe(false)
  })
})
