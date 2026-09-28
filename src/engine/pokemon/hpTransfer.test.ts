// 우유마시기 · 알낳기 (`PartyMenu_UseHPTransferFieldMove`)
import { describe, expect, it } from 'vitest'
import { hpTransferAmount, hpTransferGiven, hpTransferTarget } from './hpTransfer'

describe('체력 나눠 주기', () => {
  it('몫은 최대 체력 ÷ 5이고, 지금 체력이 몫 이하면 모자란다', () => {
    expect(hpTransferAmount({ hp: 100, maxHp: 104, isEgg: false })).toBe(20)
    expect(hpTransferAmount({ hp: 21, maxHp: 104, isEgg: false })).toBe(20)
    // 같으면 모자란다 — 원작이 `curHP <= buffer`로 가른다
    expect(hpTransferAmount({ hp: 20, maxHp: 104, isEgg: false })).toBeNull()
  })

  it('알 · 자기 자신 · 쓰러진 마리 · 가득 찬 마리는 못 받는다', () => {
    const hurt = { hp: 10, maxHp: 50, isEgg: false }
    expect(hpTransferTarget(0, 1, { ...hurt, isEgg: true })).toBe('egg')
    expect(hpTransferTarget(0, 0, hurt)).toBe('invalid')
    expect(hpTransferTarget(0, 1, { ...hurt, hp: 0 })).toBe('invalid')
    expect(hpTransferTarget(0, 1, { ...hurt, hp: 50 })).toBe('invalid')
    expect(hpTransferTarget(0, 1, hurt)).toBe('ok')
  })

  it('받는 마리가 빈 만큼보다 많이 주지 않는다', () => {
    expect(hpTransferGiven(20, { hp: 45, maxHp: 50, isEgg: false })).toBe(5)
    expect(hpTransferGiven(20, { hp: 10, maxHp: 50, isEgg: false })).toBe(20)
  })
})
