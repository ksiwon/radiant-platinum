// EXPERT 나머지 루틴 (`trainer_ai/script.s` 1623~6340) — 루틴마다 상황 몇 개씩
//
// 기술 자료에 기대지 않고 `AiMove.effect`를 직접 박는다. 기댓값은 코드가 아니라 **스크립트를 줄 따라 읽어**
// 정했다. 난수는 상수다: 0.99(= 253/256)는 `IfRandomLessThan n`(n ≤ 230)을 전부 「안 건너뜀」,
// 0.0은 전부 「건너뜀」으로 고정한다. 둘의 사이는 문턱을 따로 가를 때만 쓴다
import { describe, expect, it } from 'vitest'
import { noBoosts } from '../view'
import type { AiMon, AiMove, AiTurn } from './context'
import { scoreExpert } from './expert'
import { AB, E, HE, IT, MV } from './expertIds'
import { EFFECT } from './rom'
import { TYPE } from './typeChart'

const SWITCH_HIT = 228 // 유턴
const SLOW = { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 50 }
const FAST = { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 200 }

function mon(patch: Partial<AiMon> = {}, hpPct = 100): AiMon {
  const stats = { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }
  return {
    species: 399, types: [TYPE.NORMAL, TYPE.NORMAL], level: 50, hp: Math.round(2 * hpPct), maxHp: 200,
    status: 'ok', boosts: noBoosts(), ability: 0, stats, heldItem: 0, itemEffect: 0, itemParam: 0,
    naturalGiftPower: 0, naturalGiftType: -1, weightHg: 100, gender: 'male', bench: 1,
    volatiles: new Set(), side: new Map(), ...patch,
  }
}

const boosts = (patch: Partial<AiMon['boosts']>) => ({ ...noBoosts(), ...patch })
const last = (patch: Partial<AiMove> = {}): AiMove => ({
  slot: 0, id: 1, effect: 0, power: 50, type: TYPE.NORMAL, category: 'physical', accuracy: 100,
  priority: 0, ...patch,
})

interface Opts {
  self?: AiMon
  foe?: AiMon
  random?: number
  /** 상대가 직전에 쓴 기술. 안 주면 쓴 적 없다 */
  foeLast?: AiMove | null
  /** 상대가 써 보인 기술의 효과들 */
  knows?: number[]
  /** 상대가 써 보인 기술 번호들 */
  knownIds?: number[]
  /** 내가 가진 기술 (대상 기술 말고) */
  mine?: AiMove[]
  move?: Partial<AiMove>
  turn?: Partial<AiTurn>
}

function run(effect: number, o: Opts = {}): number {
  const move: AiMove = {
    slot: 1, id: 1, effect, power: 0, type: TYPE.NORMAL, category: 'status', accuracy: 100,
    priority: 0, ...o.move,
  }
  const moves = [move, ...(o.mine ?? [])]
  const t: AiTurn = {
    self: o.self ?? mon(), foe: o.foe ?? mon(), moves, all: moves, weather: null, field: new Set(),
    turn: 3, foeKnownMoves: new Set(o.knownIds ?? []), foeLastMoveCategory: null, protectChain: 0,
    random: () => o.random ?? 0.99, foeLast: o.foeLast ?? null,
    foeKnownEffects: new Set(o.knows ?? []), ...o.turn,
  }
  return scoreExpert(t, move)
}

describe('꿈먹기 · 앵무새 · 안개 · 참기 · 울부짖기', () => {
  it('꿈먹기: 잠든 상대에 80%로 +3 · 반감·무효면 −1', () => {
    const sleeper = mon({ status: 'slp' })
    expect(run(E.RECOVER_DAMAGE_SLEEP, { foe: sleeper })).toBe(3)
    expect(run(E.RECOVER_DAMAGE_SLEEP, { foe: sleeper, random: 0.1 })).toBe(0)
    expect(run(E.RECOVER_DAMAGE_SLEEP, { foe: mon({ types: [TYPE.GHOST, TYPE.GHOST], status: 'slp' }) }))
      .toBe(-1)
  })

  it('앵무새: 상대의 직전 기술이 표에 있고 내가 빠르면 50%로 +2 · 아니면 31%로 −1', () => {
    const fast = mon({ stats: FAST })
    const slow = mon({ stats: SLOW })
    expect(run(E.COPY_MOVE, { self: fast, foeLast: last({ id: MV.SPORE }) })).toBe(2)
    expect(run(E.COPY_MOVE, { self: fast, foeLast: last({ id: MV.SPORE }), random: 0.1 })).toBe(0)
    expect(run(E.COPY_MOVE, { self: slow, foeLast: last({ id: MV.SPORE }) })).toBe(0)
    expect(run(E.COPY_MOVE, { self: slow })).toBe(-1)
    expect(run(E.COPY_MOVE, { self: slow, random: 0.2 })).toBe(0)
  })

  it('안개: 내가 올려 둔 것은 지우지 말고(−3) 상대가 올린 것은 지운다(+3) · 둘 다 아니면 −1', () => {
    expect(run(E.RESET_STAT_CHANGES, { self: mon({ boosts: boosts({ atk: 3 }) }) })).toBe(-3 - 1)
    expect(run(E.RESET_STAT_CHANGES, { foe: mon({ boosts: boosts({ evasion: 3 }) }) })).toBe(3)
    expect(run(E.RESET_STAT_CHANGES, { self: mon({ boosts: boosts({ spa: -3 }) }) })).toBe(3)
    expect(run(E.RESET_STAT_CHANGES, { foe: mon({ boosts: boosts({ accuracy: -3 }) }) })).toBe(-3 - 1)
    expect(run(E.RESET_STAT_CHANGES)).toBe(-1)
    expect(run(E.RESET_STAT_CHANGES, { random: 0.0 })).toBe(0)
  })

  it('참기: 체력이 90% 이하면 −2', () => {
    expect(run(E.BIDE)).toBe(0)
    expect(run(E.BIDE, { self: mon({}, 80) })).toBe(-2)
  })

  it('울부짖기: 상대가 3턴 넘게 나와 있으면 75%로 +2에 50%로 +2 더 · 압정이 있으면 50% · 없으면 −3', () => {
    expect(run(E.FORCE_SWITCH, { turn: { foeTurn: 4 } })).toBe(4)
    expect(run(E.FORCE_SWITCH, { turn: { foeTurn: 4 }, random: 0.0 })).toBe(0)
    expect(run(E.FORCE_SWITCH, { foe: mon({ side: new Map([['stealthrock', 1]]) }) })).toBe(2)
    expect(run(E.FORCE_SWITCH, { foe: mon({ boosts: boosts({ def: 3 }) }) })).toBe(2)
    expect(run(E.FORCE_SWITCH)).toBe(-3)
  })
})

describe('일격필살 · 분노의앞니 · 독 · 뽐내기 · 부추기기', () => {
  it('일격필살 25%로 +1', () => {
    expect(run(E.ONE_HIT_KO)).toBe(1)
    expect(run(E.ONE_HIT_KO, { random: 0.5 })).toBe(0)
  })

  it('분노의앞니: 상대 체력 50% 이하면 −1', () => {
    expect(run(E.HALVE_HP, { foe: mon({}, 50) })).toBe(-1)
    expect(run(E.HALVE_HP, { foe: mon({}, 60) })).toBe(0)
  })

  it('독: 내 체력 50% 미만이거나 상대 체력 50% 이하면 −1', () => {
    expect(run(E.STATUS_POISON, { self: mon({}, 40) })).toBe(-1)
    expect(run(E.STATUS_POISON, { foe: mon({}, 40) })).toBe(-1)
    expect(run(E.STATUS_POISON)).toBe(0)
  })

  it('뽐내기: 심술부리기가 있으면 −2 이상(−5) · −3 이하면 +3(첫 턴이면 +5) · 없으면 부추기기와 같다', () => {
    const psych = [{ ...last(), id: MV.PSYCH_UP, slot: 2 }]
    expect(run(E.ATK_UP_2_STATUS_CONFUSION, { mine: psych })).toBe(-5)
    const low = mon({ boosts: boosts({ atk: -3 }) })
    expect(run(E.ATK_UP_2_STATUS_CONFUSION, { mine: psych, foe: low })).toBe(3)
    expect(run(E.ATK_UP_2_STATUS_CONFUSION, { mine: psych, foe: low, turn: { turnCount: 0 } })).toBe(5)
    expect(run(E.ATK_UP_2_STATUS_CONFUSION)).toBe(1)
    expect(run(E.ATK_UP_2_STATUS_CONFUSION, { random: 0.0 })).toBe(0)
  })

  it('부추기기: 50%로 +1 뒤에 혼란 갈래 — 상대 체력이 낮으면 깎인다', () => {
    expect(run(E.SP_ATK_UP_CAUSE_CONFUSION)).toBe(1)
    expect(run(E.SP_ATK_UP_CAUSE_CONFUSION, { foe: mon({}, 40) })).toBe(1 - 1 - 1)
  })
})

describe('대타출동 · 사슬묶기 · 카운터 · 미러코트 · 앙코르', () => {
  it('대타출동: 체력이 낮을수록 한 번씩 더 굴려 깎는다', () => {
    expect(run(E.SET_SUBSTITUTE)).toBe(0)
    expect(run(E.SET_SUBSTITUTE, { self: mon({}, 80) })).toBe(-1)
    expect(run(E.SET_SUBSTITUTE, { self: mon({}, 60) })).toBe(-2)
    expect(run(E.SET_SUBSTITUTE, { self: mon({}, 40) })).toBe(-3)
    expect(run(E.SET_SUBSTITUTE, { self: mon({}, 40), random: 0.0 })).toBe(0)
  })

  it('대타출동: 내가 안 느릴 때 상대가 상태기를 쓰고도 상태가 없으면 +1 · 있으면 0', () => {
    const slept = last({ effect: E.STATUS_SLEEP, category: 'status', power: 0 })
    expect(run(E.SET_SUBSTITUTE, { foeLast: slept })).toBe(1)
    expect(run(E.SET_SUBSTITUTE, { foeLast: slept, foe: mon({ status: 'slp' }) })).toBe(0)
    expect(run(E.SET_SUBSTITUTE, { foeLast: slept, self: mon({ stats: SLOW }) })).toBe(0)
  })

  it('사슬묶기: 느리면 0 · 상대가 변화기를 썼으면 61%로 −1 · 공격기면 +1', () => {
    expect(run(E.DISABLE, { self: mon({ stats: SLOW }) })).toBe(0)
    expect(run(E.DISABLE)).toBe(-1)
    expect(run(E.DISABLE, { foeLast: last() })).toBe(1)
    expect(run(E.DISABLE, { random: 0.1 })).toBe(0)
  })

  it('카운터: 자는·헤롱헤롱·혼란한 상대 −1 · 물리기를 맞고 있으면 61%로 +1 · 특수기면 −1', () => {
    expect(run(E.COUNTER, { foe: mon({ status: 'slp' }) })).toBe(-1)
    expect(run(E.COUNTER, { foeLast: last() })).toBe(1)
    expect(run(E.COUNTER, { foeLast: last({ category: 'special' }) })).toBe(-1)
  })

  it('카운터: 상대가 변화기를 썼으면 상대 타입이 특수 쪽일 때 +4 · 미러코트를 알면 61%로 +4', () => {
    const status = last({ power: 0, category: 'status' })
    expect(run(E.COUNTER, { foeLast: status })).toBe(0)
    expect(run(E.COUNTER, { foeLast: status, foe: mon({ types: [TYPE.PSYCHIC, TYPE.PSYCHIC] }) })).toBe(4)
    const coat = [{ ...last(), id: MV.MIRROR_COAT, slot: 2 }]
    expect(run(E.COUNTER, { mine: coat })).toBe(4)
    expect(run(E.COUNTER, { mine: coat, random: 0.1 })).toBe(0)
  })

  it('카운터: 내 체력이 바닥이면 −1씩 쌓이고 놀림당한 상대는 +1', () => {
    expect(run(E.COUNTER, { self: mon({}, 25), foeLast: last() })).toBe(-1 - 1 + 1)
    const taunted = mon({ volatiles: new Set(['taunt']) })
    expect(run(E.COUNTER, { foe: taunted, foeLast: last() })).toBe(2)
  })

  it('미러코트: 특수기에 +1 · 물리기에 −1 · 변화기면 특수 타입 상대에게 0', () => {
    expect(run(E.MIRROR_COAT, { foeLast: last({ category: 'special' }) })).toBe(1)
    expect(run(E.MIRROR_COAT, { foeLast: last() })).toBe(-1)
    const status = last({ power: 0, category: 'status' })
    expect(run(E.MIRROR_COAT, { foeLast: status })).toBe(4)
    expect(run(E.MIRROR_COAT, { foeLast: status, foe: mon({ types: [TYPE.PSYCHIC, TYPE.PSYCHIC] }) })).toBe(0)
    const counter = [{ ...last(), id: MV.COUNTER, slot: 2 }]
    expect(run(E.MIRROR_COAT, { mine: counter })).toBe(4)
  })

  it('앙코르: 사슬묶인 상대 +3 · 느리면 −2 · 직전 기술 효과가 표에 있으면 +3, 아니면 −2', () => {
    expect(run(E.ENCORE, { foe: mon({ volatiles: new Set(['disable']) }) })).toBe(3)
    expect(run(E.ENCORE, { self: mon({ stats: SLOW }) })).toBe(-2)
    expect(run(E.ENCORE, { foeLast: last({ effect: E.STATUS_PARALYZE, category: 'status' }) })).toBe(3)
    expect(run(E.ENCORE, { foeLast: last() })).toBe(-2)
    expect(run(E.ENCORE)).toBe(-2)
  })
})

describe('고통나누기 · 악몽 · 록온 · 길동무 · 기사회생 · 치료방울 · 도둑질', () => {
  it('고통나누기: 상대 체력 80% 미만이면 −1 · 아니면 내 체력으로 (느리면 60 · 아니면 40)', () => {
    expect(run(E.AVERAGE_HP, { foe: mon({}, 70) })).toBe(-1)
    expect(run(E.AVERAGE_HP, { self: mon({}, 30) })).toBe(1)
    expect(run(E.AVERAGE_HP, { self: mon({}, 50) })).toBe(-1)
    expect(run(E.AVERAGE_HP, { self: mon({ stats: SLOW }, 50) })).toBe(1)
  })

  it('악몽 +2 · 록온 50%로 +2', () => {
    expect(run(E.DAMAGE_WHILE_ASLEEP)).toBe(2)
    expect(run(E.NEXT_ATTACK_ALWAYS_HITS)).toBe(2)
    expect(run(E.NEXT_ATTACK_ALWAYS_HITS, { random: 0.0 })).toBe(0)
  })

  it('길동무: −1에서 시작해 체력이 70·50·30% 이하일 때 +1 · +1 · +2, 느리면 −1로 끝', () => {
    expect(run(E.KO_MON_THAT_DEFEATED_USER)).toBe(-1)
    expect(run(E.KO_MON_THAT_DEFEATED_USER, { self: mon({}, 60) })).toBe(0)
    expect(run(E.KO_MON_THAT_DEFEATED_USER, { self: mon({}, 40) })).toBe(1)
    expect(run(E.KO_MON_THAT_DEFEATED_USER, { self: mon({}, 20) })).toBe(3)
    expect(run(E.KO_MON_THAT_DEFEATED_USER, { self: mon({ stats: SLOW }, 20) })).toBe(-1)
  })

  it('기사회생: 느리면 60% 초과 −1 · 40% 이하 +1, 빠르면 33% 초과 −1 · 8% 미만 +2', () => {
    const slow = (p: number) => mon({ stats: SLOW }, p)
    expect(run(E.INCREASE_POWER_WITH_LESS_HP, { self: slow(70) })).toBe(-1)
    expect(run(E.INCREASE_POWER_WITH_LESS_HP, { self: slow(50) })).toBe(0)
    expect(run(E.INCREASE_POWER_WITH_LESS_HP, { self: slow(20) })).toBe(1)
    const fast = (p: number) => mon({ stats: FAST }, p)
    expect(run(E.INCREASE_POWER_WITH_LESS_HP, { self: fast(40) })).toBe(-1)
    expect(run(E.INCREASE_POWER_WITH_LESS_HP, { self: fast(25) })).toBe(0)
    expect(run(E.INCREASE_POWER_WITH_LESS_HP, { self: fast(15) })).toBe(1)
    expect(run(E.INCREASE_POWER_WITH_LESS_HP, { self: fast(5) })).toBe(2)
  })

  it('치료방울: 나도 후발도 상태 이상이 없으면 −5', () => {
    expect(run(E.CURE_PARTY_STATUS)).toBe(-5)
    expect(run(E.CURE_PARTY_STATUS, { self: mon({ status: 'brn' }) })).toBe(0)
    expect(run(E.CURE_PARTY_STATUS, { turn: { partyStatused: true } })).toBe(0)
  })

  it('도둑질: 상대 도구가 표에 있으면 80%로 +1 · 없으면 −2', () => {
    expect(run(E.STEAL_HELD_ITEM, { foe: mon({ itemEffect: HE.HP_RESTORE }) })).toBe(1)
    expect(run(E.STEAL_HELD_ITEM, { foe: mon({ itemEffect: HE.HP_RESTORE }), random: 0.1 })).toBe(0)
    expect(run(E.STEAL_HELD_ITEM)).toBe(-2)
  })
})

describe('꿰뚫어보기 · 버티기 · 바톤터치 · 날씨 · 배북 · 자기암시', () => {
  it('꿰뚫어보기(원작 BUG: 제 타입을 본다): 내가 고스트면 +2 · 아니면 상대 회피가 +3 이상일 때만 +2, 그 밖에 −2', () => {
    expect(run(E.FORESIGHT, { self: mon({ types: [TYPE.GHOST, TYPE.GHOST] }) })).toBe(2)
    expect(run(E.FORESIGHT, { foe: mon({ types: [TYPE.GHOST, TYPE.GHOST] }) })).toBe(-2)
    expect(run(E.FORESIGHT, { foe: mon({ boosts: boosts({ evasion: 3 }) }) })).toBe(2)
  })

  it('버티기: 체력 4% 미만 −1 · 35% 미만 +1 · 그 위는 −1로 흘러내린다', () => {
    expect(run(E.SURVIVE_WITH_1_HP, { self: mon({}, 3) })).toBe(-1)
    expect(run(E.SURVIVE_WITH_1_HP, { self: mon({}, 20) })).toBe(1)
    expect(run(E.SURVIVE_WITH_1_HP, { self: mon({}, 50) })).toBe(-1)
  })

  it('바톤터치: +3 이상이고 체력이 낮으면 +2 · +2이면 낮을 때 0 · 느린 쪽은 70% 미만이 0(주석과 반대)', () => {
    const buffed = (atk: number, p: number, stats = FAST) => mon({ boosts: boosts({ atk }), stats }, p)
    expect(run(E.PASS_STATS_AND_STATUS, { self: buffed(3, 50) })).toBe(2)
    expect(run(E.PASS_STATS_AND_STATUS, { self: buffed(3, 70) })).toBe(0)
    expect(run(E.PASS_STATS_AND_STATUS, { self: buffed(2, 50, SLOW) })).toBe(0)
    expect(run(E.PASS_STATS_AND_STATUS, { self: buffed(2, 80, SLOW) })).toBe(-2)
    expect(run(E.PASS_STATS_AND_STATUS, { self: buffed(2, 80) })).toBe(-2)
    expect(run(E.PASS_STATS_AND_STATUS)).toBe(-2)
  })

  it('비바라기: 물장구 특성이면 느릴 때 +1 · 체력 40% 미만 −1 · 다른 날씨면 +1 · 빗방울 +1', () => {
    expect(run(E.WEATHER_RAIN, { self: mon({ ability: AB.SWIFT_SWIM }) })).toBe(1)
    expect(run(E.WEATHER_RAIN, { self: mon({}, 30) })).toBe(-1)
    expect(run(E.WEATHER_RAIN, { turn: { weather: 'SunnyDay' } })).toBe(1)
    expect(run(E.WEATHER_RAIN, { self: mon({ ability: AB.RAIN_DISH }) })).toBe(1)
    expect(run(E.WEATHER_RAIN, { self: mon({ ability: AB.HYDRATION }) })).toBe(0)
    expect(run(E.WEATHER_RAIN, { self: mon({ ability: AB.HYDRATION, status: 'par' }) })).toBe(1)
  })

  it('싸라기눈: 다른 날씨에서 +1 · 눈보라를 알면 +2 · 얼음몸이면 +2 · 체력 40% 미만 −1', () => {
    const blizzard = [{ ...last(), id: MV.BLIZZARD, slot: 2 }]
    expect(run(E.WEATHER_HAIL, { turn: { weather: 'Sandstorm' } })).toBe(1)
    expect(run(E.WEATHER_HAIL, { turn: { weather: 'Sandstorm' }, mine: blizzard })).toBe(3)
    expect(run(E.WEATHER_HAIL, { turn: { weather: 'RainDance' }, self: mon({ ability: AB.ICE_BODY }) })).toBe(3)
    expect(run(E.WEATHER_HAIL, { self: mon({}, 30) })).toBe(-1)
    expect(run(E.WEATHER_HAIL)).toBe(0)
  })

  it('배북: 체력 90% 미만이면 −2', () => {
    expect(run(E.MAX_ATK_LOSE_HALF_MAX_HP)).toBe(0)
    expect(run(E.MAX_ATK_LOSE_HALF_MAX_HP, { self: mon({}, 80) })).toBe(-2)
  })

  it('자기암시: 상대가 올렸고 내가 깎였으면 +1 · 회피가 깎였으면 +2 · 아니면 −2', () => {
    const buffed = mon({ boosts: boosts({ atk: 3 }) })
    expect(run(E.COPY_STAT_CHANGES, { foe: buffed })).toBe(-2)
    expect(run(E.COPY_STAT_CHANGES, { foe: buffed, self: mon({ boosts: boosts({ atk: -1 }) }) })).toBe(1)
    expect(run(E.COPY_STAT_CHANGES, { foe: buffed, self: mon({ boosts: boosts({ evasion: -1 }) }) })).toBe(2)
    expect(run(E.COPY_STAT_CHANGES, { foe: buffed, random: 0.0 })).toBe(0)
    expect(run(E.COPY_STAT_CHANGES)).toBe(-2)
  })
})

describe('공격기 한 줄짜리', () => {
  const hit = (effect: number, o: Opts = {}) => run(effect, { ...o, move: { power: 80, category: 'physical', ...o.move } })
  const ghost = mon({ types: [TYPE.GHOST, TYPE.GHOST] })

  it('객기(원작 BUG: 상대 상태를 본다)', () => {
    expect(hit(E.DOUBLE_POWER_WHEN_STATUSED, { foe: mon({ status: 'brn' }) })).toBe(1)
    expect(hit(E.DOUBLE_POWER_WHEN_STATUSED, { self: mon({ status: 'brn' }) })).toBe(0)
  })

  it('병아리힘류(공격·방어가 깎이는 기술): 반감 −1 · 내 공격이 깎였으면 −1 · 빠르고 체력 40% 초과면 −1', () => {
    expect(hit(E.LOWER_OWN_ATK_AND_DEF, { foe: ghost })).toBe(-1)
    expect(hit(E.LOWER_OWN_ATK_AND_DEF, { self: mon({ boosts: boosts({ atk: -1 }) }) })).toBe(-1)
    expect(hit(E.LOWER_OWN_ATK_AND_DEF)).toBe(-1)
    expect(hit(E.LOWER_OWN_ATK_AND_DEF, { self: mon({}, 30) })).toBe(0)
    expect(hit(E.LOWER_OWN_ATK_AND_DEF, { self: mon({ stats: SLOW }, 50) })).toBe(0)
  })

  it('죽기살기: 상대 체력 70% 미만 −1 · 느리면 내 체력 50% 이하 +1 · 빠르면 40% 이하 +1', () => {
    expect(hit(E.SET_HP_EQUAL_TO_USER, { foe: mon({}, 60) })).toBe(-1)
    expect(hit(E.SET_HP_EQUAL_TO_USER, { self: mon({ stats: SLOW }, 50) })).toBe(1)
    expect(hit(E.SET_HP_EQUAL_TO_USER, { self: mon({}, 50) })).toBe(-1)
    expect(hit(E.SET_HP_EQUAL_TO_USER, { self: mon({}, 40) })).toBe(1)
  })

  it('해수스파우트(원작 BUG: 상대 체력): 느리면 상대 70% 이하 −1 · 아니면 50% 이하 −1', () => {
    expect(hit(E.DECREASE_POWER_WITH_LESS_USER_HP, { foe: mon({}, 60), self: mon({ stats: SLOW }) })).toBe(-1)
    expect(hit(E.DECREASE_POWER_WITH_LESS_USER_HP, { foe: mon({}, 60) })).toBe(0)
    expect(hit(E.DECREASE_POWER_WITH_LESS_USER_HP, { foe: ghost })).toBe(-1)
  })

  it('깨우기싸다귀 · 해머암 · 소금물', () => {
    expect(hit(E.DOUBLE_POWER_HEAL_SLEEP, { foe: mon({ status: 'slp' }) })).toBe(1)
    expect(hit(E.DOUBLE_POWER_HEAL_SLEEP, { foe: ghost })).toBe(-1)
    expect(hit(E.SPEED_DOWN_HIT, { self: mon({ stats: SLOW }) })).toBe(1)
    expect(hit(E.SPEED_DOWN_HIT, { foe: ghost })).toBe(-1)
    expect(hit(E.DOUBLE_POWER_WHEN_BELOW_HALF, { foe: mon({}, 40) })).toBe(2)
    expect(hit(E.DOUBLE_POWER_WHEN_BELOW_HALF, { foe: mon({}, 40), random: 0.0 })).toBe(1)
    expect(hit(E.DOUBLE_POWER_WHEN_BELOW_HALF)).toBe(0)
  })

  it('보복 · 확인사살 · 기습 · 마지막발악 · 쥐어짜기 · 벌주기', () => {
    expect(hit(E.DOUBLE_POWER_IF_MOVING_SECOND, { self: mon({ stats: SLOW }) })).toBe(1)
    expect(hit(E.DOUBLE_POWER_IF_MOVING_SECOND, { self: mon({ stats: FAST }) })).toBe(0)
    expect(hit(E.DOUBLE_POWER_IF_TARGET_HIT, { self: mon({ ability: AB.ROUGH_SKIN, stats: SLOW }) })).toBe(1)
    expect(hit(E.DOUBLE_POWER_IF_TARGET_HIT, { self: mon({ heldItem: IT.JABOCA_BERRY, stats: SLOW }) })).toBe(1)
    // 도구·특성이 없으면 50%로 한 번 더 굴린다 — 난수 하나로는 어느 쪽도 +1에 닿지 않는다
    expect(hit(E.DOUBLE_POWER_IF_TARGET_HIT, { self: mon({ stats: SLOW }) })).toBe(0)
    expect(hit(E.DOUBLE_POWER_IF_TARGET_HIT, { self: mon({ stats: SLOW }), random: 0.1 })).toBe(0)
    expect(hit(E.HIT_FIRST_IF_TARGET_ATTACKING)).toBe(1)
    expect(hit(E.HIT_FIRST_IF_TARGET_ATTACKING, { foe: ghost })).toBe(-1)
    expect(hit(E.FAIL_IF_NOT_USED_ALL_OTHER_MOVES, { turn: { lastResort: true } })).toBe(1)
    expect(hit(E.FAIL_IF_NOT_USED_ALL_OTHER_MOVES)).toBe(0)
    // 쥐어짜기: 상대가 가득이면 빠를 때 +2 · 느릴 때 +1, 거기에 90%로 +1
    expect(hit(E.INCREASE_POWER_WITH_MORE_HP, { self: mon({ stats: FAST }) })).toBe(3)
    expect(hit(E.INCREASE_POWER_WITH_MORE_HP, { self: mon({ stats: SLOW }) })).toBe(2)
    expect(hit(E.INCREASE_POWER_WITH_MORE_HP, { foe: mon({}, 90) })).toBe(1)
    expect(hit(E.INCREASE_POWER_WITH_MORE_HP, { foe: mon({}, 40) })).toBe(-1)
    // 벌주기: 올라간 단계 합이 7 초과면 줄마다 따로 굴려 4+3+2+1
    const stacked = mon({ boosts: boosts({ atk: 4, def: 3 }) })
    expect(hit(E.INCREASE_POWER_WITH_MORE_STAT_UP, { foe: stacked })).toBe(4 + 3 + 2 + 1)
    expect(hit(E.INCREASE_POWER_WITH_MORE_STAT_UP, { foe: stacked, random: 0.0 })).toBe(0)
    expect(hit(E.INCREASE_POWER_WITH_MORE_STAT_UP)).toBe(0)
  })

  it('쪼기 · 눈보라 · 비장의카드 · 내던지기', () => {
    expect(hit(E.EAT_BERRY, { turn: { turn: 0 } })).toBe(2)
    expect(hit(E.EAT_BERRY)).toBe(1)
    expect(hit(E.BLIZZARD, { foe: ghost })).toBe(-3)
    expect(hit(E.BLIZZARD, { foe: ghost, random: 0.1 })).toBe(0)
    expect(hit(E.BLIZZARD, { turn: { weather: 'Hail' } })).toBe(1)
    expect(hit(E.HIGHER_POWER_WHEN_LOW_PP, { move: { pp: 1 } })).toBe(3)
    expect(hit(E.HIGHER_POWER_WHEN_LOW_PP, { move: { pp: 2 } })).toBe(2)
    expect(hit(E.HIGHER_POWER_WHEN_LOW_PP, { move: { pp: 3 } })).toBe(1)
    expect(hit(E.HIGHER_POWER_WHEN_LOW_PP, { move: { pp: 8 }, foe: mon({ ability: AB.PRESSURE }) })).toBe(1)
    expect(hit(E.HIGHER_POWER_WHEN_LOW_PP, { move: { pp: 8 }, foe: mon({ boosts: boosts({ evasion: 5 }) }) })).toBe(2)
    expect(hit(E.HIGHER_POWER_WHEN_LOW_PP, { foe: ghost })).toBe(-1)
    const flung = (power: number, o: Opts = {}) =>
      hit(E.FLING, { self: mon({ flingPower: power, itemEffect: 0 }), ...o })
    expect(flung(10)).toBe(-2)
    expect(flung(70)).toBe(1)
    expect(flung(100)).toBe(0 + 1 + 1)
    expect(flung(50)).toBe(-1)
    expect(flung(50, { random: 0.0 })).toBe(0)
    expect(hit(E.FLING, { self: mon({ flingPower: 100 }), foe: mon({ types: [TYPE.GHOST, TYPE.GHOST] }) })).toBe(-1)
    expect(hit(E.FLING, { self: mon({ itemEffect: HE.PSN_USER }), foe: ghost })).toBe(0)
  })
})

describe('변화기 — 상태·날씨·장판', () => {
  it('입막음 50% +1 · 리프레시(상대 체력 50% 미만 −1) · 임프리즌(첫 턴 0 · 아니면 61%로 +2)', () => {
    expect(run(E.PREVENT_ITEM_USE)).toBe(1)
    expect(run(E.PREVENT_ITEM_USE, { random: 0.0 })).toBe(0)
    expect(run(E.HEAL_STATUS, { foe: mon({}, 40) })).toBe(-1)
    expect(run(E.HEAL_STATUS)).toBe(0)
    expect(run(E.MAKE_SHARED_MOVES_UNUSEABLE, { turn: { turn: 0 } })).toBe(0)
    expect(run(E.MAKE_SHARED_MOVES_UNUSEABLE)).toBe(2)
  })

  it('가로챔: 첫 턴 41%로 +2 · 느리고 상대 체력이 높으면 88%로 −2 · 빠르면 가득일 때만 67%로 −2', () => {
    expect(run(E.STEAL_STATUS_MOVE, { turn: { turn: 0 } })).toBe(2)
    expect(run(E.STEAL_STATUS_MOVE, { self: mon({ stats: SLOW }) })).toBe(-2)
    expect(run(E.STEAL_STATUS_MOVE, { self: mon({ stats: SLOW }), foe: mon({}, 20), knows: [E.RESTORE_HALF_HP] })).toBe(2)
    expect(run(E.STEAL_STATUS_MOVE, { self: mon({ stats: SLOW }), foe: mon({}, 20) })).toBe(1)
    expect(run(E.STEAL_STATUS_MOVE, { self: mon({ stats: FAST }) })).toBe(-2)
    expect(run(E.STEAL_STATUS_MOVE, { random: 0.1 })).toBe(0)
  })

  it('물놀이 · 진흙놀이: 체력이 낮거나 상대 타입이 안 맞으면 −1', () => {
    expect(run(E.HALVE_FIRE_DAMAGE, { foe: mon({ types: [TYPE.FIRE, TYPE.FIRE] }) })).toBe(1)
    expect(run(E.HALVE_FIRE_DAMAGE)).toBe(-1)
    expect(run(E.HALVE_FIRE_DAMAGE, { self: mon({}, 30), foe: mon({ types: [TYPE.FIRE, TYPE.FIRE] }) })).toBe(-1)
    expect(run(E.HALVE_ELECTRIC_DAMAGE, { foe: mon({ types: [TYPE.ELECTRIC, TYPE.ELECTRIC] }) })).toBe(1)
    expect(run(E.HALVE_ELECTRIC_DAMAGE)).toBe(-1)
  })

  it('중력: 떠 있는 상대면 75%로 +1 · 아니면 체력 60% 이상일 때 50%로 갈린다', () => {
    expect(run(E.GRAVITY, { foe: mon({ types: [TYPE.FLYING, TYPE.FLYING] }) })).toBe(1)
    expect(run(E.GRAVITY, { foe: mon({ ability: AB.LEVITATE }) })).toBe(1)
    expect(run(E.GRAVITY, { foe: mon({ volatiles: new Set(['magnetrise']) }) })).toBe(1)
    expect(run(E.GRAVITY)).toBe(0)
    expect(run(E.GRAVITY, { random: 0.0 })).toBe(0)
    expect(run(E.GRAVITY, { random: 0.4 })).toBe(1)
  })

  it('미라클아이: 악 타입이면 47%로 +2 · 상대 회피가 +3이면 69%로 +2 · 아니면 −2', () => {
    expect(run(E.IGNORE_EVATION_REMOVE_DARK_IMMUNE, { foe: mon({ types: [TYPE.DARK, TYPE.DARK] }) })).toBe(2)
    expect(run(E.IGNORE_EVATION_REMOVE_DARK_IMMUNE, { foe: mon({ boosts: boosts({ evasion: 3 }) }) })).toBe(2)
    expect(run(E.IGNORE_EVATION_REMOVE_DARK_IMMUNE)).toBe(-2)
  })

  it('페인트: 상대가 방어를 모르면 75%로 0 · 방어를 쓰면 연속 횟수에 따라 +1이 줄고 3회째부터 −2', () => {
    expect(run(E.REMOVE_PROTECT, { random: 0.0 })).toBe(0 + 0 + 0)
    expect(run(E.REMOVE_PROTECT, { knows: [E.PROTECT] })).toBe(1)
    expect(run(E.REMOVE_PROTECT, { knows: [E.PROTECT], turn: { foeProtectChain: 1 } })).toBe(1)
    expect(run(E.REMOVE_PROTECT, { knows: [E.PROTECT], turn: { foeProtectChain: 3 } })).toBe(-2)
    expect(run(E.REMOVE_PROTECT, { knows: [E.PROTECT], self: mon({ status: 'tox' }) })).toBe(2)
    // 정확히 2회는 어느 갈래에도 안 걸려 0회와 같게 흘러든다 (코드대로)
    expect(run(E.REMOVE_PROTECT, { knows: [E.PROTECT], turn: { foeProtectChain: 2 } })).toBe(1)
  })

  it('순풍: 25%로 0 · 내가 빠르면 −1 · 체력 30% 이하 −1 · 75% 초과 +1', () => {
    expect(run(E.DOUBLE_SPEED_3_TURNS, { random: 0.1 })).toBe(0)
    expect(run(E.DOUBLE_SPEED_3_TURNS, { self: mon({ stats: FAST }) })).toBe(-1)
    expect(run(E.DOUBLE_SPEED_3_TURNS, { self: mon({}, 30) })).toBe(-1)
    expect(run(E.DOUBLE_SPEED_3_TURNS)).toBe(1)
    expect(run(E.DOUBLE_SPEED_3_TURNS, { self: mon({}, 60) })).toBe(1)
  })

  it('메탈버스트: 자는 상대 −1 · 반격기를 아는 상대 −1 · 아니면 +1', () => {
    expect(run(E.METAL_BURST, { foe: mon({ status: 'slp' }) })).toBe(-1)
    expect(run(E.METAL_BURST, { knows: [E.DOUBLE_POWER_IF_HIT] })).toBe(-1)
    expect(run(E.METAL_BURST)).toBe(1)
    expect(run(E.METAL_BURST, { self: mon({}, 25) })).toBe(-1 - 1 + 1)
    const taunted = mon({ volatiles: new Set(['taunt']) })
    expect(run(E.METAL_BURST, { foe: taunted, foeLast: last() })).toBe(1 + 1 + 1)
  })

  it('회복봉인 · 행운의주문 · 위액', () => {
    expect(run(E.PREVENT_HEALING, { knows: [E.REST] })).toBe(1)
    expect(run(E.PREVENT_HEALING, { self: mon({ volatiles: new Set(['leechseed']) }) })).toBe(1)
    expect(run(E.PREVENT_HEALING, { random: 0.3 })).toBe(1)
    expect(run(E.PREVENT_HEALING, { random: 0.5 })).toBe(0)
    expect(run(E.PREVENT_HEALING)).toBe(0)
    expect(run(E.PREVENT_CRITS, { self: mon({}, 60) })).toBe(-1)
    expect(run(E.PREVENT_CRITS, { knows: [E.HIGH_CRITICAL] })).toBe(1)
    expect(run(E.PREVENT_CRITS)).toBe(1)
    expect(run(E.PREVENT_CRITS, { random: 0.0 })).toBe(0)
    expect(run(E.SUPRESS_ABILITY)).toBe(1)
    expect(run(E.SUPRESS_ABILITY, { random: 0.1 })).toBe(0)
    expect(run(E.SUPRESS_ABILITY, { foe: mon({}, 20) })).toBe(1 - 1 - 1 - 1)
  })

  it('파워스왑 · 가드스왑: 단계 차이로 시작 줄을 고르고 줄마다 50%', () => {
    const foeUp = (atk: number, spa: number) => mon({ boosts: boosts({ atk, spa }) })
    expect(run(E.SWAP_ATK_SP_ATK_STAT_CHANGES, { foe: foeUp(4, 4) })).toBe(5)
    expect(run(E.SWAP_ATK_SP_ATK_STAT_CHANGES, { foe: foeUp(4, 4), random: 0.0 })).toBe(0)
    expect(run(E.SWAP_ATK_SP_ATK_STAT_CHANGES, { foe: foeUp(4, 0) })).toBe(3)
    expect(run(E.SWAP_ATK_SP_ATK_STAT_CHANGES, { foe: foeUp(2, 2) })).toBe(3)
    expect(run(E.SWAP_ATK_SP_ATK_STAT_CHANGES, { foe: foeUp(1, 0) })).toBe(1)
    expect(run(E.SWAP_ATK_SP_ATK_STAT_CHANGES, { foe: foeUp(0, 1) })).toBe(1)
    expect(run(E.SWAP_ATK_SP_ATK_STAT_CHANGES, { foe: foeUp(-1, 5) })).toBe(0)
    expect(run(E.SWAP_ATK_SP_ATK_STAT_CHANGES, { foe: foeUp(4, 1) })).toBe(0)
    const guard = mon({ boosts: boosts({ def: 2, spd: 2 }) })
    expect(run(E.SWAP_DEF_SP_DEF_STAT_CHANGES, { foe: guard })).toBe(3)
  })

  it('불면증씨 · 독압정류 · 아쿠아링 · 자기부상', () => {
    expect(run(E.SET_ABILITY_TO_INSOMNIA, { knownIds: [MV.REST] })).toBe(3)
    expect(run(E.SET_ABILITY_TO_INSOMNIA)).toBe(2)
    expect(run(E.SET_SPIKES)).toBe(1)
    expect(run(E.SET_SPIKES, { random: 0.1 })).toBe(0)
    const roar = [{ ...last(), id: MV.ROAR, slot: 2 }]
    expect(run(E.TOXIC_SPIKES, { mine: roar })).toBe(2)
    expect(run(E.STEALTH_ROCK, { mine: roar, random: 0.99 })).toBe(2)
    expect(run(E.RESTORE_HP_EVERY_TURN)).toBe(1)
    expect(run(E.RESTORE_HP_EVERY_TURN, { self: mon({}, 20) })).toBe(0)
    expect(run(E.GIVE_GROUND_IMMUNITY, { knownIds: [MV.EARTHQUAKE] })).toBe(2)
    expect(run(E.GIVE_GROUND_IMMUNITY, { self: mon({}, 40), knownIds: [MV.EARTHQUAKE] })).toBe(0)
    expect(run(E.GIVE_GROUND_IMMUNITY, { foe: mon({ types: [TYPE.GROUND, TYPE.GROUND] }) })).toBe(1)
  })

  it('유혹 · 치유의소원 · 토해내기', () => {
    expect(run(E.SP_ATK_DOWN_2_OPPOSITE_GENDER)).toBe(0 + 0 + -1)
    expect(run(E.SP_ATK_DOWN_2_OPPOSITE_GENDER, { foeLast: last({ category: 'special' }) })).toBe(0)
    const boosted = mon({ boosts: boosts({ spa: 1 }) })
    expect(run(E.SP_ATK_DOWN_2_OPPOSITE_GENDER, { foe: boosted, foeLast: last({ category: 'special' }) })).toBe(-1)
    expect(run(E.FAINT_AND_FULL_HEAL_NEXT_MON, { self: mon({}, 90), random: 0.99 })).toBe(-5)
    expect(run(E.FAINT_AND_FULL_HEAL_NEXT_MON, { self: mon({}, 90), random: 0.1 })).toBe(0)
    expect(run(E.FAINT_AND_FULL_HEAL_NEXT_MON, { self: mon({}, 60) })).toBe(-1)
    expect(run(E.FAINT_AND_FULL_HEAL_NEXT_MON, { self: mon({}, 40) })).toBe(1 + 1)
    expect(run(E.FAINT_AND_FULL_HEAL_NEXT_MON, { self: mon({}, 20) })).toBe(1 + 1 + 1)
    expect(run(E.FAINT_FULL_RESTORE_NEXT_MON, { self: mon({}, 40), turn: { partyDealsMore: () => true } })).toBe(3)
    expect(run(E.SPIT_UP, { self: mon({ volatiles: new Set(['stockpile2']) }) })).toBe(2)
    expect(run(E.SPIT_UP, { self: mon({ volatiles: new Set(['stockpile1']) }) })).toBe(0)
  })
})

describe('변신 · 명중 · 필살 · 잠꼬대 · 초집중류', () => {
  it('변신: 체력 90% 이하 −2 · 한 판 첫 턴이 아니면 78%로 −2 더', () => {
    expect(run(E.CONVERSION, { turn: { turnCount: 0 } })).toBe(0)
    // `IfRandomLessThan 200, ScoreMinus2` — 난수가 문턱 **아래**일 때 −2다
    expect(run(E.CONVERSION, { turn: { turnCount: 2 }, random: 0.5 })).toBe(-2)
    expect(run(E.CONVERSION, { turn: { turnCount: 2 } })).toBe(0)
    expect(run(E.CONVERSION, { self: mon({}, 80), turn: { turnCount: 2 }, random: 0.5 })).toBe(-4)
  })

  it('명중 올리기: +3 이상이면 80%로 −2 · 체력 70% 이하면 −2', () => {
    expect(run(E.ACC_UP)).toBe(0)
    expect(run(E.ACC_UP, { self: mon({ boosts: boosts({ accuracy: 3 }) }) })).toBe(-2)
    expect(run(E.ACC_UP_2, { self: mon({}, 60) })).toBe(-2)
  })

  it('필살의일격 · 잠꼬대', () => {
    expect(run(E.PRIORITY_NEG_1_BYPASS_ACCURACY, { self: mon({ stats: SLOW }) })).toBe(0)
    expect(run(E.PRIORITY_NEG_1_BYPASS_ACCURACY)).toBe(0)
    expect(run(E.PRIORITY_NEG_1_BYPASS_ACCURACY, { self: mon({}, 30) })).toBe(-1)
    expect(run(E.PRIORITY_NEG_1_BYPASS_ACCURACY, { self: mon({}, 50) })).toBe(-1)
    expect(run(E.PRIORITY_NEG_1_BYPASS_ACCURACY, { self: mon({}, 50), random: 0.5 })).toBe(0)
    expect(run(E.USE_RANDOM_LEARNED_MOVE_SLEEP, { self: mon({ status: 'slp' }) })).toBe(10)
    expect(run(E.USE_RANDOM_LEARNED_MOVE_SLEEP)).toBe(-5)
  })

  it('기합펀치 · 코고는소리 · 마법코트 · 재활용 · 탁쳐서떨구기', () => {
    const punch = (o: Opts = {}) => run(E.HIT_LAST_WHIFF_IF_HIT, { ...o, move: { power: 150, category: 'physical' } })
    expect(punch({ self: mon({ volatiles: new Set(['substitute']) }) })).toBe(5)
    expect(punch({ foe: mon({ status: 'slp' }) })).toBe(1)
    expect(punch({ foe: mon({ volatiles: new Set(['confusion']) }) })).toBe(1)
    expect(punch({ turn: { turn: 0 } })).toBe(0)
    expect(punch()).toBe(1)
    expect(punch({ foe: mon({ types: [TYPE.GHOST, TYPE.GHOST] }) })).toBe(-1)
    expect(run(E.DOUBLE_POWER_AND_CURE_PARALYSIS, { foe: mon({ status: 'par' }) })).toBe(1)
    expect(run(E.APPLY_MAGIC_COAT, { turn: { turn: 0 } })).toBe(1)
    expect(run(E.APPLY_MAGIC_COAT)).toBe(-1)
    expect(run(E.RECYCLE)).toBe(-2)
    expect(run(E.RECYCLE, { turn: { recycleItem: IT.LUM_BERRY } })).toBe(1)
    expect(run(E.REMOVE_HELD_ITEM)).toBe(1)
    expect(run(E.REMOVE_HELD_ITEM, { turn: { turn: 0 } })).toBe(0)
  })

  it('사이코시프트 · 파워트릭 · 선수필승 · 따라하기 · 하트스왑', () => {
    expect(run(E.TRANSFER_STATUS)).toBe(-10)
    expect(run(E.TRANSFER_STATUS, { self: mon({ status: 'par' }) })).toBe(1)
    expect(run(E.SWAP_ATK_DEF)).toBe(1)
    expect(run(E.SWAP_ATK_DEF, { self: mon({}, 20) })).toBe(-2)
    expect(run(E.USE_MOVE_FIRST, { self: mon({ stats: SLOW }) })).toBe(-2)
    expect(run(E.USE_MOVE_FIRST)).toBe(2)
    expect(run(E.USE_MOVE_FIRST, { foeLast: last({ power: 0, category: 'status' }) })).toBe(1)
    const strongLast = last({ power: 250, type: TYPE.NORMAL })
    expect(run(E.USE_LAST_USED_MOVE, { self: mon({ stats: FAST }), foeLast: last({ id: MV.SPORE, power: 0, category: 'status' }) })).toBe(2)
    expect(run(E.USE_LAST_USED_MOVE, { self: mon({ stats: SLOW }), foeLast: strongLast })).toBe(0)
    expect(run(E.USE_LAST_USED_MOVE, { self: mon({ stats: SLOW }) })).toBe(-1)
    expect(run(E.SWAP_STAT_CHANGES)).toBe(-2)
    expect(run(E.SWAP_STAT_CHANGES, { foe: mon({ boosts: boosts({ atk: 2 }) }) })).toBe(1)
    expect(run(E.SWAP_STAT_CHANGES, { foe: mon({ boosts: boosts({ atk: 2 }) }), self: mon({ boosts: boosts({ evasion: -1 }) }) })).toBe(2)
  })

  it('고속스핀 · 트릭룸(싱글)', () => {
    expect(run(E.REMOVE_HAZARDS_SCREENS_EVA_DOWN)).toBe(0)
    expect(run(E.REMOVE_HAZARDS_SCREENS_EVA_DOWN, { foe: mon({ side: new Map([['reflect', 1]]) }) })).toBe(1)
    expect(run(E.REMOVE_HAZARDS_SCREENS_EVA_DOWN, { foe: mon({ side: new Map([['spikes', 1]]) }) })).toBe(-2)
    expect(run(E.REMOVE_HAZARDS_SCREENS_EVA_DOWN, { foe: mon({ side: new Map([['spikes', 1]]) }, 60) })).toBe(-4)
    expect(run(E.TRICK_ROOM)).toBe(-1)
    expect(run(E.TRICK_ROOM, { self: mon({ stats: SLOW }) })).toBe(3)
    expect(run(E.TRICK_ROOM, { self: mon({ stats: SLOW }), random: 0.1 })).toBe(0)
  })
})

describe('트릭 · 특성 바꾸기', () => {
  const choice = mon({ itemEffect: HE.CHOICE_SPEED })
  it('내가 짐을 쥐고 있으면 상대가 짐을 안 쥔 한 +5 · 쥐고 있으면 −3', () => {
    expect(run(E.SWITCH_HELD_ITEMS, { self: choice })).toBe(5)
    expect(run(E.SWITCH_HELD_ITEMS, { self: choice, foe: mon({ itemEffect: HE.CHOICE_ATK }) })).toBe(-3)
    expect(run(E.SWITCH_HELD_ITEMS)).toBe(-3)
  })

  it('독구슬: 상대가 독에 안 걸리고 나도 괜찮으면 +5 — 둘 다 걸리면 −3', () => {
    const orb = mon({ itemEffect: HE.PSN_USER })
    expect(run(E.SWITCH_HELD_ITEMS, { self: orb })).toBe(5)
    expect(run(E.SWITCH_HELD_ITEMS, { self: orb, foe: mon({ status: 'brn' }) })).toBe(5)
    expect(run(E.SWITCH_HELD_ITEMS, { self: mon({ itemEffect: HE.PSN_USER, status: 'brn' }), foe: mon({ status: 'brn' }) })).toBe(-3)
    expect(run(E.SWITCH_HELD_ITEMS, { self: orb, foe: mon({ itemEffect: HE.PSN_USER }) })).toBe(-3)
  })

  it('화염구슬 · 검은진흙 · 맛 열매', () => {
    const orb = mon({ itemEffect: HE.BRN_USER })
    expect(run(E.SWITCH_HELD_ITEMS, { self: orb })).toBe(5)
    expect(run(E.SWITCH_HELD_ITEMS, { self: mon({ itemEffect: HE.BRN_USER, ability: AB.KLUTZ }), foe: mon({ status: 'brn' }) })).toBe(-5)
    const sludge = mon({ itemEffect: HE.HP_RESTORE_PSN_TYPE })
    expect(run(E.SWITCH_HELD_ITEMS, { self: sludge })).toBe(5)
    expect(run(E.SWITCH_HELD_ITEMS, { self: sludge, foe: mon({ types: [TYPE.POISON, TYPE.POISON] }) })).toBe(5)
    expect(run(E.SWITCH_HELD_ITEMS, { self: mon({ itemEffect: HE.HP_RESTORE_SWEET }) })).toBe(2)
    expect(run(E.SWITCH_HELD_ITEMS, { self: mon({ itemEffect: HE.HP_RESTORE_SWEET }), foe: mon({ itemEffect: HE.HP_RESTORE_DRY }) })).toBe(-3)
  })

  it('특성 가로채기·바꾸기: 제 특성이 탐나면 −1 · 상대 것이 탐나면 80%로 +2', () => {
    expect(run(E.COPY_ABILITY, { self: mon({ ability: AB.HUGE_POWER }) })).toBe(-1)
    expect(run(E.COPY_ABILITY, { foe: mon({ ability: AB.HUGE_POWER }) })).toBe(2)
    expect(run(E.SWITCH_ABILITIES, { foe: mon({ ability: AB.HUGE_POWER }), random: 0.1 })).toBe(0)
    expect(run(E.SWITCH_ABILITIES)).toBe(-1)
  })
})

describe('하늘·땅속 기술 · 되돌아온 효과들', () => {
  it('방어를 모르는 상대엔 +1로 끝(반감이어도) · 방어를 알면 −1 · 파워허브 +2', () => {
    const fly = (o: Opts = {}) => run(E.BOUNCE, { ...o, move: { power: 85, category: 'physical' } })
    expect(fly({ knows: [E.PROTECT] })).toBe(-1)
    expect(fly({ self: mon({ heldItem: IT.POWER_HERB }) })).toBe(2)
    expect(fly({ foe: mon({ types: [TYPE.GHOST, TYPE.GHOST] }) })).toBe(1)
    expect(fly()).toBe(1)
    expect(fly({ foe: mon({ status: 'tox' }) })).toBe(1)
    expect(fly({ random: 0.1 })).toBe(0)
    expect(fly({ self: mon({ stats: SLOW }) })).toBe(0)
    expect(fly({ self: mon({ types: [TYPE.ROCK, TYPE.ROCK] }), turn: { weather: 'Sandstorm' }, random: 0.99 })).toBe(1)
  })

  it('그림자꿈: 반감이면 +1 · 파워허브면 +1 · 방어를 알아도 안 본다', () => {
    const shadow = (o: Opts = {}) => run(E.SHADOW_FORCE, { ...o, move: { power: 120, category: 'physical' } })
    expect(shadow({ knows: [E.PROTECT] })).toBe(1)
    expect(shadow({ foe: mon({ types: [TYPE.GHOST, TYPE.GHOST] }) })).toBe(1)
    expect(shadow({ self: mon({ heldItem: IT.POWER_HERB }) })).toBe(1)
  })

  it('광합성: 회복기에 비·모래·싸라기눈이면 −2 더', () => {
    // 체력 가득이면 회복기 자체가 −3이다
    expect(run(E.HEAL_HALF_MORE_IN_SUN)).toBe(-3)
    expect(run(E.HEAL_HALF_MORE_IN_SUN, { turn: { weather: 'RainDance' } })).toBe(-5)
    expect(run(E.UNUSED_133, { turn: { weather: 'Hail' } })).toBe(-5)
    expect(run(E.RESTORE_HALF_HP, { turn: { weather: 'Hail' } })).toBe(-3)
  })

  it('삼키기 = 회복기 · 회복기는 상대가 가로챔을 알면 먼저 56%로 건너뛴다', () => {
    const slow = mon({ stats: SLOW }, 50)
    expect(run(E.SWALLOW, { self: slow })).toBe(2)
    expect(run(E.SWALLOW, { self: slow, knows: [E.STEAL_STATUS_MOVE], random: 0.5 })).toBe(2)
    expect(run(E.SWALLOW, { self: slow, knows: [E.STEAL_STATUS_MOVE], random: 0.3 })).toBe(0)
  })

  it('죽음의 대폭발류(메멘토)는 자폭 루틴 · 불·독 급소기는 급소 루틴', () => {
    const memento = run(E.FAINT_AND_ATK_SP_ATK_DOWN_2, { self: mon({}, 40), random: 0.99 })
    const boom = run(EFFECT.HALVE_DEFENSE, { self: mon({}, 40), random: 0.99 })
    expect(memento).toBe(boom)
    const crit = (effect: number) => run(effect, { move: { power: 70, category: 'physical' }, random: 0.99 })
    expect(crit(E.HIGH_CRITICAL_BURN_HIT)).toBe(crit(E.HIGH_CRITICAL))
    expect(crit(E.HIGH_CRITICAL_POISON_HIT)).toBe(crit(E.HIGH_CRITICAL))
  })
})

describe('앞서 옮긴 루틴을 스크립트와 다시 맞댄 것', () => {
  const hit = (effect: number, o: Opts = {}) =>
    run(effect, { ...o, move: { power: 80, category: 'physical', ...o.move } })

  it('필중기: 회피 +5·명중 −5 이상이면 +1에 +3 갈래의 굴림이 흘러든다', () => {
    const evasive = mon({ boosts: boosts({ evasion: 5 }) })
    expect(run(EFFECT.BYPASS_ACCURACY, { foe: evasive })).toBe(2)
    expect(run(EFFECT.BYPASS_ACCURACY, { foe: evasive, random: 0.1 })).toBe(1)
    expect(run(EFFECT.BYPASS_ACCURACY, { foe: mon({ boosts: boosts({ evasion: 3 }) }) })).toBe(1)
  })

  it('반동기: 돌머리도 +1 · 반동 없는 파괴광선: 게으름이면 76%로 +1', () => {
    expect(hit(EFFECT.RECOIL_QUARTER, { self: mon({ ability: AB.ROCK_HEAD }) })).toBe(1)
    expect(hit(EFFECT.RECHARGE_AFTER, { self: mon({ ability: 54 }) })).toBe(1)
    expect(hit(EFFECT.RECHARGE_AFTER, { self: mon({ ability: 54 }), random: 0.1 })).toBe(0)
  })

  it('쾌청: 플라워기프트 +1 · 스피드 깎기에는 내 체력 조건이 없다', () => {
    expect(run(EFFECT.WEATHER_SUN, { self: mon({ ability: 122 }) })).toBe(1)
    expect(run(EFFECT.SPEED_DOWN, { self: mon({ stats: SLOW }, 50), random: 0.99 })).toBe(2)
    expect(run(EFFECT.SPEED_DOWN)).toBe(-3)
  })

  it('잠자기: 상대가 가로챔을 알면 먼저 20%를 건너뛴다', () => {
    const hurt = mon({ stats: SLOW }, 30)
    expect(run(EFFECT.REST, { self: hurt })).toBe(3)
    expect(run(EFFECT.REST, { self: hurt, knows: [E.STEAL_STATUS_MOVE], random: 0.1 })).toBe(0)
  })

  it('유턴: 내가 **더 빠를 때만** 속도 몫 +1이 확정이다 — 같으면 50%', () => {
    const base = { move: { power: 70, category: 'physical' as const }, turn: { partyDealsMore: () => true } }
    // 난수 0.1이면 체력 몫은 전부 건너뛰고 속도 갈래만 남는다
    expect(run(SWITCH_HIT, { ...base, self: mon({ stats: FAST }), random: 0.1 })).toBe(1)
    expect(run(SWITCH_HIT, { ...base, random: 0.1 })).toBe(0)
  })

  it('유턴: 후발에 더 센 마리가 없으면 75%로 −2를 얹고 끝낸다', () => {
    const none = { move: { power: 70, category: 'physical' as const }, turn: { partyDealsMore: () => false } }
    expect(run(SWITCH_HIT, { ...none })).toBe(-2)
    expect(run(SWITCH_HIT, { ...none, random: 0.1 })).toBe(0)
  })

  it('저주: 자이로볼·트릭룸이 있으면 두 굴림이 따로 쌓인다', () => {
    const trickRoom = [{ ...last(), effect: EFFECT.TRICK_ROOM, slot: 2 }]
    expect(run(EFFECT.CURSE, { mine: trickRoom })).toBe(2 + 1 + 1)
    expect(run(EFFECT.CURSE)).toBe(1 + 1 + 1)
  })

  it('방어: 페인트를 아는 상대 −2 · 연속 2회 넘으면 −2 · 록온에는 감점이 없다', () => {
    expect(run(EFFECT.PROTECT, { knownIds: [364] })).toBe(-3)
    expect(run(EFFECT.PROTECT, { turn: { protectChain: 2 } })).toBe(-2)
    expect(run(EFFECT.PROTECT, { self: mon({ status: 'tox' }) })).toBe(-2)
    expect(run(EFFECT.PROTECT, { self: mon({ status: 'tox' }), turn: { lockedOnto: true } })).toBe(0)
    expect(run(EFFECT.PROTECT, { knows: [E.RESTORE_HALF_HP] })).toBe(-2)
  })

  it('방어: 85/256 아래의 난수에서 +2 · 아니면 50%로 −1만 남는다', () => {
    expect(run(EFFECT.PROTECT, { random: 0.0 })).toBe(2)
    expect(run(EFFECT.PROTECT)).toBe(-1)
  })
})
