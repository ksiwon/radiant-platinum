// 하늘과 대기 (PLAN §6.2)
//
// **배경을 단색으로 두면 깊이가 사라진다.** 지평선이 안 보이니 지면이 종이처럼
// 보이고, 멀리 있는 것과 가까이 있는 것이 같은 밝기로 온다. 4세대 본가도 3D로
// 옮겨진 사례(Legends 계열)도 전부 하늘 그라디언트 + 거리 안개로 공간을 만든다.
//
// 셰이더를 쓸 일이 아니다 — 2×N 캔버스 하나면 충분하고, 배틀 무대와 오버월드가
// 같은 함수를 쓰므로 하늘색이 두 화면에서 어긋나지 않는다.
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

/** 하늘 한 벌. `stops`는 위(0)에서 아래(1)로 간다 */
export interface SkyPreset {
  stops: readonly (readonly [number, string])[]
  /** 안개 색. 지평선 색과 같아야 먼 지형이 하늘로 녹아든다 */
  fog: string
  /** 안개가 시작하고 끝나는 거리(타일) */
  fogNear: number
  fogFar: number
}

/**
 * 낮.
 *
 * 아래로 갈수록 옅어지다 지평선에서 지면 색으로 넘어간다. 마지막 정지점을
 * 지면 계열로 두는 것이 요령이다 — 하늘색으로 끝내면 지평선에 띠가 생긴다.
 */
export const DAY: SkyPreset = {
  stops: [
    [0, '#3f6ea8'],
    [0.42, '#79aad6'],
    [0.68, '#bcd9ea'],
    [0.86, '#dcebe8'],
    [1, '#a8bf94'],
  ],
  fog: '#c3dbe6',
  fogNear: 38,
  fogFar: 130,
}

/**
 * 시간대 다섯 벌. 경계는 원작 `rtc.c`가 정한다 (`map/timeOfDay`).
 *
 * 아침은 낮은 해가 아래를 물들이고, 해질녘은 지평선이 주황으로 타고, 밤은
 * 위가 짙고 아래가 옅으며, 심야는 그보다 더 어둡고 푸르다. 안개색을 지평선
 * 색과 맞추는 규칙은 낮과 같다 — 어긋나면 먼 지형에 띠가 생긴다.
 *
 * 빛도 같이 바뀐다. 하늘만 물들이고 조명을 그대로 두면 한밤중에 대낮처럼
 * 밝은 땅이 남는다
 */
export interface TimeLook extends SkyPreset {
  /** 태양 세기와 색 */
  sun: number
  sunColor: string
  /** 반구광 세기와 위·아래 색 */
  ambient: number
  skyColor: string
  groundColor: string
  /** 카메라 쪽 필 빛 */
  fill: number
}

/** 색인이 `TimeOfDay` 값이다 — 아침 · 낮 · 해질녘 · 밤 · 심야 */
export const TIME_LOOKS: readonly TimeLook[] = [
  {
    stops: [[0, '#5b7fae'], [0.4, '#9db6cf'], [0.7, '#e2d0bd'], [0.88, '#f0d8bc'], [1, '#b0bd90']],
    fog: '#e0d2c2', fogNear: 34, fogFar: 120,
    sun: 0.92, sunColor: '#ffe6c4', ambient: 0.82,
    skyColor: '#cfe0f0', groundColor: '#9a8a6a', fill: 0.34,
  },
  {
    stops: [[0, '#3f6ea8'], [0.42, '#79aad6'], [0.68, '#bcd9ea'], [0.86, '#dcebe8'], [1, '#a8bf94']],
    fog: '#c3dbe6', fogNear: 38, fogFar: 130,
    sun: 1.05, sunColor: '#fff4e0', ambient: 0.85,
    skyColor: '#d4e9f7', groundColor: '#8d8468', fill: 0.38,
  },
  {
    stops: [[0, '#37507f'], [0.36, '#7d6a97'], [0.64, '#d78b62'], [0.85, '#f0a86a'], [1, '#9a8a63']],
    fog: '#d99a70', fogNear: 30, fogFar: 110,
    sun: 0.78, sunColor: '#ffbe86', ambient: 0.66,
    skyColor: '#e0a882', groundColor: '#6e5a44', fill: 0.26,
  },
  {
    stops: [[0, '#0e1730'], [0.42, '#1c2a4c'], [0.72, '#33456c'], [0.9, '#4a5a7c'], [1, '#3b4450']],
    fog: '#37456a', fogNear: 22, fogFar: 88,
    sun: 0.26, sunColor: '#9fb6e0', ambient: 0.42,
    skyColor: '#4a6294', groundColor: '#2a2c36', fill: 0.16,
  },
  {
    stops: [[0, '#070c1c'], [0.42, '#101a35'], [0.72, '#1e2b4c'], [0.9, '#2c3a5c'], [1, '#262c38']],
    fog: '#222e4c', fogNear: 18, fogFar: 76,
    sun: 0.18, sunColor: '#8ea6d6', ambient: 0.34,
    skyColor: '#38507e', groundColor: '#1e2029', fill: 0.12,
  },
]

/** 두 시간대 사이를 섞는다. 경계에서 하늘이 툭 바뀌지 않게 한다 */
export function blendLooks(a: TimeLook, b: TimeLook, k: number): TimeLook {
  if (k <= 0) return a
  if (k >= 1) return b
  const n = (x: number, y: number) => x + (y - x) * k
  const c = (x: string, y: string) => mixHex(x, y, k)
  return {
    stops: a.stops.map(([at, col], i) => [at, c(col, b.stops[i]?.[1] ?? col)] as const),
    fog: c(a.fog, b.fog),
    fogNear: n(a.fogNear, b.fogNear),
    fogFar: n(a.fogFar, b.fogFar),
    sun: n(a.sun, b.sun),
    sunColor: c(a.sunColor, b.sunColor),
    ambient: n(a.ambient, b.ambient),
    skyColor: c(a.skyColor, b.skyColor),
    groundColor: c(a.groundColor, b.groundColor),
    fill: n(a.fill, b.fill),
  }
}

/** `#rrggbb` 두 개를 섞는다. three를 안 쓰는 이유는 하늘 캔버스가 문자열을 받아서다 */
export function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (sh: number) => {
    const va = (pa >> sh) & 255, vb = (pb >> sh) & 255
    return Math.round(va + (vb - va) * k)
  }
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

/**
 * 그라디언트 텍스처. 구(sphere) 안쪽에 입힌다.
 *
 * ⚠️ 구를 `scale={[-1,1,1]}`로 뒤집으면 안 된다 — 감기 방향만 바뀌고 컬링은
 * 그대로라 통째로 안 보인다(배틀 무대에서 그렇게 만들었다가 배경이 검게 나왔다).
 * `side={BackSide}`가 맞다.
 */
export function makeSkyTexture(preset: SkyPreset): CanvasTexture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  for (const [at, color] of preset.stops) grad.addColorStop(at, color)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 2, 256)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  return tex
}

/**
 * 발밑 그림자용 원형 감쇠 텍스처.
 *
 * 방향광 그림자 맵을 켜는 것보다 훨씬 싸고, 타일이 인스턴스 메시라 그림자
 * 캐스터가 수만 개가 되는 상황에서는 이쪽이 더 안정적이다.
 */
export function makeBlobShadow(): CanvasTexture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.5)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.26)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}
