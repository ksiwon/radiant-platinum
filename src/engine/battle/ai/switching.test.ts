// 교체 판단. **비어 있으면 아무 일도 안 일어나는 종류의 코드**라 실제로 고르는지를 본다.
import { describe, it, expect } from 'vitest'
import type { AiMon, AiMove } from './context'
import { ABILITY } from './rom'
import { postKoSwitchIn, shouldSwitch, type BenchMon } from './switching'
import { TYPE } from './typeChart'

const stats = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }
const noBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }

function mon(types: number[], over: Partial<AiMon> = {}): AiMon {
  return {
    species: 1, types, level: 50, hp: 100, maxHp: 100, status: 'ok',
    boosts: { ...noBoosts }, ability: 0, stats, heldItem: 0, gender: 'genderless',
    bench: 0, volatiles: new Set(), side: new Map(), ...over,
  }
}

/** 위력 있는 공격기 한 칸 */
function attack(type: number, power = 80): AiMove {
  return { slot: 1, id: 33, effect: 0, power, type, category: 'physical', accuracy: 100, priority: 0 }
}

function bench(key: string, types: number[], moves: AiMove[], index = 2): BenchMon {
  return { index, key, moves, mon: mon(types) }
}

describe('쓰러진 뒤 누구를 내보내나', () => {
  it('상성이 좋고 굉장한 기술을 가진 쪽을 고른다', () => {
    // 상대는 물/땅. 풀이 4배로 들어간다
    const foe = mon([TYPE.WATER, TYPE.GROUND])
    const picked = postKoSwitchIn([
      bench('불', [TYPE.FIRE], [attack(TYPE.FIRE)], 2),
      bench('풀', [TYPE.GRASS], [attack(TYPE.GRASS)], 3),
      bench('노말', [TYPE.NORMAL], [attack(TYPE.NORMAL)], 4),
    ], foe, null)
    expect(picked?.key).toBe('풀')
    expect(picked?.index).toBe(3)
  })

  it('상성만 좋고 그 기술이 없으면 건너뛴다', () => {
    // 풀 타입인데 기술은 노말뿐이다 — 원작도 "굉장한 기술이 실제로 있는가"를 본다
    const foe = mon([TYPE.WATER, TYPE.GROUND])
    const picked = postKoSwitchIn([
      bench('빈손풀', [TYPE.GRASS], [attack(TYPE.NORMAL)], 2),
      bench('전기', [TYPE.ELECTRIC], [attack(TYPE.ELECTRIC)], 3),
    ], foe, null)
    // 전기는 땅에 무효라 굉장한 기술이 아니다. 둘 다 1단계에서 탈락하고
    // 2단계(데미지)로 넘어간다 — 땅에게 0인 전기 대신 노말이 남는다
    expect(picked?.key).toBe('빈손풀')
  })

  it('아무도 굉장한 게 없으면 제일 세게 때리는 쪽을 낸다', () => {
    const foe = mon([TYPE.NORMAL])
    const picked = postKoSwitchIn([
      bench('약함', [TYPE.NORMAL], [attack(TYPE.NORMAL, 20)], 2),
      bench('셈', [TYPE.NORMAL], [attack(TYPE.NORMAL, 120)], 3),
    ], foe, null)
    expect(picked?.key).toBe('셈')
  })

  it('벤치가 비면 null', () => {
    expect(postKoSwitchIn([], mon([TYPE.NORMAL]), null)).toBeNull()
  })
})

describe('쓰러지기 전에 물러설까', () => {
  const foe = mon([TYPE.GHOST])
  /** 노말 기술 둘 — 고스트에게 하나도 안 통한다 */
  const useless = [attack(TYPE.NORMAL), attack(TYPE.NORMAL, 60)]
  const random = () => 0.5

  it('아무것도 안 통하고 벤치에 통하는 애가 있으면 바꾼다', () => {
    expect(shouldSwitch({
      self: mon([TYPE.NORMAL]), foe, moves: useless,
      bench: [bench('고스트', [TYPE.GHOST], [attack(TYPE.GHOST)])],
      weather: null, random,
    })).toBe(true)
  })

  it('벤치도 못 때리면 안 바꾼다', () => {
    expect(shouldSwitch({
      self: mon([TYPE.NORMAL]), foe, moves: useless,
      bench: [bench('노말', [TYPE.NORMAL], [attack(TYPE.NORMAL)])],
      weather: null, random,
    })).toBe(false)
  })

  it('공격기가 하나뿐이면 안 바꾼다 — 원본의 numMoves < 2', () => {
    expect(shouldSwitch({
      self: mon([TYPE.NORMAL]), foe, moves: [attack(TYPE.NORMAL)],
      bench: [bench('고스트', [TYPE.GHOST], [attack(TYPE.GHOST)])],
      weather: null, random,
    })).toBe(false)
  })

  it('그림자밟기에 잡혀 있으면 못 바꾼다', () => {
    expect(shouldSwitch({
      self: mon([TYPE.NORMAL]),
      foe: mon([TYPE.GHOST], { ability: ABILITY.SHADOW_TAG }),
      moves: useless,
      bench: [bench('고스트', [TYPE.GHOST], [attack(TYPE.GHOST)])],
      weather: null, random,
    })).toBe(false)
  })

  it('멸망의노래가 이번 턴이면 바꾼다', () => {
    expect(shouldSwitch({
      self: mon([TYPE.NORMAL], { volatiles: new Set(['perish1']) }),
      foe: mon([TYPE.NORMAL]),
      moves: [attack(TYPE.NORMAL)],
      bench: [bench('아무', [TYPE.NORMAL], [attack(TYPE.NORMAL)])],
      weather: null, random,
    })).toBe(true)
  })

  it('자연회복으로 자고 있으면 물러나서 낫는다', () => {
    expect(shouldSwitch({
      self: mon([TYPE.NORMAL], { status: 'slp', ability: ABILITY.NATURAL_CURE }),
      foe: mon([TYPE.NORMAL]),
      moves: [attack(TYPE.NORMAL)],
      bench: [bench('아무', [TYPE.NORMAL], [attack(TYPE.NORMAL)])],
      weather: null, random,
    })).toBe(true)
  })

  it('멀쩡하면 안 바꾼다', () => {
    expect(shouldSwitch({
      self: mon([TYPE.FIRE]), foe: mon([TYPE.GRASS]),
      moves: [attack(TYPE.FIRE)],
      bench: [bench('아무', [TYPE.NORMAL], [attack(TYPE.NORMAL)])],
      weather: null, random,
    })).toBe(false)
  })
})
