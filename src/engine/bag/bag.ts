// 가방 (DATA.md §2.12) — `src/bag.c` 그대로.
//
// 사전 하나로 {아이템: 개수}를 들면 훨씬 간단하지만 그러면 원작과 어긋난다:
//
//   · 주머니마다 **칸 수 상한**이 다르다. 도구 165칸인데 볼은 15칸이다.
//     한 칸 = 아이템 한 종류라, 볼을 16종 모으면 더는 안 들어간다
//   · 한 칸의 개수 상한은 999(기술머신만 99)다
//   · **나열 순서가 주머니마다 다르다.** 나무열매와 기술머신은 넣을 때마다
//     번호순으로 정렬되고, 나머지는 주운 순서 그대로다
//
// 이 셋이 가방 화면의 생김새를 정하므로 자료 구조부터 원작을 따른다.
import { POCKET_COUNT } from '../../data/pockets'

/** `bag.h`. 자리는 `POCKET_*` 번호 순서다 */
export const POCKET_SIZE: readonly number[] = [
  165, // 도구
  40,  // 회복
  15,  // 볼
  100, // 기술머신
  64,  // 나무열매
  12,  // 메일
  30,  // 배틀용
  50,  // 중요한 물건
]

export const POCKET_TMHMS = 3
export const POCKET_BERRIES = 4

/** 한 칸에 쌓이는 상한. 기술머신만 다르다 */
export const MAX_QUANTITY = 999
export const MAX_QUANTITY_TMHM = 99

interface BagSlot {
  item: number
  count: number
}

export type Pockets = BagSlot[][]

export function emptyBag(): Pockets {
  return Array.from({ length: POCKET_COUNT }, () => [])
}

const limit = (pocket: number): number =>
  pocket === POCKET_TMHMS ? MAX_QUANTITY_TMHM : MAX_QUANTITY

/**
 * 넣을 자리가 있는가 (`Bag_CanFitItem`).
 *
 * 같은 아이템이 이미 있으면 그 칸에 쌓고, 없으면 빈 칸을 쓴다. 둘 다 안 되면
 * 실패다 — 개수가 남아도 **칸이 없으면** 못 넣는다
 */
export function canFit(pockets: Pockets, pocket: number, item: number, count: number): boolean {
  const slots = pockets[pocket]
  if (!slots) return false
  const have = slots.find((s) => s.item === item)
  if (have) return have.count + count <= limit(pocket)
  return slots.length < (POCKET_SIZE[pocket] ?? 0)
}

/** 넣는다 (`Bag_TryAddItem`). 성공하면 새 주머니를, 실패하면 null */
export function addItem(pockets: Pockets, pocket: number, item: number, count: number): Pockets | null {
  if (!canFit(pockets, pocket, item, count)) return null
  const next = pockets.map((p) => p.map((s) => ({ ...s })))
  const slots = next[pocket]!
  const have = slots.find((s) => s.item === item)
  if (have) have.count += count
  else slots.push({ item, count })
  // 나무열매와 기술머신만 번호순으로 다시 늘어선다. 나머지는 주운 순서다
  if (pocket === POCKET_BERRIES || pocket === POCKET_TMHMS) slots.sort((a, b) => a.item - b.item)
  return next
}

/** 뺀다 (`Bag_TryRemoveItem`). 0이 되면 칸이 사라진다 */
export function removeItem(pockets: Pockets, pocket: number, item: number, count: number): Pockets | null {
  const slots = pockets[pocket]
  const have = slots?.find((s) => s.item === item)
  if (!have || have.count < count) return null
  const next = pockets.map((p) => p.map((s) => ({ ...s })))
  const slot = next[pocket]!.find((s) => s.item === item)!
  slot.count -= count
  if (slot.count === 0) next[pocket] = next[pocket]!.filter((s) => s.item !== item)
  return next
}

export function quantity(pockets: Pockets, pocket: number, item: number): number {
  return pockets[pocket]?.find((s) => s.item === item)?.count ?? 0
}
