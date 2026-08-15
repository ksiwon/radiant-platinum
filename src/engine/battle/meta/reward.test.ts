// 경험치·노력치. 여기가 없으면 아무리 싸워도 아무 일도 안 일어난다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { speciesFileSchema, type Species } from '../../../data/schema'
import { expForLevel, levelForExp } from '../../pokemon/exp'
import type { PokemonInstance } from '../../pokemon/instance'
import { noOrigin } from '../../pokemon/origin'
import {
  addEvs, applyReward, EV_PER_STAT, EV_TOTAL, evYieldOf, expFor, expPool,
  HOLD_EFFECT_EV_UP, learnMoves, MOVE_SLOTS, type StatKey,
} from './reward'

const species = new Map<number, Species>(
  speciesFileSchema
    .parse(JSON.parse(readFileSync(
      resolve(__dirname, '../../../../public/data/species.json'), 'utf8')))
    .species.map((s) => [s.id, s]),
)

const TURTWIG = 387
const STARLY = 396

const zero = (): Record<StatKey, number> =>
  ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })

function mon(speciesId: number, level: number): PokemonInstance {
  const sp = species.get(speciesId)!
  return {
    species: speciesId, pid: 1, nickname: null,
    exp: expForLevel(sp.growthRate, level), level,
    ivs: zero(), evs: zero(), moves: [], hp: 20, status: 'ok', statusTurns: 0,
    heldItem: 0, friendship: 70, isEgg: false, otId: 1, otSecretId: 2, ball: 0,
    origin: noOrigin({ name: '', gender: 'male' }),
    form: 0,
    pokerus: 0, mail: null,
  }
}

describe('경험치 계산', () => {
  const went = { participant: true }

  it('기초경험치 × 레벨 / 7', () => {
    // 찌르꼬(기초 56)를 20레벨에서 혼자 잡으면 160. 기초값은 롬에서 읽는다
    expect(species.get(STARLY)!.baseExp).toBe(56)
    expect(expFor(expPool(56, 20, 1, 0), went)).toBe(160)
  })

  it('인원수로 나눈다', () => {
    expect(expFor(expPool(56, 20, 2, 0), went)).toBe(80)
    expect(expFor(expPool(56, 20, 4, 0), went)).toBe(40)
  })

  it('트레이너·교환·럭키에그가 각각 1.5배', () => {
    expect(expFor(expPool(56, 20, 1, 0), { ...went, trainerBattle: true })).toBe(240)
    // 셋이 겹치면 순서대로 곱해진다. 160 → 240 → 360 → 540
    expect(expFor(expPool(56, 20, 1, 0), {
      participant: true, luckyEgg: true, trainerBattle: true, traded: true,
    })).toBe(540)
  })

  it('아무리 작아도 1은 준다', () => {
    // 0을 주면 화면에 "경험치를 얻었다"가 뜨는데 실제로는 아무 일도 안 생긴다
    expect(expFor(expPool(1, 1, 6, 0), went)).toBe(1)
  })

  // ── 학습장치 (PARITY §2.17) ────────────────────────────────────────────────
  it('학습장치가 하나라도 있으면 경험치가 반으로 갈린다', () => {
    // 나간 한 마리 + 학습장치 한 마리. 160이 80과 80으로 갈린다
    const pool = expPool(56, 20, 1, 1)
    expect(pool).toEqual({ gained: 80, shared: 80 })
    expect(expFor(pool, { participant: true })).toBe(80)
    expect(expFor(pool, { participant: false, expShare: true })).toBe(80)
  })

  it('나간 마리가 학습장치를 들면 양쪽 몫을 다 받는다', () => {
    // ⚠️ 이걸 배타로 다루면 학습장치를 든 채로 나가는 것이 손해가 된다
    const pool = expPool(56, 20, 1, 1)
    expect(expFor(pool, { participant: true, expShare: true })).toBe(160)
  })

  it('학습장치 몫은 든 마리 수로 나눈다', () => {
    expect(expPool(56, 20, 2, 4)).toEqual({ gained: 40, shared: 20 })
  })

  it('나간 마리가 다 쓰러져도 학습장치 몫은 살아 있다', () => {
    // 나눌 인원이 0이다. 원작에서도 0으로 나누는 자리라 그 몫만 0이 되고
    // 학습장치 쪽은 그대로 나간다
    const pool = expPool(56, 20, 0, 1)
    expect(pool.shared).toBe(80)
    expect(expFor(pool, { participant: false, expShare: true })).toBe(80)
  })

  it('배수는 받는 마리마다 갈린다', () => {
    // ⚠️ 몫을 만들 때 곱해 두면 남의 럭키에그로 불어난 경험치를 학습장치가 받는다
    const pool = expPool(56, 20, 1, 1)
    expect(expFor(pool, { participant: false, expShare: true, luckyEgg: true })).toBe(120)
    expect(expFor(pool, { participant: true })).toBe(80)
  })

  it('나가지도 않고 학습장치도 없으면 0이다', () => {
    expect(expFor(expPool(56, 20, 1, 0), { participant: false })).toBe(0)
    // 0에는 배수도 안 걸린다 — 1.5배 해서 1이 되면 안 준 것이 준 것이 된다
    expect(expFor(expPool(56, 20, 1, 0), { participant: false, trainerBattle: true })).toBe(0)
  })
})

describe('노력치를 불리는 것들', () => {
  const starly = () => species.get(STARLY)!

  it('포켓루스는 두 배', () => {
    const plain = evYieldOf(starly())
    const sick = evYieldOf(starly(), { pokerus: true })
    for (const k of Object.keys(plain) as StatKey[]) expect(sick[k]).toBe(plain[k] * 2)
  })

  it('마초브레이스도 두 배고, 포켓루스와 겹치면 네 배', () => {
    const plain = evYieldOf(starly())
    const both = evYieldOf(starly(), { pokerus: true, holdEffect: HOLD_EFFECT_EV_UP })
    for (const k of Object.keys(plain) as StatKey[]) expect(both[k]).toBe(plain[k] * 4)
  })

  it('파워 아이템은 먼저 더하고 그 합에 배수가 걸린다', () => {
    // 파워앵클(스피드 +4). 곱한 뒤에 더하면 4가 8이 안 된다
    const got = evYieldOf(starly(), { holdEffect: 121, itemPower: 4, pokerus: true })
    expect(got.spe).toBe((starly().ev.spe + 4) * 2)
    expect(got.atk).toBe(starly().ev.atk * 2)
  })
})

describe('노력치', () => {
  it('능력치당 255에서 멈춘다', () => {
    const evs = { ...zero(), atk: 254 }
    expect(addEvs(evs, { ...zero(), atk: 3 }).atk).toBe(EV_PER_STAT)
  })

  it('합계 510에서 멈춘다', () => {
    const evs = { ...zero(), hp: 255, atk: 253 }
    const after = addEvs(evs, { ...zero(), atk: 3, spe: 3 })
    expect(after.atk + after.hp + after.spe).toBe(EV_TOTAL)
    // 남은 2점이 atk에 들어가고 spe에는 자리가 없다
    expect(after.atk).toBe(255)
    expect(after.spe).toBe(0)
  })

  it('한도에 걸려도 남는 만큼은 넣는다', () => {
    // 통째로 버리면 마지막 몇 점이 영영 안 들어간다. 합계 508에서 3을 주면
    // 2만 들어가야 한다
    const evs = { ...zero(), hp: 253, atk: 255 }
    const after = addEvs(evs, { ...zero(), hp: 3 })
    expect(after.hp).toBe(255)
    expect(after.hp + after.atk).toBe(EV_TOTAL)
  })

  it('원본을 바꾸지 않는다', () => {
    const evs = zero()
    addEvs(evs, { ...zero(), atk: 3 })
    expect(evs.atk).toBe(0)
  })
})

describe('보상 반영', () => {
  it('레벨이 오르고 배울 기술이 나온다', () => {
    const sp = species.get(TURTWIG)!
    const before = mon(TURTWIG, 4)
    const toFive = expForLevel(sp.growthRate, 5) - before.exp
    const r = applyReward(before, sp, toFive, sp.ev)

    expect(r.mon.level).toBe(5)
    expect(r.levelUps.map((l) => l.level)).toEqual([5])
    // 모부기는 5레벨에 울부짖기를 배운다. 데이터가 바뀌면 여기서 알려 준다
    const learned = sp.learnset.filter((e) => e.level === 5).map((e) => e.move)
    expect(r.levelUps[0]!.moves).toEqual(learned)
  })

  it('한 번에 여러 레벨이 올라도 전부 기록된다', () => {
    // 중간 레벨의 기술을 건너뛰면 조용히 못 배운 채로 지나간다
    const sp = species.get(TURTWIG)!
    const r = applyReward(mon(TURTWIG, 5), sp, expForLevel(sp.growthRate, 12), sp.ev)
    expect(r.mon.level).toBeGreaterThanOrEqual(12)
    expect(r.levelUps.map((l) => l.level)).toEqual(
      Array.from({ length: r.mon.level - 5 }, (_, i) => 6 + i),
    )
  })

  it('100레벨에서 멈추고 경험치도 안 넘친다', () => {
    const sp = species.get(TURTWIG)!
    const r = applyReward(mon(TURTWIG, 100), sp, 9_999_999, sp.ev)
    expect(r.mon.level).toBe(100)
    expect(r.mon.exp).toBe(expForLevel(sp.growthRate, 100))
    expect(r.gainedExp).toBe(0)
    expect(r.levelUps).toHaveLength(0)
  })

  it('실제로 받은 경험치를 돌려준다 — 한도에 걸리면 줄어든다', () => {
    const sp = species.get(TURTWIG)!
    const near = mon(TURTWIG, 99)
    const room = expForLevel(sp.growthRate, 100) - near.exp
    const r = applyReward(near, sp, room + 50_000, sp.ev)
    expect(r.gainedExp).toBe(room)
  })

  it('레벨이 안 오르면 경험치만 는다', () => {
    const sp = species.get(TURTWIG)!
    const before = mon(TURTWIG, 20)
    const r = applyReward(before, sp, 5, sp.ev)
    expect(r.mon.level).toBe(20)
    expect(r.mon.exp).toBe(before.exp + 5)
    expect(r.levelUps).toHaveLength(0)
  })

  it('원본을 바꾸지 않는다', () => {
    const sp = species.get(TURTWIG)!
    const before = mon(TURTWIG, 10)
    const exp = before.exp
    applyReward(before, sp, 100_000, sp.ev)
    expect(before.exp).toBe(exp)
    expect(before.level).toBe(10)
  })

  it('레벨과 경험치가 어긋나지 않는다', () => {
    // 둘 중 하나만 갱신하면 화면의 경험치 바가 영영 안 맞는다
    const sp = species.get(TURTWIG)!
    for (const gain of [1, 500, 5000, 50_000, 500_000]) {
      const r = applyReward(mon(TURTWIG, 5), sp, gain, sp.ev)
      expect(r.mon.level, `${gain}`).toBe(levelForExp(sp.growthRate, r.mon.exp))
    }
  })
})

describe('기술 습득', () => {
  const pp = () => 20

  it('빈 칸이 있으면 그냥 들어간다', () => {
    const m = mon(TURTWIG, 10)
    m.moves = [{ move: 33, pp: 35, ppUps: 0 }]
    const r = learnMoves(m, [45, 71], pp)
    expect(r.learned).toEqual([45, 71])
    expect(r.pending).toEqual([])
    expect(r.mon.moves.map((s) => s.move)).toEqual([33, 45, 71])
    // PP가 안 차 있으면 배우자마자 못 쓰는 기술이 된다
    expect(r.mon.moves[1]!.pp).toBe(20)
  })

  it('네 칸이 차 있으면 안 넣고 넘긴다', () => {
    // 마음대로 지우면 마지막에 배운 기술이 조용히 첫 칸을 덮어쓴다
    const m = mon(TURTWIG, 10)
    m.moves = [33, 45, 71, 22].map((move) => ({ move, pp: 20, ppUps: 0 }))
    const r = learnMoves(m, [77], pp)
    expect(r.learned).toEqual([])
    expect(r.pending).toEqual([77])
    expect(r.mon.moves.map((s) => s.move)).toEqual([33, 45, 71, 22])
    expect(r.mon.moves).toHaveLength(MOVE_SLOTS)
  })

  it('이미 아는 기술은 건너뛴다', () => {
    // 같은 기술을 두 번 배우는 종이 있다. 두 칸을 차지하면 안 된다
    const m = mon(TURTWIG, 10)
    m.moves = [{ move: 33, pp: 20, ppUps: 0 }]
    const r = learnMoves(m, [33], pp)
    expect(r.learned).toEqual([])
    expect(r.pending).toEqual([])
    expect(r.mon.moves).toHaveLength(1)
  })

  it('원본을 바꾸지 않는다', () => {
    const m = mon(TURTWIG, 10)
    m.moves = [{ move: 33, pp: 20, ppUps: 0 }]
    learnMoves(m, [45], pp)
    expect(m.moves).toHaveLength(1)
  })

  it('빈 칸보다 배울 게 많으면 앞에서부터 채우고 나머지는 넘긴다', () => {
    const m = mon(TURTWIG, 10)
    m.moves = [33, 45, 71].map((move) => ({ move, pp: 20, ppUps: 0 }))
    const r = learnMoves(m, [22, 77], pp)
    expect(r.learned).toEqual([22])
    expect(r.pending).toEqual([77])
  })
})
