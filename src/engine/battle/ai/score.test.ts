// 점수 매기기. 원작 스크립트를 옮긴 것이라, 확인할 것은 "그 상황에서 그 폭만큼
// 움직이는가"다 — 부호나 폭이 어긋나면 AI가 정확히 반대로 둔다.
//
// 상황은 전부 **실제 종족·기술 데이터**로 만든다. 손으로 지어낸 능력치로 재면
// 데이터가 바뀌었을 때 테스트만 멀쩡히 통과한다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  moveFileSchema, speciesFileSchema, type Move, type Species,
} from '../../../data/schema'
import { computeStats } from '../../pokemon/stats'
import { noBoosts } from '../view'
import type { AiMon, AiMove, AiTurn } from './context'
import { AI_FLAG, BASE_SCORE, pickBest, scoreMoves } from './score'
import { ABILITY } from './rom'

const DATA = resolve(__dirname, '../../../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8')) as unknown
const speciesById = new Map<number, Species>(
  speciesFileSchema.parse(read('species.json')).species.map((s) => [s.id, s]),
)
const movesById = new Map<number, Move>(
  moveFileSchema.parse(read('moves.json')).moves.map((m) => [m.id, m]),
)
const moveNames = read('names/moves.ko.json') as string[]
const moveId = (name: string) => {
  const id = moveNames.indexOf(name)
  if (id < 0) throw new Error(`기술 "${name}"이 데이터에 없다`)
  return id
}

/** 종족 번호와 레벨로 AI가 보는 한 마리를 만든다. 개체값·노력치는 0이다 */
function mon(id: number, level: number, patch: Partial<AiMon> = {}): AiMon {
  const sp = speciesById.get(id)
  if (!sp) throw new Error(`종족 #${id}가 데이터에 없다`)
  const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  const stats = computeStats({
    base: sp.stats, ivs: zero, evs: zero, level, nature: 0, speciesId: sp.id,
  })
  return {
    species: sp.id,
    types: sp.types,
    level,
    hp: stats.hp,
    maxHp: stats.hp,
    status: 'ok',
    boosts: noBoosts(),
    ability: sp.abilities[0],
    stats,
    heldItem: 0,
    gender: 'male',
    bench: 2,
    volatiles: new Set(),
    side: new Map(),
    ...patch,
  }
}

function moves(...names: string[]): AiMove[] {
  return names.map((name, i) => {
    const id = moveId(name)
    const data = movesById.get(id)
    if (!data) throw new Error(`기술 #${id}(${name})가 데이터에 없다`)
    return {
      slot: i + 1,
      id,
      effect: data.effect,
      power: data.power,
      type: data.type,
      category: data.category,
      accuracy: data.accuracy,
      priority: data.priority,
    }
  })
}

/** 난수는 기본적으로 0.999 — 모든 확률 판정을 "점수를 준다" 쪽으로 고정한다 */
function turn(patch: Partial<AiTurn> & Pick<AiTurn, 'self' | 'foe' | 'moves'>): AiTurn {
  return {
    weather: null,
    field: new Set(),
    turn: 0,
    foeKnownMoves: new Set(),
    foeLastMoveCategory: null,
    protectChain: 0,
    random: () => 0.999,
    ...patch,
  }
}

/** 점수만 뽑는다. 어느 칸이 몇 점인지 한눈에 비교하려고 */
function scores(t: AiTurn, flags: number): number[] {
  return scoreMoves(t, flags).map((s) => s.score)
}

const GENGAR = 94 // 팬텀 — 부유가 아니라 고스트/독이다
const CHIMECHO = 358 // 치렁 — 부유
const TURTWIG = 387 // 모부기 — 풀
const STARLY = 396 // 찌르꼬 — 노말/비행
const ONIX = 95 // 롱스톤 — 바위/땅

describe('BASIC — 무효', () => {
  it('타입으로 안 통하는 기술은 -10이다', () => {
    // 노말 → 고스트. 아무리 세도 0이다
    const t = turn({
      self: mon(STARLY, 30),
      foe: mon(GENGAR, 30),
      moves: moves('몸통박치기', '날개치기'),
    })
    const [normal, flying] = scores(t, AI_FLAG.BASIC)
    expect(normal).toBe(BASE_SCORE - 10)
    // 비행은 통하므로 안 깎인다
    expect(flying).toBe(BASE_SCORE)
  })

  it('특성으로 흘리는 기술은 -12로 더 깎인다', () => {
    // 부유에게 땅 기술. 타입만 보면 통하는 것처럼 보여서 -12가 따로 있다
    const t = turn({
      self: mon(ONIX, 30),
      foe: mon(CHIMECHO, 30, { ability: ABILITY.LEVITATE }),
      moves: moves('지진'),
    })
    expect(scores(t, AI_FLAG.BASIC)[0]).toBe(BASE_SCORE - 12)
  })

  it('틀깨기면 특성 무효를 무시한다', () => {
    const t = turn({
      self: mon(ONIX, 30, { ability: ABILITY.MOLD_BREAKER }),
      foe: mon(CHIMECHO, 30, { ability: ABILITY.LEVITATE }),
      moves: moves('지진'),
    })
    expect(scores(t, AI_FLAG.BASIC)[0]).toBe(BASE_SCORE)
  })

  it('방음에게 소리 기술은 -10이다', () => {
    const t = turn({
      self: mon(STARLY, 30),
      foe: mon(CHIMECHO, 30, { ability: ABILITY.SOUNDPROOF }),
      moves: moves('울음소리', '쪼기'),
    })
    const [growl, peck] = scores(t, AI_FLAG.BASIC)
    expect(growl).toBe(BASE_SCORE - 10)
    expect(peck).toBe(BASE_SCORE)
  })
})

describe('BASIC — 헛수', () => {
  it('이미 상태이상인 상대에게 상태이상 기술은 -10이다', () => {
    const t = turn({
      self: mon(CHIMECHO, 30),
      foe: mon(TURTWIG, 30, { status: 'par' }),
      moves: moves('전기자석파', '최면술'),
    })
    for (const s of scores(t, AI_FLAG.BASIC)) expect(s).toBe(BASE_SCORE - 10)
  })

  it('랭크가 꼭대기면 올리는 기술은 -10이다', () => {
    const maxed = mon(TURTWIG, 30, { boosts: { ...noBoosts(), atk: 6 } })
    const t = turn({ self: maxed, foe: mon(STARLY, 30), moves: moves('칼춤') })
    expect(scores(t, AI_FLAG.BASIC)[0]).toBe(BASE_SCORE - 10)

    // +5면 아직 여유가 있다 — 여기가 안 갈리면 위 단언이 공허하다
    const almost = mon(TURTWIG, 30, { boosts: { ...noBoosts(), atk: 5 } })
    const t2 = turn({ self: almost, foe: mon(STARLY, 30), moves: moves('칼춤') })
    expect(scores(t2, AI_FLAG.BASIC)[0]).toBe(BASE_SCORE)
  })

  it('단순한마음이면 +3에서 이미 꼭대기다', () => {
    const self = mon(TURTWIG, 30, {
      ability: ABILITY.SIMPLE, boosts: { ...noBoosts(), atk: 3 },
    })
    const t = turn({ self, foe: mon(STARLY, 30), moves: moves('칼춤') })
    expect(scores(t, AI_FLAG.BASIC)[0]).toBe(BASE_SCORE - 10)
  })

  it('HP가 가득 찼으면 회복기는 -8이다', () => {
    const t = turn({ self: mon(TURTWIG, 30), foe: mon(STARLY, 30), moves: moves('광합성') })
    expect(scores(t, AI_FLAG.BASIC)[0]).toBe(BASE_SCORE - 8)

    const hurt = mon(TURTWIG, 30)
    hurt.hp = Math.floor(hurt.maxHp / 2)
    const t2 = turn({ self: hurt, foe: mon(STARLY, 30), moves: moves('광합성') })
    expect(scores(t2, AI_FLAG.BASIC)[0]).toBe(BASE_SCORE)
  })

  it('감점은 한 번만 먹는다', () => {
    // 잠들어 있고(-10) 세이프가드까지 걸린 상대. 원작은 첫 감점에서 평가를 끝낸다
    const foe = mon(TURTWIG, 30, { status: 'slp', side: new Map([['safeguard', 1]]) })
    const t = turn({ self: mon(CHIMECHO, 30), foe, moves: moves('최면술') })
    expect(scores(t, AI_FLAG.BASIC)[0]).toBe(BASE_SCORE - 10)
  })
})

describe('EVAL_ATTACK', () => {
  it('제일 센 기술만 안 깎인다', () => {
    const t = turn({
      self: mon(STARLY, 30),
      foe: mon(TURTWIG, 30),
      moves: moves('날개치기', '몸통박치기'),
    })
    const [wing, tackle] = scores(t, AI_FLAG.EVAL_ATTACK)
    // 날개치기는 풀에 2배 + 자속. 몸통박치기보다 세다
    expect(wing).toBe(BASE_SCORE)
    expect(tackle).toBe(BASE_SCORE - 1)
  })

  it('마무리가 되면 +4다', () => {
    const foe = mon(TURTWIG, 5)
    foe.hp = 1
    const t = turn({ self: mon(STARLY, 30), foe, moves: moves('날개치기') })
    expect(scores(t, AI_FLAG.EVAL_ATTACK)[0]).toBe(BASE_SCORE + 4)
  })

  it('선제공격으로 마무리하면 +6이다', () => {
    // 마무리 +4에 선제 +2가 더 붙는다
    const foe = mon(TURTWIG, 5)
    foe.hp = 1
    const t = turn({ self: mon(STARLY, 30), foe, moves: moves('전광석화') })
    expect(scores(t, AI_FLAG.EVAL_ATTACK)[0]).toBe(BASE_SCORE + 6)
  })

  it('4배로 들어가면 +2가 붙는다', () => {
    // 롱스톤(바위/땅)에게 풀 기술은 4배다. 마무리가 안 되는 레벨 차를 둔다
    const t = turn({
      self: mon(TURTWIG, 20),
      foe: mon(ONIX, 60),
      moves: moves('흡수'),
    })
    expect(scores(t, AI_FLAG.EVAL_ATTACK)[0]).toBe(BASE_SCORE + 2)
  })
})

describe('SETUP_FIRST_TURN', () => {
  const setup = () => turn({
    self: mon(TURTWIG, 30), foe: mon(STARLY, 30), moves: moves('칼춤'),
  })

  it('첫 턴이면 +2다', () => {
    expect(scores(setup(), AI_FLAG.SETUP_FIRST_TURN)[0]).toBe(BASE_SCORE + 2)
  })

  it('둘째 턴부터는 안 준다', () => {
    const t = { ...setup(), turn: 1 }
    expect(scores(t, AI_FLAG.SETUP_FIRST_TURN)[0]).toBe(BASE_SCORE)
  })

  it('확률이 68.75%다', () => {
    // 원작 문턱은 `IfRandomLessThan 80` — 80/256이 건너뛰고 176/256이 받는다.
    // 난수를 256칸 전부 훑어 세면 정확히 176이어야 한다
    let given = 0
    for (let i = 0; i < 256; i++) {
      const t = { ...setup(), random: () => i / 256 }
      if (scores(t, AI_FLAG.SETUP_FIRST_TURN)[0] === BASE_SCORE + 2) given++
    }
    expect(given).toBe(176)
  })
})

describe('RISKY · PRIORITIZE_EXTREMES', () => {
  it('도박수는 50%로 +2다', () => {
    let given = 0
    for (let i = 0; i < 256; i++) {
      const t = turn({
        self: mon(CHIMECHO, 30), foe: mon(TURTWIG, 30),
        moves: moves('최면술'), random: () => i / 256,
      })
      if (scores(t, AI_FLAG.RISKY)[0] === BASE_SCORE + 2) given++
    }
    expect(given).toBe(128)
  })

  it('데미지 비교 대상이 아닌 기술은 61%로 +2다', () => {
    // 자폭은 위력이 200이나 되는데도 데미지 계산에서 빠진다(`NO_DAMAGE_CALC`).
    // 이 플래그는 그렇게 빠진 것들과 변화기를 한꺼번에 밀어 준다
    let given = 0
    for (let i = 0; i < 256; i++) {
      const t = turn({
        self: mon(TURTWIG, 30), foe: mon(STARLY, 30),
        moves: moves('자폭'), random: () => i / 256,
      })
      if (scores(t, AI_FLAG.PRIORITIZE_EXTREMES)[0] === BASE_SCORE + 2) given++
    }
    expect(given).toBe(156)

    // 평범한 공격기는 안 받는다 — 안 갈리면 위 단언이 "늘 +2"와 구분이 안 된다
    const plain = turn({
      self: mon(TURTWIG, 30), foe: mon(STARLY, 30), moves: moves('몸통박치기'),
    })
    expect(scores(plain, AI_FLAG.PRIORITIZE_EXTREMES)[0]).toBe(BASE_SCORE)
  })
})

describe('고르기', () => {
  it('가장 높은 점수를 고른다', () => {
    const scored = [
      { move: moves('몸통박치기')[0]!, score: 99 },
      { move: moves('날개치기')[0]!, score: 104 },
      { move: moves('쪼기')[0]!, score: 100 },
    ]
    expect(pickBest(scored, () => 0.5)?.slot).toBe(scored[1]!.move.slot)
  })

  it('동점이면 그중에서 무작위로 고른다', () => {
    const a = moves('몸통박치기')[0]!
    const b = { ...moves('쪼기')[0]!, slot: 2 }
    const scored = [{ move: a, score: 100 }, { move: b, score: 100 }]
    const picked = new Set<number>()
    for (let i = 0; i < 20; i++) picked.add(pickBest(scored, () => i / 20)!.slot)
    expect(picked).toEqual(new Set([1, 2]))
  })

  it('후보가 없으면 null이다', () => {
    expect(pickBest([], Math.random)).toBeNull()
  })
})
