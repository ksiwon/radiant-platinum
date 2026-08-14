// 등록할 수 있는 도구 (PARITY §4.4)
//
// ⚠️ **롬 표의 비트 하나가 정본이다** (`ITEM_PARAM_CAN_REGISTER`). 목록을 손으로
// 적으면 롬을 다시 뽑을 때 조용히 어긋나므로, 여기서는 **수와 성질만** 못 박는다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { itemFileSchema } from '../../data/schema'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('items.json')

maybe('등록할 수 있는 도구', () => {
  const file = itemFileSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'items.json'), 'utf8')),
  )
  const can = file.items.flatMap((it, id) => (it?.canRegister === 1 ? [{ id, it }] : []))

  it('열아홉 가지다', () => {
    expect(can).toHaveLength(19)
  })

  it('⚠️ 전부 소중한 물건 주머니다 — 늘어놓고 쓰는 것이 아니다', () => {
    // `POCKET_KEY_ITEMS`. 주머니 번호는 도구표가 준다
    const pockets = new Set(can.map((c) => c.it.pocket))
    expect(pockets.size).toBe(1)
  })

  it('⚠️ 전부 못 버리는 물건이다 — 버리면 등록만 남는다', () => {
    for (const c of can) expect(c.it.preventToss, c.it.constant).toBe(1)
  })

  it('자전거와 낚싯대 셋이 들어 있다 — 필드에서 제일 자주 쓰는 것들이다', () => {
    const names = new Set(can.map((c) => c.it.constant))
    for (const want of ['ITEM_BICYCLE', 'ITEM_OLD_ROD', 'ITEM_GOOD_ROD', 'ITEM_SUPER_ROD']) {
      expect(names.has(want), want).toBe(true)
    }
  })

  it('⚠️ 몬스터볼·상처약처럼 여러 개 드는 것은 없다', () => {
    const bad = can.filter((c) => c.it.constant.startsWith('ITEM_TM')
      || c.it.constant === 'ITEM_POKE_BALL' || c.it.constant === 'ITEM_POTION')
    expect(bad).toEqual([])
  })
})
