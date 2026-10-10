// `MonViewport`의 순수 계산 (SYSTEM §2.4). three도 DOM도 안 읽는다 — 시험이 숫자만으로 잠근다.
//
//   holeRect      DOM 사각형 둘(구멍 · 창) → 창 기준 구멍. `MenuScreen`의 `--hole-x/y/w/h`가 이 값이다
//   snapRect      기기 픽셀 격자에 맞춘다 — CSS 구멍과 GL 시저가 **픽셀까지** 겹치게
//   canvasRect    구멍 사각형 → 캔버스 안의 시저 사각형. 밖으로 나간 것은 자르고, 비면 null
//   fitCamera     몸 하나를 구멍에 담는 카메라 거리와 시선 높이
//   faceColorAt   창 얼굴 그러데이션의 한 점 — 뒷배경이 창과 이음매 없이 이어지게
//   neutralTone   렌더러가 걸 톤 매핑(Khronos Neutral)의 앞방향 · `precompensate`는 그 역
//
// 구멍이 3D에 그려지는 방식은 `scene/monViewportPass.ts`다.

export interface Rect { x: number, y: number, w: number, h: number }

/** `getBoundingClientRect()`가 주는 것 중 쓰는 칸만 */
interface DomBox { left: number, top: number, width: number, height: number }

/**
 * 창 기준 구멍. 창 얼굴 `::before`는 창의 **테두리 안쪽**(`inset: 0`은 패딩 상자)에 서므로 테두리 두께를 뺀다.
 * 창이 올라오는 동안(`riseIn`) 두 사각형이 같이 움직여 이 값은 그대로다.
 */
export function holeRect(hole: DomBox, win: DomBox, border: { left: number, top: number } = { left: 0, top: 0 }): Rect {
  return {
    x: hole.left - win.left - border.left,
    y: hole.top - win.top - border.top,
    w: hole.width,
    h: hole.height,
  }
}

/**
 * 기기 픽셀 격자(`1/dpr`)에 맞춘다. 가장자리를 각각 반올림해서 폭 · 높이가 따로 어긋나지 않게 한다
 * (왼쪽 가장자리와 오른쪽 가장자리가 같은 격자 위에 선다).
 */
export function snapRect(r: Rect, dpr: number): Rect {
  const k = dpr > 0 ? dpr : 1
  const x0 = Math.round(r.x * k) / k
  const y0 = Math.round(r.y * k) / k
  const x1 = Math.round((r.x + r.w) * k) / k
  const y1 = Math.round((r.y + r.h) * k) / k
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * 구멍(뷰포트 CSS px) → 캔버스 시저 사각형 (캔버스 왼쪽 위 원점, CSS px). 캔버스 밖은 자르고, 한 변이라도
 * 1 기기 픽셀 미만이면 그릴 게 없어 null이다. 캔버스는 `#stage-wrap`이 뷰포트 전체를 덮으므로 좌표계가 같다.
 */
export function canvasRect(hole: DomBox, canvas: { w: number, h: number }, dpr: number): Rect | null {
  const snapped = snapRect({ x: hole.left, y: hole.top, w: hole.width, h: hole.height }, dpr)
  const x0 = Math.max(0, snapped.x)
  const y0 = Math.max(0, snapped.y)
  const x1 = Math.min(canvas.w, snapped.x + snapped.w)
  const y1 = Math.min(canvas.h, snapped.y + snapped.h)
  const min = 1 / (dpr > 0 ? dpr : 1)
  if (!(x1 - x0 >= min) || !(y1 - y0 >= min)) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 구도 — 키가 구멍 높이의 78%, 발이 아래 12%에 온다 (SYSTEM §2.4 「구도」) */
export const FIT = { heightFrac: 0.78, feetFrac: 0.12, widthFrac: 0.9, fov: 30 } as const

interface FitInput {
  /** 몸의 키 (발 = 0) · 가로 폭(x · z 중 큰 쪽) */
  height: number
  width: number
  /** 구멍의 가로 / 세로 */
  aspect: number
  fov?: number
}

/**
 * 카메라 거리와 시선 높이 (발이 y=0, 카메라는 +z에서 −z를 본다).
 *
 * 키로 거리를 정하고(`heightFrac`), 넓은 몸은 폭이 구멍의 `widthFrac`를 넘지 않게 더 물러난다. 어느 쪽이든
 * **발은 구멍 아래 `feetFrac`에 선다** — 몸이 달라도 같은 바닥선이다.
 */
export function fitCamera(input: FitInput): { distance: number, targetY: number } {
  const fov = input.fov ?? FIT.fov
  const k = 2 * Math.tan((fov * Math.PI) / 360)
  const aspect = input.aspect > 0 ? input.aspect : 1
  const byHeight = input.height / (FIT.heightFrac * k)
  const byWidth = input.width / (FIT.widthFrac * aspect * k)
  const distance = Math.max(byHeight, byWidth)
  const visible = k * distance
  return { distance, targetY: visible * (0.5 - FIT.feetFrac) }
}

/** `r g b` 0~1 */
export type Rgb = readonly [number, number, number]

/** CSS 그러데이션과 같은 보간(sRGB 값 위의 선형) */
function lerp3(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** 창 얼굴 그러데이션의 멈춤점 (`window.css`의 `WINDOW.background`: 0% · 30% · 100%) */
export const FACE_STOPS = [0, 0.3, 1] as const

/**
 * 창 얼굴의 `t`(0 위 … 1 아래) 자리 색. 입력과 출력 모두 **sRGB 값**이다 — 변환은 부르는 쪽이 한다.
 * 구멍이 창의 어디에 놓였는지(`t`)를 알아야 3D 뒷배경이 창과 이어진다.
 */
export function faceColorAt(t: number, top: Rgb, mid: Rgb, bottom: Rgb): Rgb {
  const c = Math.min(1, Math.max(0, t))
  const [a, b] = FACE_STOPS.slice(1)
  if (c <= a!) return lerp3(top, mid, c / a!)
  return lerp3(mid, bottom, (c - a!) / (b! - a!))
}

/**
 * Khronos PBR Neutral 톤 매핑 — three의 `NeutralToneMapping`과 같은 식이다. 선형 색 · 노출을 곱한 뒤의 값.
 * 렌더러가 마지막 패스에서 모든 픽셀에 이것을 건다 — 뒷배경 색도 예외가 아니라서, 창 얼굴과 같은 색으로
 * 보이려면 그 역을 미리 먹여야 한다 (`precompensate`).
 */
export function neutralTone(c: Rgb, exposure = 1): Rgb {
  const startCompression = 0.8 - 0.04
  const desaturation = 0.15
  let r = c[0] * exposure
  let g = c[1] * exposure
  let b = c[2] * exposure
  const x = Math.min(r, g, b)
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04
  r -= offset
  g -= offset
  b -= offset
  const peak = Math.max(r, g, b)
  if (peak < startCompression) return [r, g, b]
  const d = 1 - startCompression
  const newPeak = 1 - (d * d) / (peak + d - startCompression)
  const scale = newPeak / peak
  r *= scale
  g *= scale
  b *= scale
  const mix = 1 - 1 / (desaturation * (peak - newPeak) + 1)
  return [r + (newPeak - r) * mix, g + (newPeak - g) * mix, b + (newPeak - b) * mix]
}

/**
 * `neutralTone`을 거친 뒤 `target`이 되는 입력 (선형 색). 식이 채널을 섞어서(최솟값 오프셋 · 탈채도) 닫힌 꼴의
 * 역이 없다 — 반복으로 푼다. 밝은 쪽은 식이 눌러서 기울기가 0.25 안팎이라 오차를 그대로 더하면 너무 느리다 —
 * 그 자리의 기울기(유한 차분)로 나눠 민다.
 *
 * ⚠️ **닿을 수 없는 색이 있다.** 식은 1에 점근해서 목표 최댓값이 0.97쯤을 넘으면 입력이 수십 배로 커진다
 * (그 자리에서 채널이 모두 최댓값 쪽으로 섞이기도 한다). 반복 상한이 있어 던지지는 않고 가장 가까운 값을 낸다 —
 * 창 얼굴의 맨 위 줄(거의 흰색)이 그렇고, 구멍은 그보다 아래에 놓인다
 */
export function precompensate(target: Rgb, exposure = 1): Rgb {
  let g: [number, number, number] = [target[0] / exposure, target[1] / exposure, target[2] / exposure]
  const eps = 1e-4
  for (let i = 0; i < 40; i++) {
    const f = neutralTone(g, exposure)
    const err = [target[0] - f[0], target[1] - f[1], target[2] - f[2]] as const
    if (Math.abs(err[0]) + Math.abs(err[1]) + Math.abs(err[2]) < 1e-8) break
    // 야코비안 (열 = 입력 채널) — 유한 차분
    const J: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for (let c = 0; c < 3; c++) {
      const h: [number, number, number] = [g[0], g[1], g[2]]
      h[c] = h[c]! + eps
      const fh = neutralTone(h, exposure)
      for (let r = 0; r < 3; r++) J[r]![c] = (fh[r]! - f[r]!) / eps
    }
    const step = solve3(J, err)
    if (step === null) break
    g = [Math.max(0, g[0] + step[0]), Math.max(0, g[1] + step[1]), Math.max(0, g[2] + step[2])]
  }
  return g
}

/** 3×3 연립 (크래머). 특이하면 null */
function solve3(m: readonly (readonly number[])[], b: Rgb): [number, number, number] | null {
  const det = (a: readonly (readonly number[])[]): number => (
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!)
    - a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!)
    + a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!)
  )
  const d = det(m)
  if (Math.abs(d) < 1e-12) return null
  const col = (c: number): number => det(m.map((row, r) => row.map((v, k) => (k === c ? b[r]! : v))))
  return [col(0) / d, col(1) / d, col(2) / d]
}

/** 흔들림 — y축으로 ±20°를 8초에 (SYSTEM §2.4 「움직임」). 한 바퀴 돌리지 않는다 */
const SWAY = { degrees: 20, seconds: 8 } as const

/** 시간(초) → 흔들림 각(라디안). `reduced`면 0 */
export function swayAngle(seconds: number, reduced: boolean): number {
  if (reduced) return 0
  return Math.sin((seconds / SWAY.seconds) * Math.PI * 2) * ((SWAY.degrees * Math.PI) / 180)
}
