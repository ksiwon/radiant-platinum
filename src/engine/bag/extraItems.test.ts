// 롬 밖의 도구 둘 (PARITY §12)
//
// 여기서 재는 것은 **두 곳에 적힌 값이 어긋나지 않았는가** 하나다. 아틀라스를
// 굽는 쪽이 CJS 도구라 아이콘 번호가 `tools/extract/extraItemsModule.cjs`에도
// 있는데, 한쪽만 고치면 가방에 엉뚱한 그림이 뜨고 아무도 못 알아챈다.
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import {
  EXTRA_ITEMS, EXTRA_ITEM_DESCRIPTIONS, EXTRA_ITEM_NAMES, FIRST_EXTRA_ITEM,
  ITEM_LINKING_CORD, ITEM_PRISM_SCALE, withExtraItems,
} from './extraItems'

interface IconRow { id: number; icon: number; palette: number }
interface Mirror { FIRST_EXTRA_ITEM: number; EXTRA_ITEM_ICONS: IconRow[] }
const mirror = createRequire(import.meta.url)(
  '../../../tools/extract/extraItemsModule.cjs',
) as Mirror

it('번호가 롬 표 바로 뒤에 이어진다', () => {
  expect(FIRST_EXTRA_ITEM).toBe(468)
  expect(ITEM_LINKING_CORD).toBe(FIRST_EXTRA_ITEM)
  expect(ITEM_PRISM_SCALE).toBe(FIRST_EXTRA_ITEM + 1)
  EXTRA_ITEMS.forEach((it, i) => { expect(it.dataID).toBe(FIRST_EXTRA_ITEM + i) })
})

it('⚠️ 아이콘 번호가 굽는 쪽과 같다', () => {
  expect(mirror.FIRST_EXTRA_ITEM).toBe(FIRST_EXTRA_ITEM)
  expect(mirror.EXTRA_ITEM_ICONS).toEqual(
    EXTRA_ITEMS.map((it) => ({ id: it.dataID, icon: it.icon, palette: it.palette })),
  )
})

it('⚠️ 연결의 끈은 남의 칸을 안 빌린다 — 다른 그림이다', () => {
  const [cord, scale] = EXTRA_ITEMS
  expect(cord!.icon).not.toBe(scale!.icon)
  // 381은 어느 도구도 안 쓰는 3세대 잔재다 (`unused_381`)
  expect(cord!.icon).toBe(381)
  expect(cord!.palette).toBe(382)
})

it('진화의돌과 같은 자리에서 열린다', () => {
  // 20 = `FieldUse.EVO_STONE`. 이게 아니면 가방에서 골라도 파티가 안 열린다
  for (const it of EXTRA_ITEMS) {
    expect(it.fieldUseFunc, it.name).toBe(20)
    expect(it.pocket, it.name).toBe(0)
  }
})

it('세 나라 말이 다 있고 길이가 같다', () => {
  for (const table of [EXTRA_ITEM_NAMES, EXTRA_ITEM_DESCRIPTIONS]) {
    for (const locale of ['ko', 'en', 'ja']) {
      expect(table[locale], locale).toHaveLength(EXTRA_ITEMS.length)
    }
  }
})

it('잇는 것이지 덮는 것이 아니다', () => {
  const rom = Array.from({ length: 468 }, (_, i) => i)
  const merged = withExtraItems(rom, [468, 469])
  expect(merged).toHaveLength(470)
  expect(merged.slice(0, 468)).toEqual(rom)
})
