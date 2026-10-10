// `MonViewport`의 순수 계산 (SYSTEM §2.4 · PV 「테스트」) — 구멍 사각형 · 카메라 구도 · 얼굴 색 · 톤 매핑의 역.
import { describe, expect, it } from 'vitest'
import { WINDOW } from '../ui/theme/window.css'
import {
  FACE_STOPS, FIT, canvasRect, faceColorAt, fitCamera, holeRect, neutralTone, precompensate, snapRect,
  swayAngle,
} from './monViewportMath'

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height })

describe('holeRect — 창 기준 구멍', () => {
  it('두 사각형의 차이다', () => {
    expect(holeRect(box(300, 200, 240, 240), box(100, 50, 1040, 648))).toEqual({ x: 200, y: 150, w: 240, h: 240 })
  })

  it('창 테두리(패딩 상자 바깥)를 뺀다 — 창 얼굴 층은 테두리 안쪽에서 시작한다', () => {
    expect(holeRect(box(300, 200, 240, 240), box(100, 50, 1040, 648), { left: 3, top: 3 }))
      .toEqual({ x: 197, y: 147, w: 240, h: 240 })
  })

  it('창이 같이 올라오는 동안에도 값이 그대로다', () => {
    const rest = holeRect(box(300, 200, 240, 240), box(100, 50, 1040, 648), { left: 3, top: 3 })
    const rising = holeRect(box(300, 194, 240, 240), box(100, 44, 1040, 648), { left: 3, top: 3 })
    expect(rising).toEqual(rest)
  })
})

describe('snapRect — 기기 픽셀 격자', () => {
  it('dpr 1은 정수로 맞춘다', () => {
    expect(snapRect({ x: 10.4, y: 20.6, w: 100.2, h: 50.3 }, 1)).toEqual({ x: 10, y: 21, w: 101, h: 50 })
  })

  it('dpr 2는 반 픽셀 격자다', () => {
    expect(snapRect({ x: 10.3, y: 20.8, w: 100, h: 50 }, 2)).toEqual({ x: 10.5, y: 21, w: 100, h: 50 })
  })

  it('가장자리를 각각 맞춰 폭이 따로 어긋나지 않는다', () => {
    const r = snapRect({ x: 10.4, y: 0, w: 10.4, h: 10 }, 1)
    expect(r.x + r.w).toBe(21) // 20.8 → 21
    expect(Number.isInteger(r.w)).toBe(true)
  })

  it('격자에 이미 맞은 값은 그대로다 (dpr 1 · 2 · 1.5)', () => {
    for (const dpr of [1, 2, 1.5]) {
      const r = { x: 36, y: 90, w: 240, h: 240 }
      expect(snapRect(r, dpr)).toEqual(r)
    }
  })
})

describe('canvasRect — 캔버스 안의 시저 사각형', () => {
  const canvas = { w: 1280, h: 720 }

  it('안에 든 구멍은 격자에 맞춰 그대로 나온다', () => {
    expect(canvasRect(box(100, 120, 240, 240), canvas, 1)).toEqual({ x: 100, y: 120, w: 240, h: 240 })
  })

  it('밖으로 나간 부분은 자른다', () => {
    expect(canvasRect(box(1200, 700, 240, 240), canvas, 1)).toEqual({ x: 1200, y: 700, w: 80, h: 20 })
    expect(canvasRect(box(-40, -20, 240, 240), canvas, 1)).toEqual({ x: 0, y: 0, w: 200, h: 220 })
  })

  it('완전히 밖이거나 비면 null이다', () => {
    expect(canvasRect(box(1300, 100, 240, 240), canvas, 1)).toBeNull()
    expect(canvasRect(box(100, 100, 0, 240), canvas, 1)).toBeNull()
    expect(canvasRect(box(100, 100, NaN, 240), canvas, 1)).toBeNull()
  })
})

describe('fitCamera — 키 78% · 발 아래 12%', () => {
  const k = 2 * Math.tan((FIT.fov * Math.PI) / 360)

  it('키가 구멍 높이의 78%가 되는 거리다', () => {
    const { distance } = fitCamera({ height: 1.2, width: 0.6, aspect: 1 })
    expect((1.2 / (k * distance))).toBeCloseTo(0.78, 6)
  })

  it('발이 구멍 아래 12%에 온다 — 시선 높이가 화면 높이의 38%만큼 발 위다', () => {
    const { distance, targetY } = fitCamera({ height: 1.2, width: 0.6, aspect: 1 })
    expect(targetY).toBeCloseTo(0.38 * k * distance, 6)
  })

  it('몸 크기와 상관없이 같은 비율이다', () => {
    for (const height of [0.4, 1.8, 14.5]) {
      const { distance, targetY } = fitCamera({ height, width: height * 0.4, aspect: 1 })
      const visible = k * distance
      expect(height / visible).toBeCloseTo(0.78, 6)
      expect(targetY / visible).toBeCloseTo(0.38, 6)
    }
  })

  it('넓은 몸은 폭이 구멍의 90%를 넘지 않게 더 물러난다 — 발은 그대로 12%', () => {
    const wide = fitCamera({ height: 1, width: 4, aspect: 1 })
    const visible = k * wide.distance
    expect(4 / (visible * 1)).toBeCloseTo(0.9, 6)
    expect(1 / visible).toBeLessThan(0.78)
    expect(wide.targetY / visible).toBeCloseTo(0.38, 6)
  })

  it('가로로 긴 구멍은 폭에 더 여유가 있다', () => {
    const square = fitCamera({ height: 1, width: 4, aspect: 1 })
    const wide = fitCamera({ height: 1, width: 4, aspect: 2 })
    expect(wide.distance).toBeLessThan(square.distance)
  })

  it('aspect가 0이어도 던지지 않는다', () => {
    expect(Number.isFinite(fitCamera({ height: 1, width: 1, aspect: 0 }).distance)).toBe(true)
  })
})

describe('swayAngle — y축 ±20°를 8초에', () => {
  it('0초는 0이고 2초에 +20°다', () => {
    expect(swayAngle(0, false)).toBe(0)
    expect(swayAngle(2, false)).toBeCloseTo((20 * Math.PI) / 180, 6)
    expect(swayAngle(6, false)).toBeCloseTo((-20 * Math.PI) / 180, 6)
  })

  it('8초가 한 주기다 — 한 바퀴 돌지 않는다', () => {
    for (let t = 0; t < 40; t += 0.37) {
      expect(Math.abs(swayAngle(t, false))).toBeLessThanOrEqual((20 * Math.PI) / 180 + 1e-9)
    }
    expect(swayAngle(8.5, false)).toBeCloseTo(swayAngle(0.5, false), 9)
  })

  it('움직임을 줄이는 설정이면 0이다', () => {
    expect(swayAngle(2, true)).toBe(0)
  })
})

describe('faceColorAt — 창 얼굴 그러데이션', () => {
  const top = [1, 1, 1] as const
  const mid = [0.5, 0.5, 0.5] as const
  const bottom = [0, 0, 0] as const

  it('멈춤점은 창이 쓰는 0% · 30% · 100%다', () => {
    expect(FACE_STOPS).toEqual([0, 0.3, 1])
    expect(WINDOW.background).toContain('30%')
    expect(WINDOW.background).toContain('100%')
  })

  it('멈춤점에서 그 색이다', () => {
    expect(faceColorAt(0, top, mid, bottom)).toEqual([1, 1, 1])
    expect(faceColorAt(0.3, top, mid, bottom)).toEqual([0.5, 0.5, 0.5])
    expect(faceColorAt(1, top, mid, bottom)).toEqual([0, 0, 0])
  })

  it('사이는 선형이고 범위 밖은 끝 색이다', () => {
    expect(faceColorAt(0.15, top, mid, bottom)[0]).toBeCloseTo(0.75, 9)
    expect(faceColorAt(0.65, top, mid, bottom)[0]).toBeCloseTo(0.25, 9)
    expect(faceColorAt(-1, top, mid, bottom)).toEqual([1, 1, 1])
    expect(faceColorAt(2, top, mid, bottom)).toEqual([0, 0, 0])
  })
})

describe('neutralTone · precompensate — 톤 매핑을 거슬러 이음매를 없앤다', () => {
  it('어두운 색은 거의 그대로다 (오프셋 0.04 안팎)', () => {
    const out = neutralTone([0.1, 0.1, 0.1])
    expect(out[0]).toBeCloseTo(0.06, 6)
  })

  it('밝은 색은 눌린다 — 창 얼굴의 밝은 쪽이 그대로는 안 나오는 까닭이다', () => {
    const out = neutralTone([0.93, 0.98, 0.99])
    expect(Math.max(...out)).toBeLessThan(0.93)
  })

  it('닿을 수 없는 거의 흰 색도 던지지 않고 가장 가까운 값을 낸다', () => {
    const got = neutralTone(precompensate([0.93, 0.98, 0.99]))
    for (const v of got) expect(Number.isFinite(v)).toBe(true)
    expect(Math.max(...got)).toBeGreaterThan(0.9)
  })

  it('거슬러 둔 색이 톤 매핑을 거치면 목표가 된다 (창 얼굴의 위 · 가운데 · 아래 값 — 선형)', () => {
    for (const target of [[0.77, 0.87, 0.9], [0.64, 0.82, 0.87], [0.55, 0.7, 0.76], [0.1, 0.2, 0.3], [0, 0, 0]] as const) {
      for (const exposure of [1, 1.05]) {
        const got = neutralTone(precompensate(target, exposure), exposure)
        for (let i = 0; i < 3; i++) expect(got[i]!).toBeCloseTo(target[i]!, 4)
      }
    }
  })
})
