// 트레이너가 쓰는 회복 도구.
//
// 두 가지를 본다: **개수가 롬 그대로인가**(우리가 정한 값이 아니어야 한다)와
// **언제 쓰는가**가 `TrainerAI_ShouldUseItem` 그대로인가.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { healAmount, TrainerItems, type ItemTarget } from './trainerItems'
import type { Item } from '../../../data/schema'

const root = resolve(__dirname, '../../../../public/data')
const items = (JSON.parse(readFileSync(resolve(root, 'items.json'), 'utf8')) as {
  items: Item[]
}).items
const trainers = (JSON.parse(readFileSync(resolve(root, 'trainers.json'), 'utf8')) as {
  trainers: { id: number; items: number[]; party: unknown[] }[]
}).trainers

const table = { get: (id: number) => items[id]! }
const idOf = (name: string): number => items.findIndex((i) => i.name === name)

const POTION = idOf('potion')
const SUPER_POTION = idOf('super_potion')
const HYPER_POTION = idOf('hyper_potion')
const FULL_RESTORE = idOf('full_restore')

/** 성한 상태. 필요한 값만 덮어써서 쓴다 */
const well = (over: Partial<ItemTarget> = {}): ItemTarget =>
  ({ hp: 100, maxHp: 100, status: 'ok', confused: false, ...over })

describe('개수는 롬이 정한다', () => {
  // 사용자가 물은 그대로다 — 라이벌·관장·사천왕·챔피언이 몇 개를 쓰는가.
  // 우리가 고른 값이 아니라 `trainers.json`에 적힌 값이라는 것을 못박는다
  const cases: [string, number, number[]][] = [
    ['체육관 관장 강석', 246, [POTION, POTION]],
    ['체육관 관장 동관', 250, [HYPER_POTION, FULL_RESTORE]],
    ['체육관 관장 유채', 315, [SUPER_POTION, SUPER_POTION]],
    ['사천왕 오엽', 264, [FULL_RESTORE, FULL_RESTORE]],
    ['챔피언 난천', 267, [FULL_RESTORE, FULL_RESTORE, FULL_RESTORE, FULL_RESTORE]],
    ['라이벌 펄 (챔피언로드)', 837, [FULL_RESTORE, FULL_RESTORE]],
    ['라이벌 펄 (재대결)', 871, [FULL_RESTORE, FULL_RESTORE, FULL_RESTORE, FULL_RESTORE]],
  ]
  for (const [who, id, want] of cases) {
    it(`${who}`, () => {
      expect(trainers[id]!.items).toEqual(want)
    })
  }

  it('도구를 든 트레이너는 928명 중 88명이다', () => {
    expect(trainers.filter((t) => t.items.length > 0)).toHaveLength(88)
  })
})

describe('언제 쓰는가', () => {
  it('회복약은 체력이 ¼ 아래로 떨어져야 쓴다', () => {
    const bag = () => new TrainerItems([FULL_RESTORE], table)
    // 25/100은 ¼이지 ¼ 미만이 아니다 — 원본이 `<`다
    expect(bag().decide(well({ hp: 25 }), 1)).toBeNull()
    expect(bag().decide(well({ hp: 24 }), 1)).toEqual({ kind: 'fullRestore', item: FULL_RESTORE })
  })

  it('회복약은 상태이상만 보고는 안 쓴다', () => {
    const bag = new TrainerItems([FULL_RESTORE], table)
    expect(bag.decide(well({ status: 'slp' }), 1)).toBeNull()
    expect(bag.left).toBe(1)
  })

  it('상처약은 채울 양이 안 남으면 쓴다 — ¼까지 안 기다린다', () => {
    // 상처약은 20을 채운다. 100 중 21이 깎였으면 버리는 칸이 없다
    const bag = () => new TrainerItems([POTION], table)
    expect(bag().decide(well({ hp: 80 }), 1)).toBeNull()
    expect(bag().decide(well({ hp: 79 }), 1)).toEqual({ kind: 'hp', item: POTION })
  })

  it('만능치료제는 걸린 것이 있어야 쓴다', () => {
    const full = idOf('full_heal')
    const bag = () => new TrainerItems([full], table)
    expect(bag().decide(well(), 1)).toBeNull()
    expect(bag().decide(well({ status: 'par' }), 1)).toEqual({ kind: 'status', item: full })
    expect(bag().decide(well({ confused: true }), 1)).toEqual({ kind: 'status', item: full })
  })

  it('쓰러진 마리에게는 안 쓴다', () => {
    const bag = new TrainerItems([FULL_RESTORE], table)
    expect(bag.decide(well({ hp: 0 }), 1)).toBeNull()
  })
})

describe('뒤 칸은 남은 마리가 줄어야 열린다', () => {
  // 원본: `i == 0 || aliveMons <= trainerItemCounts - i + 1`
  it('난천의 회복약 넷은 한꺼번에 안 나온다', () => {
    const hurt = well({ hp: 1 })
    // 여섯 마리 다 살아 있을 때는 첫 칸만 열린다
    const six = new TrainerItems(trainers[267]!.items, table)
    expect(six.decide(hurt, 6)).not.toBeNull()
    expect(six.left, '여섯 마리일 때 한 개만 나가야 한다').toBe(3)

    // 네 마리면 둘째 칸까지 열려서 두 개가 같이 지워진다 — 원작의 그 동작이다
    const four = new TrainerItems(trainers[267]!.items, table)
    four.decide(hurt, 4)
    expect(four.left, '네 마리일 때 두 칸이 열린다').toBe(2)
  })

  it('상처약 두 개를 든 강석은 세 마리일 때 한 개만 연다', () => {
    const bag = new TrainerItems(trainers[246]!.items, table)
    bag.decide(well({ hp: 1 }), 3)
    expect(bag.left).toBe(1)
  })

  it('다 쓰면 더 안 나온다', () => {
    const bag = new TrainerItems([POTION], table)
    expect(bag.decide(well({ hp: 1 }), 1)).not.toBeNull()
    expect(bag.decide(well({ hp: 1 }), 1)).toBeNull()
    expect(bag.left).toBe(0)
  })
})

describe('얼마나 채우는가', () => {
  it('상처약은 20, 좋은상처약은 50, 고급상처약은 200', () => {
    const target = well({ hp: 1, maxHp: 400 })
    const amount = (id: number) =>
      healAmount({ kind: 'hp', item: id }, target, table.get(id))
    expect(amount(POTION)).toBe(20)
    expect(amount(SUPER_POTION)).toBe(50)
    expect(amount(HYPER_POTION)).toBe(200)
  })

  it('회복약은 다 채운다', () => {
    const target = well({ hp: 1, maxHp: 400 })
    expect(healAmount({ kind: 'fullRestore', item: FULL_RESTORE }, target, table.get(FULL_RESTORE)))
      .toBe(399)
  })

  it('넘치게는 안 채운다', () => {
    const target = well({ hp: 95, maxHp: 100 })
    expect(healAmount({ kind: 'hp', item: HYPER_POTION }, target, table.get(HYPER_POTION))).toBe(5)
  })
})
