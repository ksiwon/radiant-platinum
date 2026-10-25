// 파티 화면의 도구 — 노력치 · PP · 성스러운재 (`item_use_pokemon.c`)
//
// 값은 디컴프의 `CalculateEVUpdate` · `IncreaseMovePPUps` · `Pokemon_CalcStats`를 손으로 따라가 얻었다.
// 진짜 도구표와 종족표 위에서 잰다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { itemFileSchema, speciesFileSchema, type Item, type Species } from '../../data/schema'
import { withData } from '../../data/romData.testkit'
import { planItemUse } from '../battle/meta/bagItem'
import { createWild, maxHp, maxPpOf, type PokemonInstance } from '../pokemon/instance'
import { fieldTarget } from './fieldUse'
import { applyEvItem, calcEvUpdate, canUseEvItem, evUseLine, friendshipItemEffect } from './evUse'
import { partyItemKind, type PartyItemKind } from './partyItem'
import { needsMoveChoice, ppUpsGiven, raisePpUps } from './ppUse'
import { fieldFriendship } from './rareCandy'
import { faintedSlots, isSacredAsh, reviveFull } from './sacredAsh'

const DATA = resolve(__dirname, '../../../public/data')

describe('calcEvUpdate — CalculateEVUpdate', () => {
  it('0에서 깎으면 · 100에서 올리면 · 합 510에서 올리면 안 바뀐다', () => {
    expect(calcEvUpdate(0, 100, -10)).toBeNull()
    expect(calcEvUpdate(100, 0, 10)).toBeNull()
    expect(calcEvUpdate(40, 470, 10)).toBeNull()
    // 합이 510 직전이면 올라간다
    expect(calcEvUpdate(40, 469, 10)).toBe(50 - 9)
  })
  it('올리면 100으로 · 깎으면 0으로 자르고, 합 510을 넘는 만큼은 깎는다', () => {
    expect(calcEvUpdate(95, 0, 10)).toBe(100)
    expect(calcEvUpdate(99, 0, 10)).toBe(100)
    expect(calcEvUpdate(5, 0, -10)).toBe(0)
    expect(calcEvUpdate(30, 475, 10)).toBe(35)
    expect(calcEvUpdate(10, 400, 10)).toBe(20)
  })
  it('100을 넘은 칸은 깎아도 100으로 잘린다 — 한도 검사가 깎는 쪽에도 걸려 있다 (116 → 100)', () => {
    expect(calcEvUpdate(116, 0, -10)).toBe(100)
    expect(calcEvUpdate(200, 0, -10)).toBe(100)
  })
})

withData('items.json', 'species.json')('파티 도구 — 실제 표', () => {
  const items = itemFileSchema.parse(JSON.parse(readFileSync(resolve(DATA, 'items.json'), 'utf8'))).items
  const species = speciesFileSchema.parse(JSON.parse(readFileSync(resolve(DATA, 'species.json'), 'utf8'))).species
  const byId = new Map(species.map((s) => [s.id, s]))
  const item = (constant: string): Item => items.find((x) => x.constant === constant)!
  const kind = (id: number): Species => byId.get(id)!
  const BULBASAUR = kind(1)
  const SHEDINJA = kind(292)

  /** 늘 같은 개체 */
  const mon = (of: Species, level: number, extra: Partial<PokemonInstance> = {}): PokemonInstance => {
    const one = createWild({ species: of, level, rng: () => 0.5, otId: 1, otSecretId: 2 })
    return { ...one, hp: maxHp(one, of), ...extra }
  }
  const evs = (e: Partial<PokemonInstance['evs']>): PokemonInstance['evs'] => (
    { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...e }
  )

  describe('갈래 — 몇 종이 어느 길로 도는가', () => {
    it('회복 갈래(1) 38종이 전부 길이 있고, 갈래별 개수가 고정이다', () => {
      const field = items.filter((x) => x.fieldUseFunc === 1)
      expect(field).toHaveLength(38)
      const count: Record<PartyItemKind, number> = { sacredAsh: 0, candy: 0, ppUp: 0, ppRestoreOne: 0, ev: 0, plan: 0 }
      for (const x of field) count[partyItemKind(x)]++
      expect(count).toEqual({ sacredAsh: 1, candy: 1, ppUp: 2, ppRestoreOne: 2, ev: 6, plan: 26 })
    })
    it('`plan` 26종은 `planItemUse`가 아는 칸만 쓴다 — 모르는 칸이 있으면 조용히 「효과 없음」이 된다', () => {
      const known = new Set([
        'healSleep', 'healPoison', 'healBurn', 'healFreeze', 'healParalysis', 'healConfusion', 'healAttract',
        'hpRestore', 'hpRestored', 'revive', 'ppRestoreAll', 'ppRestored',
        'giveFriendshipLow', 'giveFriendshipMed', 'giveFriendshipHigh', 'friendshipLow', 'friendshipMed', 'friendshipHigh',
      ])
      for (const x of items.filter((y) => y.fieldUseFunc === 1 && partyItemKind(y) === 'plan')) {
        for (const key of Object.keys(x.param ?? {})) expect(known.has(key), `${x.constant}.${key}`).toBe(true)
      }
    })
    it('나무열매 중 노력치 열매 여섯은 ev, 잎새열매는 PP 한 칸이다', () => {
      for (const c of ['POMEG', 'KELPSY', 'QUALOT', 'HONDEW', 'GREPA', 'TAMATO']) {
        expect(partyItemKind(item(`ITEM_${c}_BERRY`))).toBe('ev')
      }
      expect(partyItemKind(item('ITEM_LEPPA_BERRY'))).toBe('ppRestoreOne')
    })
    it('PP 도구: 에테르·맥스에테르·잎새열매·포인트업·포인트맥스는 칸을 묻고 엘릭서 둘은 안 묻는다', () => {
      for (const c of ['ETHER', 'MAX_ETHER', 'LEPPA_BERRY', 'PP_UP', 'PP_MAX']) {
        expect(needsMoveChoice(item(`ITEM_${c}`))).toBe(true)
      }
      for (const c of ['ELIXIR', 'MAX_ELIXIR']) expect(needsMoveChoice(item(`ITEM_${c}`))).toBe(false)
      expect(ppUpsGiven(item('ITEM_PP_UP'))).toBe(1)
      expect(ppUpsGiven(item('ITEM_PP_MAX'))).toBe(3)
    })
    it('성스러운재는 하나뿐이다', () => {
      expect(items.filter(isSacredAsh).map((x) => x.constant)).toEqual(['ITEM_SACRED_ASH'])
    })
  })

  describe('비타민', () => {
    const HP_UP = item('ITEM_HP_UP')
    const PROTEIN = item('ITEM_PROTEIN')
    it('여섯 종이 각자 제 칸을 +10 올린다', () => {
      const cells: [string, keyof PokemonInstance['evs']][] = [
        ['HP_UP', 'hp'], ['PROTEIN', 'atk'], ['IRON', 'def'], ['CARBOS', 'spe'], ['CALCIUM', 'spa'], ['ZINC', 'spd'],
      ]
      for (const [c, stat] of cells) {
        const got = applyEvItem(mon(BULBASAUR, 30), BULBASAUR, item(`ITEM_${c}`))!
        expect(got.evChanged).toBe(true)
        expect(got.mon.evs).toEqual(evs({ [stat]: 10 }))
      }
    })
    it('한 칸 100이 상한이다 — 95는 100으로, 100은 쓸 수 없다', () => {
      expect(applyEvItem(mon(BULBASAUR, 30, { evs: evs({ atk: 95 }) }), BULBASAUR, PROTEIN)!.mon.evs.atk).toBe(100)
      expect(canUseEvItem(mon(BULBASAUR, 30, { evs: evs({ atk: 100 }) }), PROTEIN)).toBe(false)
      expect(applyEvItem(mon(BULBASAUR, 30, { evs: evs({ atk: 100 }) }), BULBASAUR, PROTEIN)).toBeNull()
    })
    it('여섯 칸의 합 510이 상한이다 — 505면 5만 오르고, 510이면 쓸 수 없다', () => {
      const near = mon(BULBASAUR, 30, { evs: evs({ hp: 100, def: 100, spa: 100, spd: 100, spe: 100, atk: 5 }) })
      expect(applyEvItem(near, BULBASAUR, PROTEIN)!.mon.evs.atk).toBe(10)
      const full = mon(BULBASAUR, 30, { evs: evs({ hp: 100, def: 100, spa: 100, spd: 100, spe: 100, atk: 10 }) })
      expect(canUseEvItem(full, PROTEIN)).toBe(false)
      expect(applyEvItem(full, BULBASAUR, PROTEIN)).toBeNull()
    })
    it('껍질몬에게 HP업은 안 든다', () => {
      expect(canUseEvItem(mon(SHEDINJA, 30), HP_UP)).toBe(false)
      expect(canUseEvItem(mon(SHEDINJA, 30), PROTEIN)).toBe(true)
    })
    it('알에게는 안 든다', () => {
      expect(canUseEvItem(mon(BULBASAUR, 5, { isEgg: true }), PROTEIN)).toBe(false)
    })
    it('쓰러진 마리에게도 든다 — 체력은 0 그대로다 (원작은 체력을 안 본다)', () => {
      const got = applyEvItem(mon(BULBASAUR, 30, { hp: 0 }), BULBASAUR, HP_UP)!
      expect(got.mon.evs.hp).toBe(10)
      expect(got.mon.hp).toBe(0)
    })
    it('HP업은 최대 HP가 는 만큼 현재 HP도 는다', () => {
      // 노력치 36 → 46은 /4로 9 → 11, 최대 HP가 +2
      const before = mon(BULBASAUR, 50, { evs: evs({ hp: 36 }) })
      const hurt = { ...before, hp: before.hp - 5 }
      const got = applyEvItem(hurt, BULBASAUR, HP_UP)!
      const grew = maxHp(got.mon, BULBASAUR) - maxHp(before, BULBASAUR)
      expect(grew).toBeGreaterThan(0)
      expect(got.mon.hp).toBe(hurt.hp + grew)
    })
    it('친밀도 — 100 미만 +5 · 200 미만 +3 · 그 이상 +2, 255면 더 안 오른다', () => {
      const ctx = { heldEffect: 0, mapLabel: -1 }
      const at = (friendship: number): number => fieldFriendship(HP_UP, mon(BULBASAUR, 30, { friendship }), ctx)
      expect(at(99)).toBe(104)
      expect(at(100)).toBe(103)
      expect(at(199)).toBe(202)
      expect(at(200)).toBe(202)
      expect(at(254)).toBe(255)
      expect(at(255)).toBe(255)
    })
  })

  describe('노력치 깎는 열매', () => {
    const POMEG = item('ITEM_POMEG_BERRY')
    const KELPSY = item('ITEM_KELPSY_BERRY')
    it('−10이고 0 아래로 안 간다', () => {
      expect(applyEvItem(mon(BULBASAUR, 30, { evs: evs({ atk: 25 }) }), BULBASAUR, KELPSY)!.mon.evs.atk).toBe(15)
      const low = applyEvItem(mon(BULBASAUR, 30, { evs: evs({ atk: 4 }) }), BULBASAUR, KELPSY)!
      expect(low.mon.evs.atk).toBe(0)
      expect(low.evChanged).toBe(true)
    })
    it('노력치가 0이면 친밀도가 오를 수 있을 때만 쓴다 — 255면 「효과 없다」', () => {
      const zero = (friendship: number): PokemonInstance => mon(BULBASAUR, 30, { friendship })
      expect(friendshipItemEffect(zero(254), KELPSY)).toBe(true)
      expect(canUseEvItem(zero(254), KELPSY)).toBe(true)
      const got = applyEvItem(zero(254), BULBASAUR, KELPSY)!
      expect(got.evChanged).toBe(false)
      expect(canUseEvItem(zero(255), KELPSY)).toBe(false)
      expect(applyEvItem(zero(255), BULBASAUR, KELPSY)).toBeNull()
    })
    it('친밀도 +10 · +5 · +2 (100 · 200 구간)', () => {
      const ctx = { heldEffect: 0, mapLabel: -1 }
      const at = (friendship: number): number => fieldFriendship(KELPSY, mon(BULBASAUR, 30, { friendship }), ctx)
      expect(at(99)).toBe(109)
      expect(at(100)).toBe(105)
      expect(at(199)).toBe(204)
      expect(at(200)).toBe(202)
    })
    it('폼그 글리치를 안 만든다 — 최대 HP가 깎여도 서 있는 마리는 1 이상 새 최대 이하다', () => {
      // HP 노력치 116은 /4가 29, 한도에 잘린 100은 25 — 최대 HP가 4 줄고 체력 1~4짜리가 0 이하로 셈된다
      for (const hp of [1, 2, 4]) {
        const m = mon(BULBASAUR, 30, { evs: evs({ hp: 116 }), hp })
        const got = applyEvItem(m, BULBASAUR, POMEG)!
        expect(got.mon.evs.hp).toBe(100)
        expect(got.mon.hp).toBeGreaterThanOrEqual(1)
        expect(got.mon.hp).toBeLessThanOrEqual(maxHp(got.mon, BULBASAUR))
      }
      // 가득이던 마리는 새 최대로 가득이다
      const raised = mon(BULBASAUR, 30, { evs: evs({ hp: 116 }) })
      const full = { ...raised, hp: maxHp(raised, BULBASAUR) }
      const got = applyEvItem(full, BULBASAUR, POMEG)!
      expect(got.mon.hp).toBe(maxHp(got.mon, BULBASAUR))
    })
    it('글 — 깎였고 친밀도도 변했으면 110, 노력치만이면 111, 노력치가 그대로면 112, 비타민은 75', () => {
      expect(evUseLine(POMEG, true, true)).toBe('fell')
      expect(evUseLine(POMEG, true, false)).toBe('adores')
      expect(evUseLine(POMEG, false, true)).toBe('floor')
      expect(evUseLine(item('ITEM_HP_UP'), true, true)).toBe('rose')
    })
  })

  describe('포인트업 · 포인트맥스', () => {
    const slots = (ppUps: number, pp: number, move = 33): PokemonInstance => (
      mon(BULBASAUR, 30, { moves: [{ move, pp, ppUps }, { move: 45, pp: 20, ppUps: 0 }] })
    )
    it('기본 PP 35의 기술: 0→1이면 최대 42, 현재 PP도 +7', () => {
      const got = raisePpUps(slots(0, 3), 0, 35, 1)!
      expect(got.moves[0]).toEqual({ move: 33, pp: 10, ppUps: 1 })
      expect(maxPpOf(got.moves[0]!, 35)).toBe(42)
      // 다른 칸은 그대로
      expect(got.moves[1]).toEqual({ move: 45, pp: 20, ppUps: 0 })
    })
    it('포인트맥스는 0에서 3으로 — 최대 PP 기본×8/5', () => {
      const got = raisePpUps(slots(0, 35), 0, 35, 3)!
      expect(got.moves[0]!.ppUps).toBe(3)
      expect(got.moves[0]!.pp).toBe(35 + 21)
      expect(maxPpOf(got.moves[0]!, 35)).toBe(56)
    })
    it('2→3에서 포인트맥스는 한 번만 오른다', () => {
      expect(raisePpUps(slots(2, 10), 0, 20, 3)!.moves[0]!.ppUps).toBe(3)
    })
    it('이미 3이면 효과 없다', () => {
      expect(raisePpUps(slots(3, 10), 0, 20, 1)).toBeNull()
      expect(raisePpUps(slots(3, 10), 0, 20, 3)).toBeNull()
    })
    it('기본 PP가 5 미만이면 효과 없다 · 기본 PP 5는 된다', () => {
      expect(raisePpUps(slots(0, 4), 0, 4, 1)).toBeNull()
      const got = raisePpUps(slots(0, 5), 0, 5, 1)!
      expect(maxPpOf(got.moves[0]!, 5)).toBe(6)
      expect(got.moves[0]!.pp).toBe(6)
    })
    it('없는 칸은 효과 없다', () => {
      expect(raisePpUps(slots(0, 5), 3, 20, 1)).toBeNull()
    })
    it('친밀도 +5 · +3 · +2', () => {
      const ctx = { heldEffect: 0, mapLabel: -1 }
      const up = item('ITEM_PP_UP')
      const at = (friendship: number): number => fieldFriendship(up, mon(BULBASAUR, 30, { friendship }), ctx)
      expect([at(0), at(100), at(200)]).toEqual([5, 103, 202])
    })
  })

  describe('에테르 · 엘릭서 (planItemUse 위에서 돈다)', () => {
    const target = (pps: [number, number][]): ReturnType<typeof fieldTarget> => fieldTarget(
      mon(BULBASAUR, 30, { moves: pps.map(([pp], i) => ({ move: i + 1, pp, ppUps: 0 })) }),
      50,
      (s) => pps[s.move - 1]![1],
    )
    it('에테르는 고른 칸만 10 채우고, 칸을 안 주면 효과 없다', () => {
      const t = target([[3, 20], [5, 20]])
      expect(planItemUse(item('ITEM_ETHER'), t, 1)!.pp).toEqual([{ slot: 1, amount: 10 }])
      expect(planItemUse(item('ITEM_ETHER'), t)).toBeNull()
    })
    it('에테르는 10을 넘기지 않고 맥스에테르는 가득이다', () => {
      expect(planItemUse(item('ITEM_ETHER'), target([[15, 20]]), 0)!.pp).toEqual([{ slot: 0, amount: 5 }])
      expect(planItemUse(item('ITEM_ETHER'), target([[1, 30]]), 0)!.pp).toEqual([{ slot: 0, amount: 10 }])
      expect(planItemUse(item('ITEM_MAX_ETHER'), target([[1, 20]]), 0)!.pp).toEqual([{ slot: 0, amount: 19 }])
    })
    it('이미 가득이면 효과 없다', () => {
      expect(planItemUse(item('ITEM_ETHER'), target([[20, 20]]), 0)).toBeNull()
    })
    it('잎새열매는 에테르와 같다 (10)', () => {
      expect(planItemUse(item('ITEM_LEPPA_BERRY'), target([[1, 20]]), 0)!.pp).toEqual([{ slot: 0, amount: 10 }])
    })
    it('엘릭서는 칸을 안 묻고 네 칸을 다 채운다', () => {
      const t = target([[1, 20], [20, 20], [15, 20]])
      expect(planItemUse(item('ITEM_ELIXIR'), t)!.pp).toEqual([{ slot: 0, amount: 10 }, { slot: 2, amount: 5 }])
      expect(planItemUse(item('ITEM_MAX_ELIXIR'), t)!.pp).toEqual([{ slot: 0, amount: 19 }, { slot: 2, amount: 5 }])
    })
  })

  describe('성스러운재', () => {
    it('쓰러진 마리를 앞에서부터 전부 찾는다 — 알과 서 있는 마리는 거른다', () => {
      const party = [
        mon(BULBASAUR, 5, { hp: 0 }), mon(BULBASAUR, 5), mon(BULBASAUR, 5, { hp: 0 }),
        mon(BULBASAUR, 5, { hp: 0, isEgg: true }),
      ]
      expect(faintedSlots(party)).toEqual([0, 2])
      expect(faintedSlots([mon(BULBASAUR, 5)])).toEqual([])
    })
    it('최대 체력으로 살린다 — 상태는 안 건드린다', () => {
      const down = mon(BULBASAUR, 20, { hp: 0, status: 'brn' })
      const up = reviveFull(down, maxHp(down, BULBASAUR))
      expect(up.hp).toBe(maxHp(down, BULBASAUR))
      expect(up.status).toBe('brn')
    })
  })
})
