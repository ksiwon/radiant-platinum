// 상점의 사는 흐름 (`ShopScreen.tsx` · `overlay007/shop_menu.c`)
//
// 개수는 ↑↓가 막히기만 하고 ←→는 아무것도 안 해서, 99개를 사려면 ↑를 98번 눌러야 했다.
// 몬스터볼 열 개에 붙는 프레미어볼 덤이 없었다. 결제 전 확인(롬 줄 5·35) 없이 개수를 정하자마자
// 돈이 나갔고, 거절 줄 셋이 롬 글이 아니었다. 백화점 계산대의 단골 셈은 상점 화면이 안 불러서 늘 0이었다.
import { describe, expect, it, vi } from 'vitest'
import { MART_TEXT, SELL_TEXT } from '../../data/uiText'
import { ITEM_TABLE } from '../../import/platinum/itemTable'
import { useMenuStore } from '../../state/menuStore'

const {
  confirmLine, finishPurchase, pickLine, premierBonus, purchaseMax, stepCount,
} = await import('./ShopScreen')
const {
  buyRows, canSell, entriesOf, receipt, sellPrice, sellRows, soldLine,
} = await import('./shopRows')

const id = (constant: string): number => ITEM_TABLE.findIndex(([name]) => name === constant)

describe('개수 고르기 (`sub_0208C15C`)', () => {
  it('↑는 하나씩 늘고 최대에서 1로 감긴다', () => {
    expect(stepCount(1, 99, 'up')).toBe(2)
    expect(stepCount(99, 99, 'up')).toBe(1)
  })

  it('↓는 하나씩 줄고 1에서 최대로 감긴다', () => {
    expect(stepCount(5, 99, 'down')).toBe(4)
    expect(stepCount(1, 99, 'down')).toBe(99)
    expect(stepCount(1, 7, 'down')).toBe(7)
  })

  it('←→는 열씩 가고 감기지 않는다', () => {
    expect(stepCount(25, 99, 'left')).toBe(15)
    expect(stepCount(5, 99, 'left')).toBe(1)
    expect(stepCount(10, 99, 'left')).toBe(1)
    expect(stepCount(5, 99, 'right')).toBe(15)
    expect(stepCount(95, 99, 'right')).toBe(99)
  })

  it('끝에서 더 밀면 그대로다 — 화면이 소리를 안 낸다', () => {
    expect(stepCount(1, 99, 'left')).toBe(1)
    expect(stepCount(99, 99, 'right')).toBe(99)
    // 최대가 1이면 ↑↓도 제자리로 감긴다
    expect(stepCount(1, 1, 'up')).toBe(1)
    expect(stepCount(1, 1, 'down')).toBe(1)
  })
})

describe('프레미어볼 덤 (`Shop_FinishPurchase`)', () => {
  const poke = id('ITEM_POKE_BALL')
  const premier = id('ITEM_PREMIER_BALL')

  it('번호가 열거형 표에서 나온다', () => {
    expect(poke).toBe(4)
    expect(premier).toBe(12)
  })

  it('몬스터볼 10개면 하나, 9개면 없다', () => {
    expect(premierBonus(poke, 10)).toBe(premier)
    expect(premierBonus(poke, 99)).toBe(premier)
    expect(premierBonus(poke, 9)).toBeNull()
  })

  it('다른 볼은 열 개를 사도 없다', () => {
    expect(premierBonus(id('ITEM_GREAT_BALL'), 10)).toBeNull()
    expect(premierBonus(premier, 10)).toBeNull()
  })
})

describe('고르자마자 (`Shop_SelectBuyMenu`)', () => {
  it('값이 가진 것보다 크면 개수를 안 묻고 거절 줄이다 — 돈 3 · BP 37', () => {
    expect(pickLine(199, 200, false)).toBe(MART_TEXT.noMoney)
    expect(pickLine(47, 48, true)).toBe(MART_TEXT.noBP)
  })

  it('하나라도 살 수 있으면 몇 개를 묻는다 — 돈 4 · BP 33', () => {
    expect(pickLine(200, 200, false)).toBe(MART_TEXT.howMany)
    expect(pickLine(48, 48, true)).toBe(MART_TEXT.bpHowMany)
  })

  it('개수 창의 끝은 가진 것으로 살 수 있는 만큼이고 99에서 멈춘다', () => {
    expect(purchaseMax(1000, 200)).toBe(5)
    expect(purchaseMax(999999, 100)).toBe(99)
    expect(purchaseMax(199, 200)).toBe(0)
  })
})

describe('결제 전 확인 (`Shop_ShowPurchaseMessage`)', () => {
  it('보통은 5, BP는 35다', () => {
    expect(confirmLine(id('ITEM_POKE_BALL'), false)).toBe(MART_TEXT.confirm)
    expect(confirmLine(id('ITEM_POKE_BALL'), true)).toBe(MART_TEXT.bpConfirm)
  })

  it('기술머신은 기술 이름이 붙는 판이다 — 원작 조건이 HM01에서 끝난다', () => {
    expect(confirmLine(id('ITEM_TM01'), false)).toBe(MART_TEXT.tmConfirm)
    expect(confirmLine(id('ITEM_TM92'), true)).toBe(MART_TEXT.bpTmConfirm)
    expect(confirmLine(id('ITEM_HM01'), false)).toBe(MART_TEXT.tmConfirm)
    expect(confirmLine(id('ITEM_HM02'), false)).toBe(MART_TEXT.confirm)
  })
})

describe('끝 줄을 넘길 때 (`Shop_FinishPurchase`)', () => {
  it('백화점 계산대의 셈을 한 번 부르고 덤을 돌려준다', () => {
    const count = vi.fn()
    expect(finishPurchase({ item: id('ITEM_POKE_BALL'), count: 10 }, count)).toBe(id('ITEM_PREMIER_BALL'))
    expect(count).toHaveBeenCalledTimes(1)
  })

  it('거절 줄을 넘겨도 센다 — 원작이 무엇을 샀는지 안 본다. 덤은 없다', () => {
    const count = vi.fn()
    // 돈이 모자란 거절은 개수가 1, 칸이 모자란 거절은 0이다
    expect(finishPurchase({ item: id('ITEM_POKE_BALL'), count: 1 }, count)).toBeNull()
    expect(finishPurchase({ item: id('ITEM_POKE_BALL'), count: 0 }, count)).toBeNull()
    expect(count).toHaveBeenCalledTimes(2)
  })

  it('세지 않는 가게는 부를 것이 없다', () => {
    expect(finishPurchase({ item: id('ITEM_POTION'), count: 3 }, null)).toBeNull()
  })
})

describe('상점을 여는 인자 (`menuStore.openShop`)', () => {
  it('백화점 계산대가 준 셈을 화면이 받고, 닫으면 놓는다', () => {
    const count = vi.fn()
    useMenuStore.getState().openShop([id('ITEM_POTION')], 'money', count)
    expect(useMenuStore.getState().shopOnPurchase).toBe(count)
    useMenuStore.getState().closeAll()
    expect(useMenuStore.getState().shopOnPurchase).toBeNull()
  })

  it('세지 않는 가게는 셈이 없다', () => {
    useMenuStore.getState().openShop([id('ITEM_POTION')])
    expect(useMenuStore.getState().shopOnPurchase).toBeNull()
    useMenuStore.getState().closeAll()
  })
})

describe('판다 — 롬 7번 뱅크의 74~77 (`applications/bag/main.c`)', () => {
  it('판 뒤의 줄은 롬 77이다 — 칸 0 도구 · 칸 1 값', () => {
    const bank: string[] = []
    bank[SELL_TEXT.done] = '{STRVAR_1 8, 0, 2} 건네고\n{STRVAR_1 55, 1, 0}원을 받았다'
    expect(soldLine(bank, SELL_TEXT.done, '상처약', '150')).toBe('상처약을 건네고\n150원을 받았다')
  })

  it('값은 사는 값의 절반이고 0이면 못 판다', () => {
    expect(sellPrice(300)).toBe(150)
    expect(sellPrice(1)).toBe(0)
    expect(canSell(sellPrice(1))).toBe(false)
    expect(canSell(sellPrice(200))).toBe(true)
  })

  it('줄 번호가 롬과 같다', () => {
    expect(SELL_TEXT).toEqual({ cannot: 74, howMany: 75, ask: 76, done: 77 })
  })
})

describe('줄 모델', () => {
  const potion = id('ITEM_POTION')
  const ball = id('ITEM_POKE_BALL')
  const price = (item: number): number => (item === ball ? 200 : 300)

  it('사는 목록은 재고 차례 그대로이고 「그만둔다」 줄이 맨 끝이다 (하네스 buyAt의 줄 차례)', () => {
    const rows = buyRows([ball, potion], price, () => 0, () => 0)
    expect(rows.map((r) => (r.kind === 'item' ? r.item : 'end'))).toEqual([ball, potion, 'end'])
  })

  it('재고가 비어도 「그만둔다」 한 줄은 남는다', () => {
    expect(buyRows([], price, () => 0, () => 0)).toEqual([{ kind: 'end' }])
  })

  it('판다 목록은 주머니 차례 · 가방 줄 차례이고 중요한 물건은 빠진다', () => {
    const bag = [[{ item: potion, count: 3 }], [{ item: ball, count: 5 }, { item: 99, count: 1 }]]
    const rows = sellRows(bag, (item) => item !== 99, price)
    expect(rows).toEqual([
      { kind: 'item', item: potion, price: 150, have: 3, pocket: 0 },
      { kind: 'item', item: ball, price: 100, have: 5, pocket: 1 },
      { kind: 'end' },
    ])
  })

  it('값이 0인 도구는 목록에 남는다 — 고르면 「파실 수 없습니다!」', () => {
    const rows = sellRows([[{ item: potion, count: 1 }]], () => true, () => 1)
    expect(rows[0]).toMatchObject({ kind: 'item', price: 0 })
  })

  it('빈 가방은 「그만둔다」 한 줄뿐이다', () => {
    expect(sellRows([[], []], () => true, price)).toEqual([{ kind: 'end' }])
  })

  it('그리는 줄은 판다에서만 주머니 머리가 끼고, 머리는 고를 수 없다', () => {
    const rows = sellRows(
      [[{ item: potion, count: 3 }, { item: ball, count: 1 }], [{ item: 99, count: 1 }]], () => true, price,
    )
    const grouped = entriesOf(rows, true)
    expect(grouped.map((e) => e.kind)).toEqual(['head', 'row', 'row', 'head', 'row', 'row'])
    expect(grouped.filter((e) => e.kind === 'row').map((e) => (e.kind === 'row' ? e.index : -1))).toEqual([0, 1, 2, 3])
    expect(entriesOf(rows, false).every((e) => e.kind === 'row')).toBe(true)
  })
})

describe('계산서 — 지갑 · ±합계 · 결과', () => {
  it('사면 빼고 팔면 더한다', () => {
    expect(receipt(1280, 200, 3, false)).toEqual({ delta: -600, after: 680 })
    expect(receipt(1280, 150, 2, true)).toEqual({ delta: 300, after: 1580 })
  })
})
