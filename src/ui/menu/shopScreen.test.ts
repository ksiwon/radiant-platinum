// 상점의 개수 고르기·덤·알림 줄 (`ShopScreen.tsx`의 `stepCount` · `premierBonus` · `boughtLine` · `soldLine`)
//
// 개수는 ↑↓가 막히기만 하고 ←→는 아무것도 안 해서, 99개를 사려면 ↑를 98번 눌러야 했다.
// 몬스터볼 열 개에 붙는 프레미어볼 덤이 없었고, 성공 알림만 반말이었다.
import { describe, expect, it } from 'vitest'
import { ITEM_TABLE } from '../../import/platinum/itemTable'

const { boughtLine, premierBonus, soldLine, stepCount } = await import('./ShopScreen')

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

describe('알림 줄', () => {
  it('거절 줄과 같은 합쇼체다', () => {
    expect(boughtLine('몬스터볼', 3)).toBe('몬스터볼 3개를 샀습니다')
    expect(soldLine('1,200원')).toBe('1,200원을 받았습니다')
  })
})
