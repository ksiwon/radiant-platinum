// 상점의 사는 흐름 (`ShopScreen.tsx` · `overlay007/shop_menu.c`)
//
// 개수는 ↑↓가 막히기만 하고 ←→는 아무것도 안 해서, 99개를 사려면 ↑를 98번 눌러야 했다.
// 몬스터볼 열 개에 붙는 프레미어볼 덤이 없었다. 결제 전 확인(롬 줄 5·35) 없이 개수를 정하자마자
// 돈이 나갔고, 거절 줄 셋이 롬 글이 아니었다. 백화점 계산대의 단골 셈은 상점 화면이 안 불러서 늘 0이었다.
import { describe, expect, it, vi } from 'vitest'
import { MART_TEXT } from '../../data/uiText'
import { ITEM_TABLE } from '../../import/platinum/itemTable'
import { useMenuStore } from '../../state/menuStore'

const {
  confirmLine, finishPurchase, pickLine, premierBonus, purchaseMax, soldLine, stepCount,
} = await import('./ShopScreen')

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

describe('판 뒤의 줄', () => {
  it('합쇼체다', () => {
    expect(soldLine('1,200원')).toBe('1,200원을 받았습니다')
  })
})
