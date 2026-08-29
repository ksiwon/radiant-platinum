// 볼 가운데 버튼이 화면 어디에 찍히는가.
//
// ⚠️ **눈으로 맞추면 안 된다.** 누르는 자리는 DOM 단추고 버튼은 3D라, 어긋나도
// 화면에는 「대충 볼 근처」로 보인다. 실제로 단추가 대사창 위 빈 곳의
// 한가운데(화면 위쪽)에 있었고 버튼은 화면 한가운데였다 — 둘 다 「가운데」라
// 코드만 읽어서는 안 보인다.
import { describe, expect, it } from 'vitest'
import { HIT_MARGIN, INTRO_BALL, INTRO_CAMERA, introBallButton, project } from './introPlace'

const VIEW = { width: 960, height: 640 }

describe('오프닝 — 볼 버튼의 화면 자리', () => {
  it('겨누는 자리는 정확히 화면 한가운데다', () => {
    const at = project(INTRO_CAMERA.target, 0, VIEW)
    expect(at.x).toBeCloseTo(VIEW.width / 2, 6)
    expect(at.y).toBeCloseTo(VIEW.height / 2, 6)
  })

  it('버튼이 화면 한가운데에서 몇 픽셀 안에 있다', () => {
    // 카메라가 0.55m를 겨누고 볼이 0.72m에 있는데, 버튼이 카메라 쪽으로
    // 0.684m 나와 있어서 시선과 거의 같은 높이에 온다 — 그래서 한가운데다.
    // 이 값이 크게 벌어지면 단추도 같이 옮겨야 한다는 뜻이다
    const at = introBallButton(VIEW)
    expect(at.x).toBeCloseTo(480, 6)
    expect(at.y).toBeCloseTo(322.5, 0)
    expect(Math.abs(at.y - VIEW.height / 2)).toBeLessThan(5)
  })

  it('버튼 크기가 화면에서 60픽셀쯤이다', () => {
    // 검은 테두리까지의 반지름 0.3에 볼 배율 0.72 — 지름 58픽셀이다.
    // 그대로 누르기엔 좁아서 `HIT_MARGIN`만큼 넓히지만 자리는 안 옮긴다
    const at = introBallButton(VIEW)
    expect(at.radius * 2).toBeCloseTo(57.6, 0)
    expect(at.radius * 2 * HIT_MARGIN).toBeGreaterThan(70)
    expect(at.radius * 2 * HIT_MARGIN).toBeLessThan(120)
  })

  it('화면이 넓어져도 세로 자리는 안 변한다 — 화각이 세로다', () => {
    const wide = introBallButton({ width: 1920, height: 640 })
    const narrow = introBallButton({ width: 640, height: 640 })
    expect(wide.y).toBeCloseTo(narrow.y, 6)
    expect(wide.radius).toBeCloseTo(narrow.radius, 6)
    // 가로 한가운데라 폭이 달라져도 화면 한가운데다
    expect(wide.x).toBeCloseTo(960, 6)
    expect(narrow.x).toBeCloseTo(320, 6)
  })

  it('위에 있는 것은 화면 위쪽에 찍힌다', () => {
    const high = project([0, INTRO_BALL.at[1] + 1, 0], 0, VIEW)
    const low = project([0, INTRO_BALL.at[1], 0], 0, VIEW)
    expect(high.y).toBeLessThan(low.y)
  })

  it('카메라 뒤는 화면 한가운데로 떨어뜨린다 — 0으로 안 나눈다', () => {
    const behind = project([0, 2.6, 100], 1, VIEW)
    expect(behind.radius).toBe(0)
    expect(Number.isFinite(behind.x)).toBe(true)
  })
})
