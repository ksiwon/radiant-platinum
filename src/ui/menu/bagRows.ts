// 가방 목록의 줄 모델 (`applications/bag/windows.c`의 `ItemListMenuPrintCB`).
//
// 순수 함수만 둔다 — 화면(`BagScreen`)은 이것이 낸 줄을 그리기만 한다. 목록 끝에는 원작처럼 「닫는다」 줄이 하나
// 붙는다(`Bag_Text_CloseBag`, 뱅크 7의 41). 그 줄은 `slots.length`째이고 빈 주머니는 그 한 줄뿐이다.
import type { Item } from '../../data/schema'
import { POCKET_BERRIES, POCKET_TMHMS } from '../../engine/bag/bag'
import { tmIndex } from '../../engine/bag/fieldUse'
import { ITEM_TABLE } from '../../import/platinum/itemTable'

/** 기술머신 92개 뒤에 비전머신이 이어 붙는다 (`tmIndex`) */
const TM_COUNT = 92

const ITEM_CHERI_BERRY = ITEM_TABLE.findIndex(([name]) => name === 'ITEM_CHERI_BERRY')

/** 줄의 꼴. 원작 줄 그리기가 주머니와 도구로 가른다 */
export type RowKind =
  /** 그림 · 이름 · 개수 */
  | 'plain'
  /** `No01` + 기술 이름 + 개수 */
  | 'tm'
  /** `HM01` + 기술 이름 (개수 없음) */
  | 'hm'
  /** `No01` + 그림 + 이름 + 개수 */
  | 'berry'
  /** 그림 · 이름 (개수 없음 · 등록 표식) */
  | 'key'

/** 이 도구의 줄 꼴 */
export function rowKind(pocket: number, item: Pick<Item, 'constant' | 'preventToss'>): RowKind {
  if (pocket === POCKET_TMHMS) {
    const at = tmIndex(item as Item)
    if (at !== null) return at >= TM_COUNT ? 'hm' : 'tm'
  }
  if (pocket === POCKET_BERRIES) return 'berry'
  return item.preventToss === 1 ? 'key' : 'plain'
}

/** 줄 머리의 번호 — 기술머신 `No01` · 비전머신 `HM01`의 숫자 (1부터) */
export function tmNumber(item: Pick<Item, 'constant'>): number | null {
  const at = tmIndex(item as Item)
  if (at === null) return null
  return at >= TM_COUNT ? at - TM_COUNT + 1 : at + 1
}

/** 나무열매의 번호 `No01` (도구 번호 − 첫 열매 + 1) */
export function berryNumber(itemId: number): number {
  return itemId - ITEM_CHERI_BERRY + 1
}

/** 두 자리로 채운 번호 글 — `No01`의 숫자 칸 */
export function pad2(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(2, '0')
}

/**
 * 줄 옮기기를 받는 주머니인가. 나무열매와 기술머신은 번호순으로 저절로 늘어서므로 못 옮긴다
 * (`StartMovingItem` 앞의 `BagUI_PocketIsSortedAutomatically`)
 */
export function movablePocket(pocket: number): boolean {
  return pocket !== POCKET_BERRIES && pocket !== POCKET_TMHMS
}

/** `from`에 있던 줄을 빼서 `to`에 끼운다. 목록 밖이면 그대로다 */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list]
  const out = [...list]
  const [moved] = out.splice(from, 1)
  out.splice(to, 0, moved as T)
  return out
}

/**
 * 커서의 줄 수 — 도구 줄 + 「닫는다」 한 줄. `recallCursor`가 이 범위로 당긴다
 * (`BagScreen`의 `bagMemory`와 하네스 `bagCursor`가 같은 범위를 쓴다)
 */
export function cursorRows(itemCount: number): number {
  return Math.max(0, itemCount) + 1
}
