// 배틀에서 가방 도구가 무엇을 하는가.
//
// **값을 시험에 적지 않는다.** 상처약이 20을 채운다는 것도 `items.json`이
// 갖고 있고, 이 시험은 그 값이 규칙을 타고 제대로 나오는지만 본다. 다만
// 255·254·253과 127은 개수가 아니라 표지라서, 그 넷은 자리를 못박는다
// (`battle_system.c`의 `switch (param)`).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  BATTLE_POCKET, friendshipGain, isEscapeItem, needsMoveSlot, needsTarget, planItemUse,
  type ItemTarget,
} from './bagItem'
import type { Item } from '../../../data/schema'

const root = resolve(__dirname, '../../../../public/data')
const items = (JSON.parse(readFileSync(resolve(root, 'items.json'), 'utf8')) as {
  items: Item[]
}).items
const idOf = (name: string): number => items.findIndex((i) => i.name === name)
const it_ = (name: string): Item => items[idOf(name)]!

const POTION = it_('potion')
const HYPER_POTION = it_('hyper_potion')
const FULL_RESTORE = it_('full_restore')
const FULL_HEAL = it_('full_heal')
const ANTIDOTE = it_('antidote')
const REVIVE = it_('revive')
const MAX_REVIVE = it_('max_revive')
const SITRUS = it_('sitrus_berry')
const X_ATTACK = it_('x_attack')
const DIRE_HIT = it_('dire_hit')
const GUARD_SPEC = it_('guard_spec')
const ETHER = it_('ether')
const MAX_ETHER = it_('max_ether')
const ELIXIR = it_('elixir')
const POKE_DOLL = it_('poke_doll')
const ENERGY_POWDER = it_('energypowder')

/** 나와 있고 멀쩡한 한 마리. 필요한 값만 덮어써서 쓴다 */
const out = (over: Partial<ItemTarget> = {}): ItemTarget => ({
  hp: 100, maxHp: 100, status: 'ok', fainted: false, active: true,
  confused: false, attracted: false, boosts: {}, focusEnergy: false, mist: false,
  moves: [{ pp: 10, maxPp: 10 }, { pp: 10, maxPp: 10 }],
  ...over,
})

describe('회복량 칸의 255·254·253은 개수가 아니다', () => {
  it('풀회복약(255)은 전부 채운다', () => {
    expect(planItemUse(FULL_RESTORE, out({ hp: 1 }))?.heal).toBe(99)
  })

  it('기력의조각(254)은 절반이다', () => {
    const plan = planItemUse(REVIVE, out({ hp: 0, fainted: true, active: false }))
    expect(plan).toMatchObject({ revive: true, heal: 50 })
  })

  it('자뭉열매(253)는 ¼이다', () => {
    expect(planItemUse(SITRUS, out({ hp: 1 }))?.heal).toBe(25)
  })

  it('절반·¼이 0으로 떨어지면 1로 올린다', () => {
    // 최대 HP 3의 절반은 1.5 → 1. 최대 HP 3의 ¼은 0.75 → 0이라 1로 올라간다
    const tiny = { hp: 0, maxHp: 3, fainted: true, active: false }
    expect(planItemUse(REVIVE, out(tiny))?.heal).toBe(1)
    expect(planItemUse(SITRUS, out({ hp: 1, maxHp: 3 }))?.heal).toBe(1)
  })

  it('넘치는 만큼은 안 채운다', () => {
    // 고급상급 200짜리를 3만 깎인 애에게 써도 3만 들어간다
    expect(planItemUse(HYPER_POTION, out({ hp: 97 }))?.heal).toBe(3)
  })

  it('상처약 20은 자료에 적힌 값 그대로다', () => {
    expect(planItemUse(POTION, out({ hp: 1 }))?.heal).toBe(POTION.param?.hpRestored)
  })
})

describe('아무 일도 안 일어나면 못 쓴다', () => {
  it('멀쩡한 애에게 상처약', () => {
    expect(planItemUse(POTION, out())).toBeNull()
  })

  it('안 걸린 상태이상을 푸는 약', () => {
    expect(planItemUse(ANTIDOTE, out({ status: 'brn' }))).toBeNull()
    expect(planItemUse(ANTIDOTE, out({ status: 'psn' }))).toMatchObject({ cure: ['psn'] })
  })

  it('맹독도 해독제로 낫는다', () => {
    expect(planItemUse(ANTIDOTE, out({ status: 'tox' }))?.cure).toEqual(['tox'])
  })

  it('쓰러진 애에게 상처약, 서 있는 애에게 기력의조각', () => {
    expect(planItemUse(POTION, out({ hp: 0, fainted: true, active: false }))).toBeNull()
    expect(planItemUse(REVIVE, out({ hp: 50 }))).toBeNull()
  })

  it('랭크가 이미 +6이면 플러스파워가 안 먹는다', () => {
    expect(planItemUse(X_ATTACK, out({ boosts: { atk: 6 } }))).toBeNull()
    expect(planItemUse(X_ATTACK, out({ boosts: { atk: 5 } }))?.boosts).toEqual(['atk'])
  })

  it('PP가 가득 찬 칸에는 PP에이드가 안 먹는다', () => {
    expect(planItemUse(ETHER, out(), 0)).toBeNull()
    // 20짜리 칸이 3 남았으면 10을 다 넣는다
    expect(planItemUse(ETHER, out({ moves: [{ pp: 3, maxPp: 20 }] }), 0))
      .toMatchObject({ pp: [{ slot: 0, amount: ETHER.param?.ppRestored }] })
    // 넘치는 만큼은 안 넣는다 — 원본의 `Pokemon_IncreaseValue`가 최대치에서 멈춘다
    expect(planItemUse(ETHER, out({ moves: [{ pp: 3, maxPp: 10 }] }), 0)?.pp)
      .toEqual([{ slot: 0, amount: 7 }])
  })

  it('흰안개가 이미 깔려 있으면 이펙트가드가 안 먹는다', () => {
    expect(planItemUse(GUARD_SPEC, out({ mist: true }))).toBeNull()
    expect(planItemUse(GUARD_SPEC, out())?.mist).toBe(true)
  })
})

describe('벤치에 있는 애에게는 안 걸리는 것이 있다', () => {
  // 원본의 `selectedSlot == partySlot || targetSlot == partySlot`.
  // 랭크·급소·혼란·헤롱헤롱은 배틀 개체에만 있는 값이라 벤치에는 자리가 없다
  const bench = (over: Partial<ItemTarget> = {}) => out({ active: false, ...over })

  it('플러스파워·크리티컬커터는 나와 있는 애에게만', () => {
    expect(planItemUse(X_ATTACK, bench())).toBeNull()
    expect(planItemUse(DIRE_HIT, bench())).toBeNull()
  })

  it('체력·상태이상은 벤치에도 듣는다', () => {
    expect(planItemUse(POTION, bench({ hp: 1 }))?.heal).toBe(POTION.param?.hpRestored)
    expect(planItemUse(ANTIDOTE, bench({ status: 'psn' }))?.cure).toEqual(['psn'])
  })

  it('이펙트가드만 자리를 안 가린다 — 진영에 걸리기 때문이다', () => {
    expect(planItemUse(GUARD_SPEC, bench())?.mist).toBe(true)
  })
})

describe('PP 도구', () => {
  it('PP회복(127)은 그 칸을 가득 채운다', () => {
    const target = out({ moves: [{ pp: 1, maxPp: 24 }] })
    expect(planItemUse(MAX_ETHER, target, 0)?.pp).toEqual([{ slot: 0, amount: 23 }])
  })

  it('PP에이더는 네 칸을 한꺼번에 채운다 — 칸을 안 묻는다', () => {
    const target = out({ moves: [{ pp: 0, maxPp: 10 }, { pp: 10, maxPp: 10 }, { pp: 5, maxPp: 15 }] })
    expect(planItemUse(ELIXIR, target)?.pp).toEqual([{ slot: 0, amount: 10 }, { slot: 2, amount: 10 }])
    expect(needsMoveSlot(ELIXIR)).toBe(false)
    expect(needsMoveSlot(ETHER)).toBe(true)
  })
})

describe('회복약은 체력과 상태이상을 같이 본다', () => {
  it('둘 다 걸려 있으면 둘 다 한다', () => {
    expect(planItemUse(FULL_RESTORE, out({ hp: 1, status: 'brn' })))
      .toMatchObject({ heal: 99, cure: ['brn'] })
  })

  it('체력이 가득이어도 상태이상 때문에 쓸 수 있다', () => {
    expect(planItemUse(FULL_RESTORE, out({ status: 'slp' })))
      .toMatchObject({ heal: 0, cure: ['slp'] })
  })

  it('만병통치제는 혼란도 푼다 — 나와 있을 때만', () => {
    expect(planItemUse(FULL_HEAL, out({ confused: true }))?.clear).toEqual(['confusion'])
    expect(planItemUse(FULL_HEAL, out({ confused: true, active: false }))).toBeNull()
  })
})

describe('원작 배틀 가방의 갈래', () => {
  it('회복 탭은 HP와 PP를 같이 담는다 — 주머니는 넷이다', () => {
    // `sBattlePocketIndexes`가 PP 비트를 `RECOVER_HP_PP`로 보낸다
    const hpTab = BATTLE_POCKET.hp | BATTLE_POCKET.pp
    expect((ETHER.battlePocket ?? 0) & hpTab).toBeGreaterThan(0)
    expect((POTION.battlePocket ?? 0) & hpTab).toBeGreaterThan(0)
  })

  it('배틀용·볼은 대상을 안 묻고 회복·상태·PP는 묻는다', () => {
    expect(needsTarget(X_ATTACK)).toBe(false)
    expect(needsTarget(POKE_DOLL)).toBe(false)
    expect(needsTarget(POTION)).toBe(true)
    expect(needsTarget(ANTIDOTE)).toBe(true)
    expect(needsTarget(ETHER)).toBe(true)
  })

  it('도망 도구는 둘뿐이다', () => {
    const escapes = items.filter((i) => (i.battlePocket ?? 0) !== 0 && isEscapeItem(i))
    expect(escapes.map((i) => i.name)).toEqual(['poke_doll', 'fluffy_tail'])
  })
})

describe('친밀도는 지금 값이 구간을 고른다', () => {
  it('힘의가루는 낮을수록 덜 깎는다', () => {
    expect(friendshipGain(ENERGY_POWDER, 50)).toBe(ENERGY_POWDER.param?.friendshipLow)
    expect(friendshipGain(ENERGY_POWDER, 150)).toBe(ENERGY_POWDER.param?.friendshipMed)
    expect(friendshipGain(ENERGY_POWDER, 250)).toBe(ENERGY_POWDER.param?.friendshipHigh)
    // 세 구간이 다 음수다 — 쓴 약이라 미움받는다
    for (const f of [50, 150, 250]) expect(friendshipGain(ENERGY_POWDER, f)).toBeLessThan(0)
  })

  it('플러스파워는 높은 구간 칸이 없어서 200부터는 안 오른다', () => {
    expect(friendshipGain(X_ATTACK, 50)).toBeGreaterThan(0)
    expect(friendshipGain(X_ATTACK, 250)).toBe(0)
  })

  it('상처약은 친밀도를 안 건드린다', () => {
    expect(friendshipGain(POTION, 100)).toBe(0)
  })
})

describe('되살리기', () => {
  it('기력의덩어리는 전부 채운다', () => {
    const plan = planItemUse(MAX_REVIVE, out({ hp: 0, fainted: true, active: false }))
    expect(plan).toMatchObject({ revive: true, heal: 100 })
  })
})
