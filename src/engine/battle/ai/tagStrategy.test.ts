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

// ═════════════════════════════════════════════════════════════════════════════
// 갈래별 시나리오 — 원작 라벨마다 하나씩 (`script.s` 6751~7691)
// ═════════════════════════════════════════════════════════════════════════════

const RAIN_DANCE = 240
const SUNNY_DAY = 241
const HAIL = 258
const SANDSTORM = 201
const GRAVITY = 356
const FOLLOW_ME = 266
const FUTURE_SIGHT = 248
const SKILL_SWAP = 285
const THUNDER_WAVE = 86
const SWAGGER = 207
const GASTRO_ACID = 380
const ACUPRESSURE = 367
const TRICK = 271
const FLING = 374
const TOXIC = 92
const BLIZZARD = 59
const FIRE_BLAST = 126
const ITEM_FLAME_ORB = 273
const ITEM_TOXIC_ORB = 272
const ITEM_PERSIM_BERRY = 156
const ITEM_LUM_BERRY = 157

/** 최대 체력의 p%인 개체 */
function pct(id: number, p: number, patch: Partial<AiMon> = {}): AiMon {
  const m = mon(id, patch)
  return { ...m, hp: Math.max(1, Math.round((m.maxHp * p) / 100)) }
}

describe('날씨 기술 (`TagStrategy_RainDance` · `SunnyDay` · `Hail` · `Sandstorm`)', () => {
  it('비바라기: 촉촉바디는 상태 이상일 때만 · 건조피부는 늘 +2 — 나와 짝을 따로 센다', () => {
    const base = { moves: moves(RAIN_DANCE) }
    const hyd = mon(BIDOOF, { ability: ABILITY.HYDRATION })
    const dry = mon(BIDOOF, { ability: ABILITY.DRY_SKIN })
    expect(one(turn({ ...base, self: hyd }))).toBe(0)
    expect(one(turn({ ...base, self: { ...hyd, status: 'brn' } }))).toBe(2)
    expect(one(turn({ ...base, self: dry }))).toBe(2)
    expect(one(turn({ ...base, ally: dry }))).toBe(2)
    expect(one(turn({ ...base, self: dry, ally: dry }))).toBe(4)
    expect(one(turn({ ...base, ally: { ...hyd, status: 'par' } }))).toBe(2)
    expect(one(turn({ ...base, ally: hyd }))).toBe(0)
  })

  it('쾌청: 잎가드(멀쩡·30% 이상) +2 · 플라워기프트 +2 · 건조피부 −2', () => {
    const base = { moves: moves(SUNNY_DAY) }
    const leaf = (p: number, status: AiMon['status'] = 'ok') =>
      pct(BIDOOF, p, { ability: ABILITY.LEAF_GUARD, status })
    expect(one(turn({ ...base, self: leaf(100) }))).toBe(2)
    expect(one(turn({ ...base, self: leaf(29) }))).toBe(0)
    expect(one(turn({ ...base, self: leaf(100, 'brn') }))).toBe(0)
    expect(one(turn({ ...base, self: mon(BIDOOF, { ability: ABILITY.FLOWER_GIFT }) }))).toBe(2)
    expect(one(turn({ ...base, self: mon(BIDOOF, { ability: ABILITY.DRY_SKIN }) }))).toBe(-2)
    expect(one(turn({ ...base, ally: leaf(100) }))).toBe(2)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { ability: ABILITY.DRY_SKIN }) }))).toBe(-2)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { ability: ABILITY.FLOWER_GIFT }) }))).toBe(2)
  })

  it('쾌청: 솔라파워는 50% 이상 +1에 이어 50%로 −2를 또 굴린다(코드대로) · 절반 아래는 −2만', () => {
    const sp = (p: number) => pct(BIDOOF, p, { ability: ABILITY.SOLAR_POWER })
    const base = { moves: moves(SUNNY_DAY) }
    expect(one(turn({ ...base, self: sp(100), random: 0.99 }))).toBe(-1)
    expect(one(turn({ ...base, self: sp(100), random: 0.0 }))).toBe(1)
    expect(one(turn({ ...base, self: sp(40), random: 0.99 }))).toBe(-2)
    expect(one(turn({ ...base, self: sp(40), random: 0.0 }))).toBe(0)
    expect(one(turn({ ...base, ally: sp(100), random: 0.99 }))).toBe(-1)
  })

  it('싸라기눈: 아이스바디·눈숨기·눈보라 중 하나면 그 마리 몫 +2', () => {
    const base = { moves: moves(HAIL) }
    const ice = mon(BIDOOF, { ability: ABILITY.ICE_BODY })
    expect(one(turn(base))).toBe(0)
    expect(one(turn({ ...base, self: ice }))).toBe(2)
    expect(one(turn({ ...base, self: mon(BIDOOF, { ability: ABILITY.SNOW_CLOAK }) }))).toBe(2)
    expect(one(turn({ ...base, moves: moves(HAIL, BLIZZARD) }))).toBe(2)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { ability: ABILITY.SNOW_CLOAK }) }))).toBe(2)
    expect(one(turn({ ...base, allyMoves: moves(BLIZZARD) }))).toBe(2)
    expect(one(turn({ ...base, self: ice, ally: ice }))).toBe(4)
  })

  it('모래바람: 모래숨기나 바위 타입인 마리마다 +2', () => {
    const base = { moves: moves(SANDSTORM) }
    const rock = mon(BIDOOF, { types: [TYPE.ROCK, TYPE.ROCK] })
    expect(one(turn(base))).toBe(0)
    expect(one(turn({ ...base, self: mon(BIDOOF, { ability: ABILITY.SAND_VEIL }) }))).toBe(2)
    expect(one(turn({ ...base, self: mon(BIDOOF, { types: [TYPE.NORMAL, TYPE.ROCK] }) }))).toBe(2)
    expect(one(turn({ ...base, ally: rock }))).toBe(2)
    expect(one(turn({ ...base, self: rock, ally: mon(BIDOOF, { ability: ABILITY.SAND_VEIL }) }))).toBe(4)
  })
})

describe('중력 · 손가락질 · 미래예지 · 스킬스왑 (`TagStrategy_Gravity` · `FollowMe` · `FutureSight`)', () => {
  const flyer = mon(BIDOOF, { types: [TYPE.FLYING, TYPE.FLYING] })

  it('중력: 이미 걸렸으면 −30 · 우리 편이 떠 있으면 마리마다 −5', () => {
    const base = { moves: moves(GRAVITY), random: 0.99 }
    expect(one({ ...turn(base), field: new Set(['gravity']) })).toBe(-30)
    expect(one(turn(base))).toBe(0)
    expect(one(turn({ ...base, self: flyer }))).toBe(-5)
    expect(one(turn({ ...base, self: flyer, ally: mon(BIDOOF, { ability: ABILITY.LEVITATE }) }))).toBe(-10)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { volatiles: new Set(['magnetrise']) }) }))).toBe(-5)
  })

  it('중력: 상대가 떠 있으면 마리마다 75%로 +3', () => {
    const base = { moves: moves(GRAVITY) }
    expect(one(turn({ ...base, foe: flyer, random: 0.99 }))).toBe(3)
    expect(one(turn({ ...base, foe: flyer, random: 0.0 }))).toBe(0)
    expect(one(turn({ ...base, foe: flyer, foeAlly: flyer, random: 0.99 }))).toBe(6)
  })

  it('손가락질: 내 체력 × 짝 체력 표 (75%로 적용)', () => {
    const at = (me: number, ally: number, random = 0.99) =>
      one(turn({ moves: moves(FOLLOW_ME), self: pct(BIDOOF, me), ally: pct(BIDOOF, ally), random }))
    expect(at(100, 100)).toBe(-1)
    expect(at(100, 70)).toBe(1)
    expect(at(100, 40)).toBe(2)
    expect(at(100, 20)).toBe(3)
    expect(at(70, 100)).toBe(-2)
    expect(at(70, 70)).toBe(-1)
    expect(at(70, 40)).toBe(1)
    expect(at(70, 20)).toBe(2)
    expect(at(40, 100)).toBe(-2)
    expect(at(40, 70)).toBe(-2)
    expect(at(40, 40)).toBe(1)
    expect(at(40, 20)).toBe(2)
    expect(at(20, 100)).toBe(-5)
    // 25%는 아무 일도 없다
    expect(at(100, 20, 0.0)).toBe(0)
    expect(at(20, 100, 0.0)).toBe(0)
  })

  it('미래예지: 짝도 가졌고 짝이 먼저 움직이면 −3 · 짝이 안 가졌거나 쓰러졌으면 0', () => {
    // 데미지 기술이라 앞머리가 먼저 붙는다 — 제일 센 수 +1 (난수 0.99). 그 위의 몫만 본다
    const base = { moves: moves(FUTURE_SIGHT), random: 0.99, allyMoves: moves(FUTURE_SIGHT) }
    const head = 1
    expect(one(turn({ ...base, rank: { self: 3, ally: 0 } }))).toBe(head - 3)
    expect(one(turn({ ...base, rank: { self: 3, ally: 0 }, allyMoves: [] }))).toBe(head)
    expect(one(turn({ ...base, rank: { self: 2, ally: 1 } }))).toBe(head - 3)
    expect(one(turn({ ...base, rank: { self: 1, ally: 0 } }))).toBe(head - 3)
    // 순서가 갈릴 때는 반반 (`IfRandomLessThan 128`)
    expect(one(turn({ ...base, rank: { self: 0, ally: 0 } }))).toBe(head - 3)
    expect(one(turn({ ...base, random: 0.0, rank: { self: 0, ally: 0 } }))).toBe(0)
    expect(one(turn({ ...base, ally: mon(BIDOOF, { hp: 0 }) }))).toBe(head)
  })

  it('스킬스왑(상대에게): 내 게으름 계열을 넘기면 +5 · 상대의 좋은 특성을 받으면 +2', () => {
    const base = { moves: moves(SKILL_SWAP) }
    expect(one(turn({ ...base, self: mon(BIDOOF, { ability: ABILITY.TRUANT }) }))).toBe(5)
    expect(one(turn({ ...base, self: mon(BIDOOF, { ability: ABILITY.KLUTZ }) }))).toBe(5)
    expect(one(turn({ ...base, foe: mon(BIDOOF, { ability: ABILITY.HUGE_POWER }) }))).toBe(2)
    expect(one(turn(base))).toBe(0)
  })
})

describe('짝에게 쓰는 변화기 (`TagStrategy_PartnerStatusMove`)', () => {
  const toAlly = (id: number, ally: AiMon, extra: Partial<Parameters<typeof turn>[0]> = {}) =>
    one(turn({ moves: moves(id), targetIsAlly: true, ally, ...extra }))

  it('스킬스왑: 짝이 게으름·슬로스타트면 +10', () => {
    expect(toAlly(SKILL_SWAP, mon(BIDOOF, { ability: ABILITY.TRUANT }))).toBe(10)
    expect(toAlly(SKILL_SWAP, mon(BIDOOF, { ability: ABILITY.SLOW_START }))).toBe(10)
    expect(toAlly(SKILL_SWAP, mon(BIDOOF))).toBe(-30)
  })

  it('스킬스왑: 복안·노가드를 명중 낮은 기술의 짝에게 +3 · 기술이 없으면 −30', () => {
    const self = mon(BIDOOF, { ability: ABILITY.COMPOUND_EYES })
    expect(toAlly(SKILL_SWAP, mon(BIDOOF), { self, allyMoves: moves(FIRE_BLAST) })).toBe(3)
    expect(toAlly(SKILL_SWAP, mon(BIDOOF), { self, allyMoves: moves(TACKLE) })).toBe(-30)
    const ng = mon(BIDOOF, { ability: ABILITY.NO_GUARD })
    expect(toAlly(SKILL_SWAP, mon(BIDOOF), { self: ng, allyMoves: moves(BLIZZARD) })).toBe(3)
  })

  it('스킬스왑: 부유를 순수 전기 짝에게 주면 +2 · 이미 부유면 −30', () => {
    const self = mon(BIDOOF, { ability: ABILITY.LEVITATE })
    const elec = mon(BIDOOF, { types: [TYPE.ELECTRIC, TYPE.ELECTRIC] })
    expect(toAlly(SKILL_SWAP, elec, { self })).toBe(2)
    expect(toAlly(SKILL_SWAP, mon(BIDOOF, { ability: ABILITY.LEVITATE }), { self })).toBe(-30)
    // 전기/다른 타입 — +1 뒤에 복안 갈래로 흘러 −30이 붙는다 (코드대로)
    expect(toAlly(SKILL_SWAP, mon(BIDOOF, { types: [TYPE.ELECTRIC, TYPE.FLYING] }), { self })).toBe(-29)
  })

  it('도깨비불: 근성 짝이 멀쩡·81% 이상·불 도구 없음일 때만 +5', () => {
    const guts = (patch: Partial<AiMon> = {}, p = 100) =>
      pct(BIDOOF, p, { ability: ABILITY.GUTS, ...patch })
    expect(toAlly(WILL_O_WISP, guts())).toBe(5)
    expect(toAlly(WILL_O_WISP, guts({ status: 'par' }))).toBe(-30)
    expect(toAlly(WILL_O_WISP, guts({ heldItem: ITEM_FLAME_ORB }))).toBe(-30)
    expect(toAlly(WILL_O_WISP, guts({ heldItem: ITEM_TOXIC_ORB }))).toBe(-30)
    expect(toAlly(WILL_O_WISP, guts({}, 80))).toBe(-30)
    expect(toAlly(WILL_O_WISP, guts({ types: [TYPE.FIRE, TYPE.FIRE] }))).toBe(-30)
  })

  it('전기자석파: 땅 타입은 −30 · 전기엔진·축전이면 전기 흡수 표를 따른다', () => {
    const ground = mon(BIDOOF, { types: [TYPE.GROUND, TYPE.GROUND], ability: ABILITY.MOTOR_DRIVE })
    expect(toAlly(THUNDER_WAVE, ground)).toBe(-30)
    expect(toAlly(THUNDER_WAVE, mon(BIDOOF))).toBe(-30)
    const volt = (p: number) => pct(BIDOOF, p, { ability: ABILITY.VOLT_ABSORB })
    expect(toAlly(THUNDER_WAVE, volt(100))).toBe(-10)
    expect(toAlly(THUNDER_WAVE, volt(40), { random: 0.5 })).toBe(3)
  })

  it('독: 포이즌힐 짝이 멀쩡하고 91% 이하일 때만 +5 (원작은 주석과 반대로 91% 초과를 막는다)', () => {
    const ph = (patch: Partial<AiMon> = {}, p = 90) =>
      pct(BIDOOF, p, { ability: ABILITY.POISON_HEAL, ...patch })
    expect(toAlly(TOXIC, ph())).toBe(5)
    expect(toAlly(TOXIC, ph({}, 100))).toBe(-30)
    expect(toAlly(TOXIC, ph({ status: 'brn' }))).toBe(-30)
    expect(toAlly(TOXIC, ph({ heldItem: ITEM_TOXIC_ORB }))).toBe(-30)
    expect(toAlly(TOXIC, mon(BIDOOF))).toBe(-30)
  })

  it('도우미: 짝이 쓰러졌으면 −30 · 50% 이하 짝이 느리면 점수 0', () => {
    expect(toAlly(HELPING_HAND, mon(BIDOOF, { hp: 0 }))).toBe(-30)
    expect(toAlly(HELPING_HAND, pct(BIDOOF, 40), { rank: { self: 0, ally: 2 } })).toBe(0)
    expect(toAlly(HELPING_HAND, pct(BIDOOF, 40), { rank: { self: 1, ally: 0 }, random: 0.99 })).toBe(2)
  })

  it('뽐내기: 시몬·리샘열매를 든 짝만 · 공격 +2 미만이면 +3', () => {
    expect(toAlly(SWAGGER, mon(BIDOOF))).toBe(-30)
    expect(toAlly(SWAGGER, mon(BIDOOF, { heldItem: ITEM_PERSIM_BERRY }))).toBe(3)
    const raised = mon(BIDOOF, { heldItem: ITEM_LUM_BERRY, boosts: { ...noBoosts(), atk: 2 } })
    expect(toAlly(SWAGGER, raised)).toBe(0)
  })

  it('트릭: 점수를 안 건드린다 · 위액: 게으름이면 +5, 이미 봉인이면 −30', () => {
    expect(toAlly(TRICK, mon(BIDOOF))).toBe(0)
    expect(toAlly(GASTRO_ACID, mon(BIDOOF, { ability: ABILITY.TRUANT }))).toBe(5)
    expect(toAlly(GASTRO_ACID, mon(BIDOOF))).toBe(0)
    const sealed = mon(BIDOOF, { ability: ABILITY.TRUANT, volatiles: new Set(['gastroacid']) })
    expect(toAlly(GASTRO_ACID, sealed)).toBe(-30)
  })

  it('지압: 짝 체력 50% 이하 −1 · +6이 있으면 −30 · 심플이면 +3부터 −10', () => {
    expect(toAlly(ACUPRESSURE, pct(BIDOOF, 50, { ability: ABILITY.NONE }))).toBe(-1)
    expect(toAlly(ACUPRESSURE, pct(BIDOOF, 100, { ability: ABILITY.NONE, boosts: { ...noBoosts(), spe: 6 } }))).toBe(-30)
    const simple = (b: number) =>
      mon(BIDOOF, { ability: ABILITY.SIMPLE, boosts: { ...noBoosts(), def: b } })
    expect(toAlly(ACUPRESSURE, simple(3))).toBe(-10)
    expect(toAlly(ACUPRESSURE, simple(2), { random: 0.99 })).toBe(2)
    // 91% 이상은 31%만 건너뛰고(<80) 나머지가 +2, 중간 체력은 절반이 먼저 건너뛴다
    expect(toAlly(ACUPRESSURE, pct(BIDOOF, 100, { ability: ABILITY.NONE }), { random: 0.99 })).toBe(2)
    expect(toAlly(ACUPRESSURE, pct(BIDOOF, 100, { ability: ABILITY.NONE }), { random: 0.0 })).toBe(0)
    expect(toAlly(ACUPRESSURE, pct(BIDOOF, 70, { ability: ABILITY.NONE }), { random: 0.4 })).toBe(0)
    expect(toAlly(ACUPRESSURE, pct(BIDOOF, 70, { ability: ABILITY.NONE }), { random: 0.6 })).toBe(2)
  })

  it('그 밖의 변화기는 −30 · 내던지기도 위력 1이라 비교가 안 돼 변화기 갈래로 가서 −30이다', () => {
    expect(toAlly(SWORDS_DANCE, mon(BIDOOF))).toBe(-30)
    expect(toAlly(FLING, mon(BIDOOF))).toBe(-30)
  })
})
