// 상점의 줄 모델과 셈 (설계서 `shop.md` §4.3 · §4.4). 순수 함수만 둔다 — 화면(`ShopScreen`)은 이것이 낸 줄을 그린다.
//
// 줄은 **고를 수 있는 줄**(`ShopRow`)과 **그리는 줄**(`ShopEntry`, 판다의 주머니 머리가 끼어든다)이 다르다. 커서는 앞 것의
// 색인이고, 하네스(`buyAt`)가 `shopStock`에서 줄을 찾아 ↓를 그 횟수만큼 누르므로 **재고 차례가 곧 줄 차례이고 끝 줄은
// 맨 끝이다** — 끝 줄이 앞의 줄을 밀지 않는다.
import type { Pockets } from '../../engine/bag/bag'
import { fillMenuText } from '../../data/uiText'

/** 고를 수 있는 줄 */
export type ShopRow =
  | { kind: 'item', item: number, price: number, have: number, pocket: number }
  /** 목록 끝 「그만둔다」 줄 (롬 543의 8). 아이콘이 없다 */
  | { kind: 'end' }

/** 그리는 줄 — 주머니 머리는 고를 수 없다 */
export type ShopEntry =
  | { kind: 'head', pocket: number }
  | { kind: 'row', index: number, row: ShopRow }

/** `Item_SellPrice` — 사는 값의 절반으로 쳐 준다 */
export const sellPrice = (price: number): number => Math.floor(price / 2)

/** 파는 길에서 값이 0이면 원작이 「파실 수 없습니다!」를 띄운다 (롬 7의 74) */
export const canSell = (price: number): boolean => price > 0

/** 사는 목록 — 재고 차례 그대로, 끝 줄은 맨 끝이다 */
export function buyRows(
  stock: readonly number[],
  priceOf: (item: number) => number,
  haveOf: (item: number) => number,
  pocketOf: (item: number) => number,
): ShopRow[] {
  return [
    ...stock.map((item): ShopRow => ({ kind: 'item', item, price: priceOf(item), have: haveOf(item), pocket: pocketOf(item) })),
    { kind: 'end' },
  ]
}

/**
 * 파는 목록 — 주머니 차례대로, 가방의 줄 차례 그대로. 중요한 물건(`keep`이 거짓)은 안 보인다.
 * 값이 0인 도구는 남는다 — 고르면 원작처럼 「파실 수 없습니다!」가 뜬다
 */
export function sellRows(
  bag: Pockets,
  sellable: (item: number) => boolean,
  priceOf: (item: number) => number,
): ShopRow[] {
  const out: ShopRow[] = []
  bag.forEach((slots, pocket) => {
    for (const slot of slots) {
      if (!sellable(slot.item)) continue
      out.push({ kind: 'item', item: slot.item, price: sellPrice(priceOf(slot.item)), have: slot.count, pocket })
    }
  })
  out.push({ kind: 'end' })
  return out
}

/** 고를 수 있는 줄에 주머니 머리를 끼워 그릴 줄로 만든다. `grouped`가 거짓이면 머리가 없다 */
export function entriesOf(rows: readonly ShopRow[], grouped: boolean): ShopEntry[] {
  const out: ShopEntry[] = []
  let pocket = -1
  rows.forEach((row, index) => {
    if (grouped && row.kind === 'item' && row.pocket !== pocket) {
      pocket = row.pocket
      out.push({ kind: 'head', pocket })
    }
    out.push({ kind: 'row', index, row })
  })
  return out
}

/** 계산서의 셈 — 위에서 아래로 「지갑 · ±합계 · 결과」 */
export interface Receipt {
  /** 부호가 붙은 합계 (사면 음수) */
  delta: number
  /** 셈한 뒤의 지갑 */
  after: number
}

export function receipt(purse: number, unit: number, n: number, selling: boolean): Receipt {
  const total = unit * n
  return selling ? { delta: total, after: purse + total } : { delta: -total, after: purse - total }
}

/** 몇 개를 파는지 아는 줄 (롬 7의 77: 「{도구} 건네고 {값}원을 받았다」). 칸은 0 도구 · 1 값이다 */
export function soldLine(bank: readonly string[], line: number, name: string, paid: string): string {
  return fillMenuText(bank[line] ?? '', [name, paid]).replace(/[\r\f]/g, '\n')
}
