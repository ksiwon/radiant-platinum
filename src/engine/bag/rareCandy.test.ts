// 이상한사탕 검증 (`docs/orders/RARE_CANDY_20260917.md`)
//
// **진짜 종족표와 도구표 위에서 잰다.** 값은 원작의 식(`Pokemon_CalcStats` ·
// `RestorePokemonHP` · `UpdatePokemonFriendship`)을 손으로 따라가 얻었다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { itemFileSchema, speciesFileSchema, type Item, type Species } from '../../data/schema'
import { withData } from '../../data/romData.testkit'
import { expForLevel, MAX_LEVEL } from '../pokemon/exp'
import { HOLD_EFFECT_FRIENDSHIP_UP, LUXURY_BALL } from '../pokemon/friendship'
import { createWild, maxHp, statsOf, type PokemonInstance } from '../pokemon/instance'
import { canLevelUp, fieldFriendship, isLevelUpItem, levelUpOnce } from './rareCandy'

const DATA = resolve(__dirname, '../../../public/data')

withData('items.json', 'species.json')('이상한사탕', () => {
  const items = itemFileSchema.parse(JSON.parse(readFileSync(resolve(DATA, 'items.json'), 'utf8'))).items
  const species = speciesFileSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'species.json'), 'utf8')),
  ).species
  const byId = new Map(species.map((s) => [s.id, s]))
  const item = (constant: string): Item => items.find((x) => x.constant === constant)!
  const kind = (id: number): Species => byId.get(id)!
  const CANDY = item('ITEM_RARE_CANDY')
  const STARLY = kind(396)
  const SHEDINJA = kind(292)

  /** 늘 같은 개체 — 난수를 0.5로 못 박는다 */
  const mon = (of: Species, level: number, extra: Partial<PokemonInstance> = {}): PokemonInstance => {
    const one = createWild({ species: of, level, rng: () => 0.5, otId: 1, otSecretId: 2 })
    return { ...one, hp: maxHp(one, of), ...extra }
  }

  it('레벨업 칸이 선 도구는 이상한사탕 하나뿐이다', () => {
    const lifting = items.filter(isLevelUpItem)
    expect(lifting.map((x) => x.constant)).toEqual(['ITEM_RARE_CANDY'])
    // 회복 갈래(1)에 들어 있어서 파티 화면이 먼저 갈라야 한다
    expect(CANDY.fieldUseFunc).toBe(1)
  })

  it('한 레벨 오르고, 경험치는 새 레벨의 시작값이 된다', () => {
    const before = mon(STARLY, 4)
    const got = levelUpOnce(before, STARLY)!
    expect(got.mon.level).toBe(5)
    expect(got.mon.exp).toBe(expForLevel(STARLY.growthRate, 5))
    // 오르기 전후 능력치는 그 레벨의 실능력치다
    expect(got.before).toEqual(statsOf(before, STARLY))
    expect(got.after).toEqual(statsOf(got.mon, STARLY))
  })

  it('경험치가 구간 한가운데여도 딱 다음 레벨의 시작값으로 간다', () => {
    const start = mon(STARLY, 8)
    const midway = { ...start, exp: start.exp + 17 }
    const got = levelUpOnce(midway, STARLY)!
    expect(got.mon.level).toBe(9)
    expect(got.mon.exp).toBe(expForLevel(STARLY.growthRate, 9))
  })

  it('그 레벨에서 배우는 기술을 돌려준다 — 찌르꼬 L9는 날개치기', () => {
    const got = levelUpOnce(mon(STARLY, 8), STARLY)!
    expect(got.moves).toEqual([17])
    expect(levelUpOnce(mon(STARLY, 9), STARLY)!.moves).toEqual([])
  })

  it('서 있는 마리는 최대 체력이 는 만큼 체력도 는다', () => {
    const full = mon(STARLY, 10)
    const hurt = { ...full, hp: 7 }
    const got = levelUpOnce(hurt, STARLY)!
    expect(got.after.hp).toBeGreaterThan(got.before.hp)
    expect(got.mon.hp).toBe(7 + (got.after.hp - got.before.hp))
    // 가득이었으면 가득으로 남는다
    const top = levelUpOnce(full, STARLY)!
    expect(top.mon.hp).toBe(top.after.hp)
  })

  it('쓰러진 마리는 최대 체력이 는 만큼으로 되살아난다', () => {
    const down = mon(STARLY, 10, { hp: 0 })
    const got = levelUpOnce(down, STARLY)!
    const grew = got.after.hp - got.before.hp
    expect(grew).toBeGreaterThan(0)
    expect(got.mon.hp).toBe(grew)
  })

  it('껍질몬은 서 있든 쓰러졌든 체력 1이다', () => {
    expect(levelUpOnce(mon(SHEDINJA, 20), SHEDINJA)!.mon.hp).toBe(1)
    expect(levelUpOnce(mon(SHEDINJA, 20, { hp: 0 }), SHEDINJA)!.mon.hp).toBe(1)
  })

  it('레벨 100과 알에게는 안 든다', () => {
    const top = mon(STARLY, MAX_LEVEL)
    expect(canLevelUp(top)).toBe(false)
    expect(levelUpOnce(top, STARLY)).toBeNull()
    expect(canLevelUp({ ...mon(STARLY, 5), isEgg: true })).toBe(false)
    expect(canLevelUp(mon(STARLY, 99))).toBe(true)
  })

  it('친밀도는 구간마다 5 · 3 · 2', () => {
    const ctx = { heldEffect: 0, mapLabel: 999 }
    expect(fieldFriendship(CANDY, mon(STARLY, 5, { friendship: 70 }), ctx)).toBe(75)
    expect(fieldFriendship(CANDY, mon(STARLY, 5, { friendship: 150 }), ctx)).toBe(153)
    expect(fieldFriendship(CANDY, mon(STARLY, 5, { friendship: 254 }), ctx)).toBe(255)
    expect(fieldFriendship(CANDY, mon(STARLY, 5, { friendship: 255 }), ctx)).toBe(255)
  })

  it('평온의방울은 먼저 곱하고, 럭셔리볼·알 자리는 그 뒤에 더한다', () => {
    const base = mon(STARLY, 5, { friendship: 70, ball: LUXURY_BALL })
    const egg = { ...base, origin: { ...base.origin, egg: { ...base.origin.egg, location: 7 } } }
    // 5 × 150 / 100 = 7 → +1(럭셔리볼) +1(알 자리) = 9. 더한 뒤 곱했으면 10이다
    expect(fieldFriendship(CANDY, egg, { heldEffect: HOLD_EFFECT_FRIENDSHIP_UP, mapLabel: 7 })).toBe(70 + 9)
    // 방울만. ⚠️ 알 출신이 아닌 마리의 알 자리는 0이라 지역 번호 0에서는 +1이 붙는다 —
    // 원작도 그냥 견준다. 그래서 여기서는 0이 아닌 자리를 넘긴다
    expect(fieldFriendship(CANDY, { ...base, ball: 0 }, { heldEffect: HOLD_EFFECT_FRIENDSHIP_UP, mapLabel: 7 }))
      .toBe(70 + 7)
  })

  it('쓴맛 약은 필드에서도 친밀도를 깎는다 — 보정은 안 붙는다', () => {
    const powder = item('ITEM_ENERGYPOWDER')
    const one = mon(STARLY, 5, { friendship: 70, ball: LUXURY_BALL })
    const got = fieldFriendship(powder, one, { heldEffect: HOLD_EFFECT_FRIENDSHIP_UP, mapLabel: one.origin.egg.location })
    expect(got).toBeLessThan(70)
    expect(got).toBe(70 + (powder.param?.friendshipLow ?? 0))
    // 0 아래로 안 간다
    expect(fieldFriendship(powder, { ...one, friendship: 0 }, { heldEffect: 0, mapLabel: 0 })).toBe(0)
  })

  it('친밀도 칸이 없는 도구는 그대로 둔다', () => {
    const potion = item('ITEM_POTION')
    expect(fieldFriendship(potion, mon(STARLY, 5, { friendship: 70 }), { heldEffect: 0, mapLabel: 0 })).toBe(70)
  })
})
