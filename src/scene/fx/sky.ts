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

/**
 * 색인이 `TimeOfDay` 값이다 — 아침 · 낮 · 해질녘 · 밤 · 심야.
 *
 * ⚠️ **밤을 세기로만 눌러 어둡게 하면 안 된다.** 예전 값은 땅에 닿는 빛이 낮의
 * 15.0%(밤) · 8.4%(심야)였다(`groundLight`로 잰 값이다). 그 정도면 지형이 검은
 * 덩어리로 뭉쳐서, 밤인 줄은 아는데 **무엇이 있는지가 안 보인다.**
 *
 * 밤이라는 신호는 밝기가 아니라 **색**이 나른다. 그래서 파란 기를 그대로 두고
 * 밝기만 올렸다 — 지금은 33%(밤) · 23%(심야)다. `sky.test`가 이 사다리를 지킨다
 */
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
    stops: [[0, '#243459'], [0.42, '#3a4f7d'], [0.72, '#57709f'], [0.9, '#7387ac'], [1, '#65707f']],
    fog: '#5b6d9c', fogNear: 26, fogFar: 100,
    sun: 0.45, sunColor: '#9fb6e0', ambient: 0.80,
    skyColor: '#8fa8d8', groundColor: '#5a6070', fill: 0.32,
  },
  {
    stops: [[0, '#182444'], [0.42, '#26365c'], [0.72, '#3c507c'], [0.9, '#4f6091'], [1, '#4a525f']],
    fog: '#425678', fogNear: 22, fogFar: 88,
    sun: 0.36, sunColor: '#8ea6d6', ambient: 0.68,
    skyColor: '#7e98cc', groundColor: '#4a5060', fill: 0.26,
  },
]

/**
 * 광원이 서는 자리. `MapStreamer`가 이 값으로 빛을 놓는다.
 *
 * 여기 있는 이유는 `groundLight`가 **입사각을 알아야** 밝기를 잴 수 있어서다 —
 * 두 군데 적어 두면 잣대와 화면이 조용히 어긋난다
 */
export const SUN_DIR: readonly [number, number, number] = [24, 42, 18]
export const FILL_DIR: readonly [number, number, number] = [-14, 12, 26]

/** sRGB 한 채널을 선형으로. 밝기는 선형에서 재야 뜻이 있다 */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** `#rrggbb`의 선형 휘도 (Rec.709) */
export function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16)
  const r = toLinear(((v >> 16) & 255) / 255)
  const g = toLinear(((v >> 8) & 255) / 255)
  const b = toLinear((v & 255) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 방향 벡터의 위쪽 성분 — 평평한 땅에서의 램버트 계수다 */
function upward(dir: readonly [number, number, number]): number {
  return dir[1] / Math.hypot(...dir)
}

/**
 * **평평한 땅이 받는 빛**. 세기 × 빛 색의 휘도를 셋 더한 것이다.
 *
 * `bodyLight`와 따로 있는 이유: 저쪽은 사람 몸(둥근 것)이라 반구 평균을 쓰고
 * 키 라이트가 얹힌다. 이쪽은 위를 보는 평면이라 반구광을 통째로 받는다.
 *
 * 시간대 사다리 (낮 대비): 아침 83.3% · 낮 100% · 해질녘 46.3% · 밤 33.6% ·
 * 심야 22.6%
 */
export function groundLight(look: TimeLook): number {
  return luminance(look.skyColor) * look.ambient
    + luminance(look.sunColor) * look.sun * upward(SUN_DIR)
    + luminance(look.skyColor) * look.fill * upward(FILL_DIR)
}

/**
 * 인물 키 라이트 (플레이어 발밑 기준, 미터).
 *
 * **밤에 빛을 줄이면 사람도 같이 사라진다.** 심야의 몸빛은 낮의 20.9%라 실루엣이
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
/**
 * 키 라이트 색.
 *
 * 밤하늘색으로 두면 **색이 세기를 다시 깎는다** — 밝기는 `characterKey`가 이미
 * 정했으므로 차가운 흰색을 쓴다. 여기 있는 이유는 밝기 계산이 이 색의 휘도를
 * 알아야 해서다
 */
export const CHAR_KEY_COLOR = '#eef4ff'

/** 몸통 중심 높이와 반지름. 빛에서 **살갗까지**의 거리를 재려고 쓴다 */
const BODY_CENTER = 0.95
const BODY_RADIUS = 0.22
/** 정면광이 몸의 밝은 면에 얹히는 몫. 반구광·필은 반구 평균으로 본다 */
const N_DOT_SUN = 0.7
const HEMI_MEAN = 0.5
/**
 * 밤의 인물을 낮의 몇 할까지 끌어올릴 것인가. 1이면 밤이 아니다.
 *
 * ⚠️ **해질녘과 밤 사이에 있어야 한다.** 이 값이 해질녘 몸빛보다 높으면 아직
 * 해가 있는데 키 라이트가 켜지고, 밤 몸빛보다 낮으면 정작 밤에 안 켜진다.
 * 낮 대비 몸빛이 해질녘 46.3% · 밤 31.4% · 심야 20.9%라 그 사이를 잡았다
 * (`sky.test`가 이 자리를 지킨다)
 */
export const NIGHT_FLOOR = 0.42

/**
 * 사람 몸이 받는 밝기의 어림. 세 광원을 램버트로 더한 것이다.
 *
 * ⚠️ **세기만 더하면 안 된다.** 밤이 어둡다는 느낌의 절반은 색이 만든다 —
 * 밤 하늘빛 `#8fa8d8`의 휘도가 낮 `#d4e9f7`의 절반이 안 된다. 세기만 보면
 * 밤이 낮의 65%인데 화면에서는 31%다. 그 차이가 키 라이트를 켤지 말지를
 * 가르므로 여기서도 **빛 색의 휘도를 곱한다**
 */
export function bodyLight(look: TimeLook): number {
  return luminance(look.sunColor) * look.sun * N_DOT_SUN
    + luminance(look.skyColor) * (look.ambient + look.fill) * HEMI_MEAN
}

/** three의 `getDistanceAttenuation` 그대로 (decay 2) */
function attenuation(distance: number, range: number): number {
  const falloff = 1 / Math.max(distance * distance, 0.01)
  const cut = Math.max(0, 1 - (distance / range) ** 4)
  return falloff * cut * cut
}

/** 세기 1의 키 라이트가 몸의 밝은 면에 얹는 밝기. 빛 색까지 셈에 든다 */
export const CHAR_KEY_GAIN = (() => {
  const [x, y, z] = CHAR_KEY_OFFSET
  const reach = Math.hypot(x, y - BODY_CENTER, z) - BODY_RADIUS
  return attenuation(reach, CHAR_KEY_RANGE) * N_DOT_SUN * luminance(CHAR_KEY_COLOR)
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
