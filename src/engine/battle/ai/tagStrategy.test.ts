// AI_FLAG_TAG_STRATEGY (REPAIR §121 · `trainer_ai/script.s` 6634~7691)
//
// 재는 것은 「그 상황에서 그 폭만큼 움직이는가」다. 상황은 실제 종족·기술 데이터로
// 만들고, 특성·타입만 갈라 본다. 난수는 상수 함수로 박는다 — `IfRandomLessThan n`은
// `floor(r × 256) < n`이면 분기한다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { moveFileSchema, speciesFileSchema, type Move, type Species } from '../../../data/schema'
import { computeStats } from '../../pokemon/stats'
import { noBoosts } from '../view'
import type { AiDoubles, AiMon, AiMove, AiTurn } from './context'
import { trainerPolicy } from './policy'
import { ABILITY } from './rom'
import { AI_FLAG, BASE_SCORE, scoreMoves } from './score'
import { speedRank, type SpeedMon } from './speed'
import { scoreTagStrategy } from './tagStrategy'
import { TYPE } from './typeChart'

const DATA = resolve(__dirname, '../../../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8')) as unknown
const speciesById = new Map<number, Species>(
  speciesFileSchema.parse(read('species.json')).species.map((s) => [s.id, s]),
)
const movesById = new Map<number, Move>(
  moveFileSchema.parse(read('moves.json')).moves.map((m) => [m.id, m]),
)

// 기술 번호 (`generated/moves.txt`)
const TACKLE = 33
const WATER_GUN = 55
const SURF = 57
const EARTHQUAKE = 89
const THUNDERBOLT = 85
const HELPING_HAND = 270
const DISCHARGE = 435
const LAVA_PLUME = 436
const WILL_O_WISP = 261
const TRICK_ROOM = 433
const SWORDS_DANCE = 14

function mon(id: number, patch: Partial<AiMon> = {}): AiMon {
  const sp = speciesById.get(id)!
  const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  const stats = computeStats({ base: sp.stats, ivs: zero, evs: zero, level: 40, nature: 0, speciesId: sp.id })
  return {
    species: sp.id, types: sp.types, level: 40, hp: stats.hp, maxHp: stats.hp, status: 'ok',
    boosts: noBoosts(), ability: sp.abilities[0], stats, heldItem: 0, itemEffect: 0, itemParam: 0,
    naturalGiftPower: 0, naturalGiftType: -1, weightHg: sp.weightHg, gender: 'male', bench: 1,
    volatiles: new Set(), side: new Map(), ...patch,
  }
}

function moves(...ids: number[]): AiMove[] {
  return ids.map((id, i) => {
    const d = movesById.get(id)!
    return {
      slot: i + 1, id, effect: d.effect, power: d.power, type: d.type, category: d.category,
      accuracy: d.accuracy, priority: d.priority,
    }
  })
}

/** 비버니(노말) · 찌르꼬(노말/비행) · 꼬부기 … 필요한 것은 타입을 덮어 쓴다 */
const BIDOOF = 399
const always = (r: number) => () => r

function turn(
  opts: {
    self?: AiMon; foe?: AiMon; moves: AiMove[]; ally?: AiMon | null; foeAlly?: AiMon | null
    allyMoves?: AiMove[]; targetIsAlly?: boolean; rank?: Partial<Record<'self' | 'ally', number>>
    random?: number
  },
): AiTurn {
  const ally = opts.ally === undefined ? mon(BIDOOF) : opts.ally
  const doubles: AiDoubles = {
    targetIsAlly: opts.targetIsAlly === true,
    target: opts.targetIsAlly === true ? -2 : 1,
    defenderOnPlayerSide: opts.targetIsAlly !== true,
    ally,
    allyMoves: opts.allyMoves ?? [],
    foeAlly: opts.foeAlly === undefined ? mon(BIDOOF) : opts.foeAlly,
    speedRank: (who) => opts.rank?.[who] ?? (who === 'self' ? 0 : 1),
  }
  return {
    self: opts.self ?? mon(BIDOOF),
    foe: opts.targetIsAlly === true ? (ally ?? mon(BIDOOF)) : (opts.foe ?? mon(BIDOOF)),
    moves: opts.moves, all: opts.moves, weather: null, field: new Set(), turn: 1,
    foeKnownMoves: new Set(), foeLastMoveCategory: null, protectChain: 0,
    random: always(opts.random ?? 0.99), doubles,
  }
}

const one = (t: AiTurn): number => scoreTagStrategy(t, t.moves[0]!)

describe('상대를 겨눈 벌 — 짝까지 맞는 기술', () => {
  it('지진: 떠 있는 짝 +2 · 약점 짝 −10 · 그 밖 −3 (`TagStrategy_Earthquake`)', () => {
    // `damageHead`의 확률 +1은 난수 0.99로 막는다 — 분기(`below`)가 안 서면 +1이다.
    // 그래서 지진 한 칸만 있으면 「제일 센 수」라 +1이 붙는다: 기대값에 1을 더한다
    const base = { moves: moves(EARTHQUAKE), random: 0.0 }
    expect(one(turn({ ...base, ally: mon(BIDOOF, { types: [TYPE.NORMAL, TYPE.FLYING] }) }))).toBe(2)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { types: [TYPE.FIRE, TYPE.FIRE] }) }))).toBe(-10)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { ability: ABILITY.LEVITATE }) }))).toBe(2)
    expect(one(turn({ ...base, ally: mon(BIDOOF) }))).toBe(-3)
  })

  it('파도타기: 짝이 저수면 +3, 땅이면 −10, 바위는 안 본다 (원작 BUG 그대로)', () => {
    const base = { moves: moves(SURF), random: 0.0 }
    expect(one(turn({ ...base, ally: mon(BIDOOF, { ability: ABILITY.WATER_ABSORB }) }))).toBe(3)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { types: [TYPE.GROUND, TYPE.GROUND] }) }))).toBe(-10)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { types: [TYPE.ROCK, TYPE.ROCK] }) }))).toBe(-3)
  })

  it('방전: 물·비행 검사가 땅보다 먼저라 물/땅 짝은 −10이다 (원작 BUG 그대로)', () => {
    const base = { moves: moves(DISCHARGE), random: 0.0 }
    expect(one(turn({ ...base, ally: mon(BIDOOF, { types: [TYPE.GROUND, TYPE.GROUND] }) }))).toBe(3)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { types: [TYPE.WATER, TYPE.GROUND] }) }))).toBe(-10)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { ability: ABILITY.MOTOR_DRIVE }) }))).toBe(3)
  })

  it('분연: 짝이 건조피부면 −3이다 — 주석은 +3이지만 코드는 `ScoreMinus3`', () => {
    const base = { moves: moves(LAVA_PLUME), random: 0.0 }
    expect(one(turn({ ...base, ally: mon(BIDOOF, { ability: ABILITY.DRY_SKIN }) }))).toBe(-3)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { ability: ABILITY.FLASH_FIRE }) }))).toBe(3)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { types: [TYPE.GRASS, TYPE.GRASS] }) }))).toBe(-10)
  })

  it('맞는 쪽의 짝이 피뢰침이면 −1, 그 짝이 땅 타입이기까지 하면 −8 더', () => {
    // 난수 0 — 「제일 센 수」의 50% +1이 건너뛰어져 머리 몫은 0이다
    const base = { moves: moves(THUNDERBOLT), random: 0.0 }
    expect(one(turn(base))).toBe(0)
    const rod = { ability: ABILITY.LIGHTNING_ROD }
    expect(one(turn({ ...base, foeAlly: mon(BIDOOF, rod) }))).toBe(-1)
    expect(one(turn({ ...base, foeAlly: mon(BIDOOF, { ...rod, types: [TYPE.GROUND, TYPE.GROUND] }) })))
      .toBe(-9)
  })

  it('맞는 쪽의 특성은 **찍지 않는다** — 후보에 피뢰침이 있어도 모르면 안 깎는다', () => {
    const base = { moves: moves(THUNDERBOLT), random: 0.0 }
    const unknown = mon(BIDOOF, { ability: ABILITY.LIGHTNING_ROD, hasAbility: () => false })
    expect(one(turn({ ...base, foeAlly: unknown }))).toBe(0)
  })

  it('반감 −1은 맞는 쪽의 짝이 없으면(0%) 안 붙는다', () => {
    // 몸통박치기 → 바위 타입: 반감. 난수 0.3(=76)이면 75%의 −1은 붙고(64 이상)
    // 「제일 센 수」의 50% +1은 건너뛴다(128 미만)
    const rock = mon(BIDOOF, { types: [TYPE.ROCK, TYPE.ROCK] })
    const base = { moves: moves(TACKLE), foe: rock, random: 0.3 }
    expect(one(turn(base))).toBe(-1)
    expect(one(turn({ ...base, foeAlly: null }))).toBe(0)
  })

  it('짝이 도우미를 가졌으면 데미지 기술 +1 — 짝이 쓰러졌으면 없다', () => {
    const base = { moves: moves(TACKLE), random: 0.0, allyMoves: moves(HELPING_HAND) }
    expect(one(turn(base))).toBe(1)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { hp: 0 }) }))).toBe(0)
  })

  it('트릭룸: 우리 둘이 3·4번째로 움직이면 75%로 +5, 제일 빠르면 −30', () => {
    const base = { moves: moves(TRICK_ROOM), random: 0.99 }
    expect(one(turn({ ...base, rank: { self: 2, ally: 3 } }))).toBe(5)
    expect(one(turn({ ...base, rank: { self: 2, ally: 3 }, random: 0.0 }))).toBe(-5)
    expect(one(turn({ ...base, rank: { self: 0, ally: 1 } }))).toBe(-30)
    expect(one(turn({ ...base, foeAlly: null }))).toBe(-30)
  })
})

describe('짝을 겨눈 벌 (`TagStrategy_Partner`)', () => {
  it('때리는 기술은 −30 — 흡수할 특성이 없으면 짝을 안 친다', () => {
    expect(one(turn({ moves: moves(TACKLE), targetIsAlly: true }))).toBe(-30)
    expect(one(turn({ moves: moves(SWORDS_DANCE), targetIsAlly: true }))).toBe(-30)
  })

  it('저수 짝에게 물: 가득이면 −10, 절반 아래면 75%로 +3', () => {
    const full = mon(BIDOOF, { ability: ABILITY.WATER_ABSORB })
    expect(one(turn({ moves: moves(WATER_GUN), targetIsAlly: true, ally: full }))).toBe(-10)
    const low = mon(BIDOOF, { ability: ABILITY.WATER_ABSORB, hp: 10 })
    expect(one(turn({ moves: moves(WATER_GUN), targetIsAlly: true, ally: low, random: 0.5 }))).toBe(3)
    expect(one(turn({ moves: moves(WATER_GUN), targetIsAlly: true, ally: low, random: 0.99 }))).toBe(0)
  })

  it('도우미: 짝 체력 50% 초과면 75%로 +2, 25%로 −1', () => {
    expect(one(turn({ moves: moves(HELPING_HAND), targetIsAlly: true, random: 0.99 }))).toBe(2)
    expect(one(turn({ moves: moves(HELPING_HAND), targetIsAlly: true, random: 0.0 }))).toBe(-1)
  })

  it('도깨비불: 근성 짝이 멀쩡할 때만 +5', () => {
    const guts = mon(BIDOOF, { ability: ABILITY.GUTS })
    expect(one(turn({ moves: moves(WILL_O_WISP), targetIsAlly: true, ally: guts }))).toBe(5)
    expect(one(turn({ moves: moves(WILL_O_WISP), targetIsAlly: true }))).toBe(-30)
  })

  it('⚠️ 짝을 겨눈 벌에는 TAG_STRATEGY 말고 아무 루틴도 안 돈다 (`IfTargetIsPartner Terminate`)', () => {
    const t = turn({ moves: moves(HELPING_HAND), targetIsAlly: true, random: 0.99 })
    const all = AI_FLAG.BASIC | AI_FLAG.EVAL_ATTACK | AI_FLAG.SETUP_FIRST_TURN | AI_FLAG.PRIORITIZE_EXTREMES
    expect(scoreMoves(t, all)[0]!.score).toBe(BASE_SCORE)
    expect(scoreMoves(t, all | AI_FLAG.TAG_STRATEGY)[0]!.score).toBe(BASE_SCORE + 2)
  })
})

describe('더블의 고르기 (`TrainerAI_MainDoubles`)', () => {
  const request = {} as never
  const act = (slot: number, target?: number) => ({
    type: 'move' as const, at: 0, slot, id: 'x', name: 'x', move: null,
    ...(target === undefined ? {} : { target }),
  })

  it('짝을 겨눈 벌의 최고점이 100 미만이면 그 벌은 안 고른다', () => {
    // 상대 쪽 벌: 몸통박치기 100 · 짝 쪽 벌: 몸통박치기 −30 → −1
    const foe = turn({ moves: moves(TACKLE), random: 0.99 })
    const ally = turn({ moves: moves(TACKLE), targetIsAlly: true, random: 0.99 })
    const policy = trainerPolicy({
      flags: AI_FLAG.TAG_STRATEGY, random: always(0.99), build: () => [ally, foe],
      list: () => [act(1, 1), act(1, -2)],
    })
    for (let i = 0; i < 5; i++) expect(policy(request, 0)).toMatchObject({ slot: 1, target: 1 })
  })

  it('짝에게 쓸 이유가 크면 짝을 고른다 — 저수 짝에게 물대포', () => {
    const low = mon(BIDOOF, { ability: ABILITY.WATER_ABSORB, hp: 10 })
    const foe = turn({ moves: moves(WATER_GUN), random: 0.5, ally: low })
    const ally = turn({ moves: moves(WATER_GUN), targetIsAlly: true, ally: low, random: 0.5 })
    const policy = trainerPolicy({
      flags: AI_FLAG.TAG_STRATEGY, random: always(0.5), build: () => [foe, ally],
      list: () => [act(1, 1), act(1, -2)],
    })
    expect(policy(request, 0)).toMatchObject({ slot: 1, target: -2 })
  })

  it('대상을 안 찍는 기술은 겨눈 벌과 무관하게 그 칸의 명령으로 돌아간다', () => {
    const foe = turn({ moves: moves(SWORDS_DANCE), random: 0.99 })
    const policy = trainerPolicy({
      flags: AI_FLAG.TAG_STRATEGY, random: always(0.99), build: () => [foe],
      list: () => [act(1)],
    })
    expect(policy(request, 0)).toMatchObject({ slot: 1 })
  })
})

describe('네 자리의 빠른 차례 (`LoadBattlerSpeedRank`)', () => {
  const sm = (speed: number, patch: Partial<SpeedMon> = {}): SpeedMon => ({
    speed, stage: 0, ability: 0, itemEffect: 0, itemParam: 0, species: 1, status: 'ok',
    hp: 10, maxHp: 10, tailwind: false, slowStart: false, itemNegated: false, ...patch,
  })
  const field = { weather: null, trickRoom: false }
  const rand = always(0.99)

  it('빠른 차례로 세우고, 쓰러진 자리와 빈 자리는 맨 뒤다', () => {
    const mons = [sm(50), sm(100), sm(80, { hp: 0 }), sm(70)]
    expect(speedRank(mons, 1, field, rand)).toBe(0)
    expect(speedRank(mons, 3, field, rand)).toBe(1)
    expect(speedRank(mons, 0, field, rand)).toBe(2)
    expect(speedRank(mons, 2, field, rand)).toBe(3)
    expect(speedRank([sm(50), null, sm(60), sm(70)], 1, field, rand)).toBe(3)
  })

  it('트릭룸은 뒤집고, 마비는 4분의 1, 순풍은 두 배', () => {
    const mons = [sm(50), sm(100), sm(80), sm(70)]
    expect(speedRank(mons, 0, { weather: null, trickRoom: true }, rand)).toBe(0)
    expect(speedRank([sm(100, { status: 'par' }), sm(30), sm(20), sm(10)], 0, field, rand)).toBe(1)
    expect(speedRank([sm(40, { tailwind: true }), sm(70), sm(20), sm(10)], 0, field, rand)).toBe(0)
  })

  it('느림보꼬리는 느린 쪽, 서투름이면 안 먹는다', () => {
    const lag = { itemEffect: 107 }
    expect(speedRank([sm(200, lag), sm(30), sm(20), sm(10)], 0, field, rand)).toBe(3)
    expect(speedRank([sm(200, { ...lag, itemNegated: true }), sm(30), sm(20), sm(10)], 0, field, rand))
      .toBe(0)
  })
})
