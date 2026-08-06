// HP 게이지 색 (PLAN §7)
//
// 값 하나하나가 `unk_0208C098.c`의 `App_PixelCount`·`App_BarColor`에서 나온 것이다.
import { describe, it, expect } from 'vitest'
import { HP_PIXELS, barColorAt, barPixels, hpColor } from './healthbar'

describe('픽셀 수 (App_PixelCount)', () => {
  it('내림이다', () => {
    expect(barPixels(48, 48)).toBe(48)
    expect(barPixels(24, 48)).toBe(24)
    // 20/40 → 24픽셀. 정확히 절반이라 초록이 아니다
    expect(barPixels(20, 40)).toBe(24)
    expect(barPixels(16, 79)).toBe(9)
  })

  it('0이 아닌 체력은 최소 1픽셀을 받는다', () => {
    // 1/100은 내림하면 0인데, 그러면 살아 있는데 게이지가 텅 빈다
    expect(barPixels(1, 100)).toBe(1)
    expect(barPixels(1, 999)).toBe(1)
    expect(barPixels(0, 100)).toBe(0)
  })

  it('범위를 벗어난 값도 게이지 안에 들어온다', () => {
    expect(barPixels(-5, 40)).toBe(0)
    expect(barPixels(80, 40)).toBe(HP_PIXELS)
    expect(barPixels(10, 0)).toBe(0)
  })
})

describe('색 (App_BarColor)', () => {
  it('절반을 넘어야 초록이다 — 정확히 절반은 노랑이다', () => {
    expect(barColorAt(25)).toBe('green')
    expect(barColorAt(24)).toBe('yellow')
  })

  it('48/5 = 9라서 10픽셀부터 노랑이다', () => {
    // 원작이 정수 나눗셈을 쓴다. 9.6이 아니라 9다
    expect(barColorAt(10)).toBe('yellow')
    expect(barColorAt(9)).toBe('red')
  })

  it('1픽셀이라도 남으면 빨강, 0이면 빈 것이다', () => {
    expect(barColorAt(1)).toBe('red')
    expect(barColorAt(0)).toBe('empty')
  })
})

describe('비율로 재면 어긋나는 자리', () => {
  it('79 중 16은 비율로는 0.2025지만 빨강이다', () => {
    // 비율 규칙(`<= 0.2`이면 빨강)으로는 노랑이 된다. 픽셀은 9라서 빨강이다
    expect(16 / 79).toBeGreaterThan(0.2)
    expect(barPixels(16, 79)).toBe(9)
    expect(hpColor(16, 79)).toBe('red')
  })

  it('40 중 20은 정확히 절반이고 노랑이다', () => {
    expect(hpColor(20, 40)).toBe('yellow')
    expect(hpColor(21, 40)).toBe('green')
  })

  it('쓰러지면 빈 게이지다', () => {
    expect(hpColor(0, 40)).toBe('empty')
  })
})
