import { describe, it, expect } from 'vitest'
import { escapeOdds, tryEscape } from './escape'

describe('도망 판정', () => {
  it('우리가 더 빠르면 무조건 도망친다', () => {
    expect(escapeOdds(100, 99, 0)).toBe(256)
    // 난수를 최악으로 줘도 성공해야 한다
    expect(tryEscape(100, 99, 0, () => 0.999999)).toBe(true)
  })

  it('속도가 같으면 반반이다', () => {
    // 128 / 256. 원작에서 "같은 속도면 절반은 못 도망친다"가 이 숫자다
    expect(escapeOdds(50, 50, 0)).toBe(128)
    expect(tryEscape(50, 50, 0, () => 0.4)).toBe(true)   // 102 < 128
    expect(tryEscape(50, 50, 0, () => 0.6)).toBe(false)  // 153 >= 128
  })

  it('느려도 시도할수록 쉬워진다', () => {
    const half = (n: number) => escapeOdds(25, 100, n)
    expect(half(0)).toBe(32)
    expect(half(1)).toBe(62)
    expect(half(2)).toBe(92)
    // 여덟 번쯤 하면 사실상 확정이다
    expect(half(7)).toBeGreaterThan(240)
  })

  it('상대 속도가 0이어도 안 터진다', () => {
    // 마비로 속도가 0이 되는 일은 없지만, 0으로 나누면 화면이 멈춘다
    expect(escapeOdds(10, 0, 0)).toBe(256)
    expect(tryEscape(10, 0, 0, () => 0.9)).toBe(true)
  })

  it('시도를 아주 많이 하면 256으로 감기는 구간이 있다', () => {
    // 카트리지가 8비트라 그렇다. 우리가 더 빠르면 그 전에 확정 처리되므로
    // 실제로는 안 걸리지만, 식을 고칠 때 이 성질을 모르고 건드리면 안 된다
    expect(escapeOdds(25, 100, 8)).toBe((32 + 240) % 256)
    expect(escapeOdds(25, 100, 8)).toBe(16)
  })
})
