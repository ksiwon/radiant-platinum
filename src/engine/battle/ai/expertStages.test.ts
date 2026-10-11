// EXPERT 능력 변화기 루틴 (`trainer_ai/script.s` 1975~2516)
//
// 효과 번호로 분기하는 갈래만 잰다 — 기술 자료에 기대지 않고 `AiMove.effect`를 직접 박는다.
// 난수는 상수다. `IfRandomLessThan n`은 `floor(r × 256) < n`이면 분기(= 점수를 안 준다)한다
import { describe, expect, it } from 'vitest'
import { noBoosts } from '../view'
import type { AiMon, AiMove, AiTurn } from './context'
import { scoreExpert } from './expert'
import { EFFECT } from './rom'

function mon(patch: Partial<AiMon> = {}, hpPct = 100): AiMon {
  const stats = { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }
  return {
    species: 399, types: [0, 0], level: 50, hp: Math.round(2 * hpPct), maxHp: 200, status: 'ok',
    boosts: noBoosts(), ability: 0, stats, heldItem: 0, itemEffect: 0, itemParam: 0,
    naturalGiftPower: 0, naturalGiftType: -1, weightHg: 100, gender: 'male', bench: 1,
    volatiles: new Set(), side: new Map(), ...patch,
  }
}

function run(
  effect: number,
  o: {
    self?: AiMon; foe?: AiMon; random?: number; last?: AiTurn['foeLastMoveCategory']
  } = {},
): number {
  const move: AiMove = { slot: 1, id: 1, effect, power: 0, type: 0, category: 'status', accuracy: 100, priority: 0 }
  const turn: AiTurn = {
    self: o.self ?? mon(), foe: o.foe ?? mon(), moves: [move], all: [move], weather: null,
    field: new Set(), turn: 1, foeKnownMoves: new Set(), foeLastMoveCategory: o.last ?? null,
    protectChain: 0, random: () => o.random ?? 0.99,
  }
  return scoreExpert(turn, move)
}

const boosts = (patch: Partial<AiMon['boosts']>) => ({ ...noBoosts(), ...patch })

describe('올리기 — 공격·특공 (`Expert_StatusAttackUp` · `StatusSpAttackUp`)', () => {
  it('체력 가득이면 50%로 +2, 이미 +3이면 ~61%로 −1', () => {
    expect(run(EFFECT.ATK_UP_2)).toBe(2)
    expect(run(EFFECT.ATK_UP_2, { random: 0.0 })).toBe(0)
    expect(run(EFFECT.ATK_UP_2, { self: mon({ boosts: boosts({ atk: 3 }) }) })).toBe(-1)
  })

  it('체력 40% 미만이면 −2 · 그 사이는 문턱 밖이면 −2 (공격 40 · 특공 70)', () => {
    expect(run(EFFECT.ATK_UP, { self: mon({}, 30) })).toBe(-2)
    expect(run(EFFECT.ATK_UP, { self: mon({}, 60), random: 0.99 })).toBe(-2)
    expect(run(EFFECT.ATK_UP, { self: mon({}, 60), random: 0.1 })).toBe(0)
    // 0.2 = 51/256 — 공격(40)은 문턱을 넘고 특공(70)은 아직 안쪽이다
    expect(run(EFFECT.ATK_UP, { self: mon({}, 60), random: 0.2 })).toBe(-2)
    expect(run(EFFECT.SP_ATK_UP, { self: mon({}, 60), random: 0.2 })).toBe(0)
    expect(run(EFFECT.SP_ATK_UP, { self: mon({}, 60), random: 0.28 })).toBe(-2)
  })
})

describe('올리기 — 방어·특방 (`Expert_StatusDefenseUp` · `StatusSpDefenseUp`)', () => {
  it('체력 70% 이상이면 78%로 끝난다', () => {
    expect(run(EFFECT.DEF_UP, { self: mon({}, 80), random: 0.5 })).toBe(0)
    expect(run(EFFECT.DEF_UP, { self: mon({}, 80), random: 0.9 })).toBe(-2)
    // 가득이면 앞에서 +2를 받는다
    expect(run(EFFECT.DEF_UP, { random: 0.99 })).toBe(2 - 2)
  })

  it('체력 40% 미만이면 −2', () => {
    expect(run(EFFECT.SP_DEF_UP, { self: mon({}, 30) })).toBe(-2)
  })

  it('중간 체력은 상대의 직전 기술로 가른다 — 방어는 특수기, 특방은 물리기를 맞았으면 곧장 −2', () => {
    const self = mon({}, 55)
    expect(run(EFFECT.DEF_UP, { self, last: 'special', random: 0.0 })).toBe(-2)
    expect(run(EFFECT.DEF_UP, { self, last: 'physical', random: 0.0 })).toBe(0)
    expect(run(EFFECT.SP_DEF_UP, { self, last: 'physical', random: 0.0 })).toBe(-2)
    expect(run(EFFECT.SP_DEF_UP, { self, last: 'special', random: 0.0 })).toBe(0)
  })

  it('중간 체력에 상대가 위력 없는 기술(없음·변화기)을 썼으면 60/256만 넘긴다', () => {
    const self = mon({}, 55)
    expect(run(EFFECT.DEF_UP, { self, last: null, random: 0.1 })).toBe(0)
    expect(run(EFFECT.DEF_UP, { self, last: 'status', random: 0.5 })).toBe(-2)
  })

  it('명상·철벽류는 원작이 특방·방어 루틴으로 보낸다', () => {
    const self = mon({}, 55)
    expect(run(EFFECT.SP_ATK_SP_DEF_UP, { self, last: 'physical', random: 0.0 })).toBe(-2)
    expect(run(EFFECT.DEF_SPD_UP, { self, last: 'physical', random: 0.0 })).toBe(-2)
    expect(run(EFFECT.ATK_DEF_UP, { self, last: 'special', random: 0.0 })).toBe(-2)
  })
})

describe('올리기 — 스피드 (`Expert_StatusSpeedUp`)', () => {
  it('내가 더 빠르면 −3 · 느리면 ~73%로 +3', () => {
    const slow = mon({ stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 50 } })
    expect(run(EFFECT.SPEED_UP_2)).toBe(-3)
    expect(run(EFFECT.SPEED_UP_2, { self: slow })).toBe(3)
    expect(run(EFFECT.SPEED_UP_2, { self: slow, random: 0.1 })).toBe(0)
  })
})

describe('깎기 (`Expert_StatusAttackDown` · `DefenseDown` · `AccuracyDown` …)', () => {
  it('공격 깎기: 상대 단계가 ±0이면 앞 갈래를 건너뛴다 · 상대 체력 70% 이하면 −2', () => {
    expect(run(EFFECT.ATK_DOWN)).toBe(0)
    expect(run(EFFECT.ATK_DOWN, { foe: mon({}, 60) })).toBe(-2)
  })

  it('공격 깎기: 단계가 있으면 −1, 내 체력이 90% 이하면 −1 더, −3 이하면 ~80%로 −2', () => {
    const foe = mon({ boosts: boosts({ atk: 1 }) })
    expect(run(EFFECT.ATK_DOWN, { foe })).toBe(-1)
    expect(run(EFFECT.ATK_DOWN, { foe, self: mon({}, 80) })).toBe(-2)
    const deep = mon({ boosts: boosts({ atk: -3 }) })
    expect(run(EFFECT.ATK_DOWN_2, { foe: deep })).toBe(-3)
    expect(run(EFFECT.ATK_DOWN_2, { foe: deep, random: 0.1 })).toBe(-1)
  })

  it('공격 깎기: 직전 기술이 특수기면 50%로 −2 (특공은 물리기)', () => {
    expect(run(EFFECT.ATK_DOWN, { last: 'special', random: 0.99 })).toBe(-2)
    expect(run(EFFECT.ATK_DOWN, { last: 'special', random: 0.1 })).toBe(0)
    expect(run(EFFECT.ATK_DOWN, { last: 'physical', random: 0.99 })).toBe(0)
    expect(run(EFFECT.SP_ATK_DOWN, { last: 'physical', random: 0.99 })).toBe(-2)
    expect(run(EFFECT.SP_ATK_DOWN_2, { last: 'special', random: 0.99 })).toBe(0)
  })

  it('방어·특방 깎기: 내 체력 70% 미만이면 ~80%로 −2 · 상대 체력 70% 이하면 −2', () => {
    expect(run(EFFECT.DEF_DOWN)).toBe(0)
    expect(run(EFFECT.DEF_DOWN, { self: mon({}, 60) })).toBe(-2)
    expect(run(EFFECT.DEF_DOWN, { self: mon({}, 60), random: 0.1 })).toBe(0)
    expect(run(EFFECT.SP_DEF_DOWN_2, { foe: mon({}, 70) })).toBe(-2)
    expect(run(EFFECT.ATK_DEF_DOWN, { foe: mon({ boosts: boosts({ def: -3 }) }, 60) })).toBe(-4)
  })

  it('⚠️ 회피 깎기(63)는 명중 루틴으로, 명중 깎기(64)는 회피 루틴으로 간다 (원작 분기표가 바뀌어 있다)', () => {
    // 명중 루틴은 상대 체력 70% 이하·내 체력 가득일 때 ~61%로 −1을 준다 — 회피 루틴은 −2를 준다
    const foe = mon({}, 60)
    expect(run(EFFECT.EVA_DOWN_2, { foe })).toBe(-1)
    expect(run(EFFECT.ACC_DOWN_2, { foe })).toBe(-2)
    expect(run(EFFECT.ACC_DOWN, { foe })).toBe(-1)
    expect(run(EFFECT.EVA_DOWN, { foe })).toBe(-2)
  })

  it('명중 깎기: 독독·씨뿌리기·저주로 깎아 두었으면 +2, 뿌리박기면 50%로 +1', () => {
    expect(run(EFFECT.ACC_DOWN, { foe: mon({ status: 'tox' }) })).toBe(2)
    expect(run(EFFECT.ACC_DOWN, { foe: mon({ volatiles: new Set(['leechseed']) }) })).toBe(2)
    expect(run(EFFECT.ACC_DOWN, { foe: mon({ volatiles: new Set(['curse']) }) })).toBe(2)
    expect(run(EFFECT.ACC_DOWN, { self: mon({ volatiles: new Set(['ingrain']) }) })).toBe(1)
    expect(run(EFFECT.ACC_DOWN, { foe: mon({ status: 'tox' }), random: 0.1 })).toBe(0)
  })

  it('명중 깎기: 내가 −2 이하면 ~69%로 −2 · 체력이 바닥이고 상대 명중이 ±0이 아니면 −2', () => {
    expect(run(EFFECT.ACC_DOWN, { self: mon({ boosts: boosts({ accuracy: -2 }) }) })).toBe(-2)
    const foe = mon({ boosts: boosts({ accuracy: -1 }) })
    expect(run(EFFECT.ACC_DOWN, { self: mon({}, 30), foe })).toBe(-1 - 2)
    // 상대 명중이 ±0이면 체력 구간 갈래는 건너뛴다
    expect(run(EFFECT.ACC_DOWN, { self: mon({}, 30) })).toBe(-1)
  })
})
