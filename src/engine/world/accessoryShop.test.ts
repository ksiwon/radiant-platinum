import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACCESSORY_SHOP, FLOWER_SHOP_TEXT, runAccessoryShop, type AccessoryShopHost } from './accessoryShop'

/** 대본대로 답하는 가게 손님 — 무엇을 들었는지 적는다 */
function guest(answers: { list: (number | null)[], yes: boolean[] }, bag: Map<number, number>, owned = new Set<number>()) {
  const said: number[] = []
  const host: AccessoryShopHost = {
    say: async (text) => { said.push(text) },
    yesNo: async (text) => { said.push(text); return answers.yes.shift() ?? false },
    list: async (text, entries) => {
      said.push(text)
      expect(entries).toHaveLength(ACCESSORY_SHOP.length + 1)
      return answers.list.shift() ?? null
    },
    line: (text, slots) => `${String(text)}:${slots.join(',')}`,
    accessoryName: (a) => `acc${String(a)}`,
    berryName: (b) => `berry${String(b)}`,
    quantity: (item) => bag.get(item) ?? 0,
    removeItem: (item, count) => {
      const have = bag.get(item) ?? 0
      if (have < count) return false
      bag.set(item, have - count)
      return true
    },
    canFit: (a) => !owned.has(a),
    addAccessory: (a) => { owned.add(a) },
  }
  return { host, said, owned }
}

describe('꽃집 장식 교환', () => {
  it('열매가 있으면 바꾸고, 목록으로 돌아와 B로 나간다', async () => {
    const bag = new Map([[149, 3]])
    const { host, said, owned } = guest({ list: [0, null], yes: [true] }, bag)
    await runAccessoryShop(host)
    expect(owned.has(50)).toBe(true)
    expect(bag.get(149)).toBe(2)
    const T = FLOWER_SHOP_TEXT
    expect(said).toEqual([T.greet, T.purchase, T.confirm, T.success, T.got, T.purchase, T.comeAgain])
  })

  it('모자라면 그렇다고 하고 목록으로 · 이미 가진 하나뿐인 장식은 못 받는다', async () => {
    const bag = new Map([[164, 9], [175, 50]])
    const { host, said } = guest({ list: [8, 13, ACCESSORY_SHOP.length], yes: [true, true] }, bag, new Set([63]))
    await runAccessoryShop(host)
    const T = FLOWER_SHOP_TEXT
    expect(said).toEqual([
      T.greet, T.purchase, T.confirm, T.notEnough, T.purchase, T.confirm, T.cantCarry, T.purchase, T.comeAgain,
    ])
    expect(bag.get(175)).toBe(50)
  })

  it('다 받았으면 인사 뒤 고맙다고만 한다', async () => {
    const all = new Set(ACCESSORY_SHOP.map((r) => r.accessory))
    const { host, said } = guest({ list: [], yes: [] }, new Map(), all)
    await runAccessoryShop(host)
    expect(said).toEqual([FLOWER_SHOP_TEXT.greet, FLOWER_SHOP_TEXT.thanks])
  })

  it('마지막 하나를 받으면 「전부 교환했다」와 고맙다로 끝난다', async () => {
    const all = new Set(ACCESSORY_SHOP.map((r) => r.accessory).filter((a) => a !== 71))
    const { host, said } = guest({ list: [21], yes: [true] }, new Map([[183, 100]]), all)
    await runAccessoryShop(host)
    const T = FLOWER_SHOP_TEXT
    expect(said.slice(-4)).toEqual([T.success, T.got, T.tradedAll, T.thanks])
  })
})

const SRC = 'raw/decomp/src/overlay007/accessory_shop.c'
const ACC = 'raw/decomp/generated/accessories.txt'
const ITEMS = 'raw/decomp/generated/items.txt'

describe.runIf(existsSync(SRC) && existsSync(ACC) && existsSync(ITEMS))('원작과 맞대기', () => {
  it('표 스물둘 — 장식 · 나무열매 · 개수', () => {
    const src = readFileSync(SRC, 'utf8')
    const acc = readFileSync(ACC, 'utf8').split(/\r?\n/).filter((l) => l !== 'NON_UNIQUE_ACCESSORY_COUNT')
      .map((l) => l.replace(/ = .*/, ''))
    const items = readFileSync(ITEMS, 'utf8').split(/\r?\n/)
    const rows = [...src.matchAll(/\{ (ACCESSORY_\w+), BERRY_ID\((\w+)\), (\d+) \}/g)]
    expect(rows).toHaveLength(ACCESSORY_SHOP.length)
    rows.forEach(([, a, b, n], i) => {
      expect(ACCESSORY_SHOP[i]).toEqual({
        accessory: acc.indexOf(a!), berry: items.indexOf(`ITEM_${b!}_BERRY`), count: Number(n),
      })
    })
  })
})
