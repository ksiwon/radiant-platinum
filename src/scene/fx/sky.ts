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
    stops: [[0, '#16213f'], [0.42, '#26365c'], [0.72, '#3e527d'], [0.9, '#57688c'], [1, '#4a5563']],
    fog: '#42517a', fogNear: 22, fogFar: 88,
    sun: 0.34, sunColor: '#9fb6e0', ambient: 0.54,
    skyColor: '#5b74a8', groundColor: '#3a3d4a', fill: 0.22,
  },
  {
    stops: [[0, '#0d1428'], [0.42, '#182444'], [0.72, '#28375c'], [0.9, '#38476d'], [1, '#333a48']],
    fog: '#2c3a5c', fogNear: 18, fogFar: 76,
    sun: 0.24, sunColor: '#8ea6d6', ambient: 0.44,
    skyColor: '#48608f', groundColor: '#2c2f3a', fill: 0.17,
  },
]

/**
 * 인물 키 라이트 (플레이어 발밑 기준, 미터).
 *
 * **밤에 빛을 줄이면 사람도 같이 사라진다.** 심야의 몸빛은 낮의 35%라 실루엣이
 * 배경에 묻힌다(아래 `bodyLight`로 잰 값이다). 실제 게임들이 밤을
 * "그냥 어둡게"가 아니라 **인물만 따로 세우는 빛**으로 다루는 이유가 그거다.
 *
 * ⚠️ 빛을 대상별로 가릴 수는 없다 — three는 광원을 **카메라 레이어**로만 거른다
 * (`three.module.js`의 `object.isLight && object.layers.test(camera.layers)`).
 * 그래서 감쇠가 있는 점광원을 사람에게 붙이고 거리를 짧게 끊는다. 발밑에
 * 얕게 번지는 것은 덤이 아니라 노린 것이다 — 달빛 웅덩이로 읽힌다.
 */
export const CHAR_KEY_OFFSET: readonly [number, number, number] = [0.45, 1.85, 0.55]
/** 빛이 닿는 거리. 이 너머는 0이라 웅덩이가 여기서 끝난다 */
export const CHAR_KEY_RANGE = 4

/** 몸통 중심 높이와 반지름. 빛에서 **살갗까지**의 거리를 재려고 쓴다 */
const BODY_CENTER = 0.95
const BODY_RADIUS = 0.22
/** 정면광이 몸의 밝은 면에 얹히는 몫. 반구광·필은 반구 평균으로 본다 */
const N_DOT_SUN = 0.7
const HEMI_MEAN = 0.5
/** 밤의 인물을 낮의 몇 할까지 끌어올릴 것인가. 1이면 밤이 아니다 */
const NIGHT_FLOOR = 0.6

/** 사람 몸이 받는 조도의 어림. 세 광원을 램버트로 더한 것이다 */
export function bodyLight(look: TimeLook): number {
  return look.sun * N_DOT_SUN + (look.ambient + look.fill) * HEMI_MEAN
}

/** three의 `getDistanceAttenuation` 그대로 (decay 2) */
function attenuation(distance: number, range: number): number {
  const falloff = 1 / Math.max(distance * distance, 0.01)
  const cut = Math.max(0, 1 - (distance / range) ** 4)
  return falloff * cut * cut
}

/** 세기 1의 키 라이트가 몸의 밝은 면에 얹는 조도 */
export const CHAR_KEY_GAIN = (() => {
  const [x, y, z] = CHAR_KEY_OFFSET
  const reach = Math.hypot(x, y - BODY_CENTER, z) - BODY_RADIUS
  return attenuation(reach, CHAR_KEY_RANGE) * N_DOT_SUN
})()

/**
 * 키 라이트 세기.
 *
 * 고정 상수가 아니라 **모자란 만큼**이다 — 위 프리셋을 다시 손보면 이 값도 따라
 * 움직인다. 낮·아침처럼 이미 밝은 시간대에는 0이 되어 아예 꺼진다
 */
export function characterKey(look: TimeLook): number {
  const short = NIGHT_FLOOR * bodyLight(TIME_LOOKS[1]!) - bodyLight(look)
  return short <= 0 ? 0 : short / CHAR_KEY_GAIN
}

/** 키 라이트까지 얹은 몸빛. 밤에도 낮의 `NIGHT_FLOOR` 아래로는 안 내려간다 */
export function litBody(look: TimeLook): number {
  return bodyLight(look) + characterKey(look) * CHAR_KEY_GAIN
}

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
