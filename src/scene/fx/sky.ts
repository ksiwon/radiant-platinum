// 하늘과 대기 (PLAN §6.2)
//
// **배경을 단색으로 두면 깊이가 사라진다.** 지평선이 안 보이니 지면이 종이처럼
// 보이고, 멀리 있는 것과 가까이 있는 것이 같은 밝기로 온다. 4세대 본가도 3D로
// 옮겨진 사례(Legends 계열)도 전부 하늘 그라디언트 + 거리 안개로 공간을 만든다.
//
// 셰이더를 쓸 일이 아니다 — 2×N 캔버스 하나면 충분하고, 배틀 무대와 오버월드가
// 같은 함수를 쓰므로 하늘색이 두 화면에서 어긋나지 않는다.
import { CanvasTexture, Color, LinearFilter, SRGBColorSpace } from 'three'

/**
 * **지평선이 그라디언트의 어디에 오는가.** 0.5다.
 *
 * 하늘은 캔버스 위→아래 그라디언트를 구 **전체**에 입힌다. 구의 v는 극각에
 * 비례하고 돔 중심이 y=0이라(`MapStreamer`의 하늘 돔), 수평 시선은 정확히
 * 그라디언트의 한가운데를 본다. 0.5 아래(0.68 · 0.86 · 1)는 적도 밑이라 거의
 * 안 보인다.
 *
 * ⚠️ 그래서 **0.5 자리에 안개색을 정지점으로 박는다.** 이 정지점이 없던 때
 * 지평선은 0.42와 0.68 사이를 보간한 값이었다 — 낮이 #8eb8dc인데 안개는
 * #c3dbe6이라, 안개에 묻힌 먼 땅이 바로 위 하늘보다 밝아서 지형과 하늘 사이에
 * 희뿌연 띠가 떴다. 반대로 안개를 #8eb8dc로 내리면 땅 전체가 파랗고 칙칙해진다.
 * 그래서 안개는 두고 0.42~0.5 구간을 안개색까지 끌어올린다 — 실제 하늘도
 * 지평선 쪽이 희다
 */
export const HORIZON = 0.5

/** 하늘 한 벌. `stops`는 위(0)에서 아래(1)로 간다 */
interface SkyPreset {
  stops: readonly (readonly [number, string])[]
  /**
   * 안개 색. **`HORIZON` 정지점과 같아야 한다** — 먼 지형이 하늘로 녹아든다
   * (`sky.test`가 `skyAt`으로 다섯 벌 전부 잰다)
   */
  fog: string
  /** 안개가 시작하고 끝나는 거리(타일) */
  fogNear: number
  fogFar: number
}

/**
 * 낮.
 *
 * 아래로 갈수록 옅어져 지평선(`HORIZON`)에서 안개색이 된다. 그 밑 0.68~0.86은
 * 적도 아래라 거의 안 보이고, 마지막 정지점은 지면 계열이다 — 하늘색으로
 * 끝내면 지형 끝에 띠가 생긴다.
 */
export const DAY: SkyPreset = {
  stops: [
    [0, '#3f6ea8'],
    [0.42, '#79aad6'],
    [HORIZON, '#c3dbe6'],
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
 * ⚠️ **밤을 세기로만 눌러 어둡게 하면 안 된다.** 땅에 닿는 빛이 낮의 15.0%(밤) ·
 * 8.4%(심야)이던 시절에는 지형이 검은 덩어리로 뭉쳐서, 밤인 줄은 아는데
 * **무엇이 있는지가 안 보였다.**
 *
 * 밤이라는 신호는 밝기가 아니라 **색**이 나른다. 그래서 파란 기를 그대로 두고
 * 밝기만 올린다 — 지금은 42.0%(밤) · 28.1%(심야)다(`groundLight`로 잰 값이다).
 *
 * 밤의 42%가 어디서 왔는가: `NIGHT_FLOOR`다. 사람이 밤에 배경에 안 묻히려면
 * 낮의 42%는 있어야 한다고 이미 정해 뒀는데, **지형과 벽에는 키 라이트가 없다.**
 * 그러니 프리셋 자체가 그 바닥까지 올라와 있어야 한다 — 사람만 밝고 세상은
 * 까만 화면이 나오지 않게. 심야는 밤 아래 같은 비율(0.66)을 지켜 내린다.
 *
 * ⚠️ 하늘 그라디언트(`stops`)와 안개는 **같이 올리지 않는다.** 둘 다 올리면
 * 대비가 그대로라 안 보이던 것은 그대로 안 보이고, 밤만 대낮처럼 밝아진다.
 *
 * ⚠️ 해질녘 반구광 1.06은 눈으로 고른 값이 아니라 **밤을 올리면 따라와야 하는
 * 값**이다. 밤에는 해가 거의 없어서 반구광으로 밝기를 낸다(1.00). 그런데 해질녘이
 * 그보다 낮으면 저녁이 깊어지는 동안 **반구 항이 오른다**. 그러면 `blendLooks`가
 * 섞은 색이 8비트로 반올림되면서 태양 항은 계단으로 내려오는데, 그 **계단 사이**
 * 에서 매끄럽게 오르는 반구 항이 이겨 몸빛이 도로 오른다 — 키 라이트가 세졌다
 * 약해진다. 그래서 **항마다 시간 순으로 줄기만 하게** 잡는다: 반구 항(세기 ×
 * 하늘빛 휘도)이 해질녘 0.482 → 밤 0.442로, 8.3% 여유를 두고 내려간다
 */
export const TIME_LOOKS: readonly TimeLook[] = [
  {
    stops: [[0, '#5b7fae'], [0.4, '#9db6cf'], [HORIZON, '#e0d2c2'], [0.7, '#e2d0bd'], [0.88, '#f0d8bc'], [1, '#b0bd90']],
    fog: '#e0d2c2', fogNear: 34, fogFar: 120,
    sun: 0.92, sunColor: '#ffe6c4', ambient: 0.82,
    skyColor: '#cfe0f0', groundColor: '#9a8a6a', fill: 0.34,
  },
  {
    stops: [[0, '#3f6ea8'], [0.42, '#79aad6'], [HORIZON, '#c3dbe6'], [0.68, '#bcd9ea'], [0.86, '#dcebe8'], [1, '#a8bf94']],
    fog: '#c3dbe6', fogNear: 38, fogFar: 130,
    sun: 1.05, sunColor: '#fff4e0', ambient: 0.85,
    skyColor: '#d4e9f7', groundColor: '#8d8468', fill: 0.38,
  },
  {
    stops: [[0, '#37507f'], [0.36, '#7d6a97'], [HORIZON, '#d99a70'], [0.64, '#d78b62'], [0.85, '#f0a86a'], [1, '#9a8a63']],
    fog: '#d99a70', fogNear: 30, fogFar: 110,
    sun: 0.78, sunColor: '#ffbe86', ambient: 1.06,
    skyColor: '#e0a882', groundColor: '#6e5a44', fill: 0.30,
  },
  {
    stops: [[0, '#243459'], [0.42, '#3a4f7d'], [HORIZON, '#5b6d9c'], [0.72, '#57709f'], [0.9, '#7387ac'], [1, '#65707f']],
    fog: '#5b6d9c', fogNear: 26, fogFar: 100,
    sun: 0.45, sunColor: '#9fb6e0', ambient: 1.00,
    skyColor: '#99b2e4', groundColor: '#6b7285', fill: 0.34,
  },
  {
    stops: [[0, '#182444'], [0.42, '#26365c'], [HORIZON, '#425678'], [0.72, '#3c507c'], [0.9, '#4f6091'], [1, '#4a525f']],
    fog: '#425678', fogNear: 22, fogFar: 88,
    sun: 0.36, sunColor: '#8ea6d6', ambient: 0.80,
    skyColor: '#8aa4de', groundColor: '#5a6172', fill: 0.28,
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
/**
 * **해가 안 닿는 쪽에서 넣는 되비침.**
 *
 * ⚠️ 태양(24, 42, 18)도 필(−14, 12, 26)도 **둘 다 남쪽에서 온다.** 3인칭
 * 카메라가 남쪽 고정이라 그렇게 잡았는데, 그러면 **북쪽을 보는 면에는 방향광이
 * 하나도 안 닿는다.** 반구광만 받아서, 실측으로 남쪽 벽의 42.8%다(`wallLight`).
 * 마을을 걸으면 내 남쪽에 선 집은 늘 북면을 보이므로 그 벽이 늘 검다.
 *
 * 그래서 **태양의 수평 반대편**(−24, −18)에서 낮게 넣는다. 낮게 두는 이유는
 * 지붕까지 밝히지 않기 위해서다 — 여덟 높이면 위쪽 성분이 0.26이라 지붕에는
 * 거의 안 얹힌다. 세기는 상수가 아니라 `backFill`이 **모자란 만큼** 낸다
 */
export const BACK_DIR: readonly [number, number, number] = [-24, 8, -18]

/**
 * **밑에서 올려 쏘는 빛.** 깨어진 세계에서만 켠다 (`MapStreamer`).
 *
 * ⚠️ 여기 광원 셋이 **전부 위에서 온다.** 보통 맵에서는 아래를 보는 면을 볼
 * 일이 없으니 그래도 됐는데, 깨어진 세계는 **천장 판 밑면을 걸어 다닌다** —
 * 그 면의 법선이 (0,−1,0)이라 태양·필·되비침이 하나도 안 닿고 반구광의
 * 아래쪽 색만 받는다. `faceLight`로 재면 윗면의 **11.8%**다 (되비침까지 켠 값이다 —
 * 되비침을 빼면 12.6%인데, 그건 화면에 없는 상태다).
 *
 * 화면으로도 그렇게 나왔다: B4F 천장 평균휘도 0.023 — 같은 잣대로 연고시티가
 * 0.198이라 **1/8.5**고, 화면의 76%가 순수 검정이었다. 주인공만 배경의
 * 5.9배로 떠서 붙여 놓은 그림처럼 보였다.
 *
 * 방향은 **태양을 수평면에 비춘 것**이다 — 같은 빛이 밑에서 되비쳐 오는
 * 셈이라 그늘지는 쪽이 안 바뀐다
 */
export const DOWN_DIR: readonly [number, number, number] = [24, -42, 18]

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

/**
 * **평평한 땅이 받는 빛**. 세기 × 빛 색의 휘도를 셋 더한 것이다.
 *
 * `bodyLight`와 따로 있는 이유: 저쪽은 사람 몸(둥근 것)이라 반구 평균을 쓰고
 * 키 라이트가 얹힌다. 이쪽은 위를 보는 평면이라 반구광을 통째로 받는다.
 *
 * 시간대 사다리 (낮 대비): 아침 83.0% · 낮 100% · 해질녘 56.5% · 밤 42.0% ·
 * 심야 28.1%
 */
export function groundLight(look: TimeLook): number {
  return faceLight(look, UP, backFill(look))
}

/** 위를 보는 면 */
const UP: readonly [number, number, number] = [0, 1, 0]

/**
 * 사방을 보는 세로면 넷. 건물의 네 벽이다.
 *
 * 여기서 재는 이유: 반구광은 세로면이면 방향과 무관하게 같은 값을 주므로,
 * 벽마다 갈리는 것은 **방향광 셋뿐**이다. 그 셋이 어느 벽을 비우는지가 곧
 * 화면에서 검게 뭉치는 자리다
 */
const WALL_NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
]

/** 방향광의 램버트 계수. `normal`은 단위 벡터다 */
function lambert(dir: readonly [number, number, number],
  normal: readonly [number, number, number]): number {
  const len = Math.hypot(...dir)
  const dot = (dir[0] * normal[0] + dir[1] * normal[1] + dir[2] * normal[2]) / len
  return dot > 0 ? dot : 0
}

/** 반구광이 그 법선에 주는 몫. three의 `hemisphereLight` 그대로다 */
function hemisphere(look: TimeLook, normal: readonly [number, number, number]): number {
  const t = 0.5 * normal[1] + 0.5
  return look.ambient * (luminance(look.groundColor) * (1 - t) + luminance(look.skyColor) * t)
}

/**
 * 그 방향을 보는 면이 받는 빛. 광원 넷을 램버트로 더한 것이다.
 *
 * 시간대 다섯 벌 전부에서 **제일 어두운 벽이 제일 밝은 벽의 얼마인지**를
 * 이걸로 잰다 (`sky.test`)
 */
export function faceLight(
  look: TimeLook, normal: readonly [number, number, number], back = 0,
): number {
  return hemisphere(look, normal)
    + luminance(look.sunColor) * look.sun * lambert(SUN_DIR, normal)
    + luminance(look.skyColor) * look.fill * lambert(FILL_DIR, normal)
    + luminance(look.skyColor) * back * lambert(BACK_DIR, normal)
}

/**
 * 되비침 세기.
 *
 * **고정 상수가 아니라 모자란 만큼이다** — 키 라이트(`characterKey`)와 같은
 * 방식이다. 프리셋을 다시 손보면 이 값도 따라 움직인다.
 *
 * 목표치를 어디에 둘지가 문제인데, **해가 이미 만들어 둔 차이**를 쓴다:
 * 볕 드는 벽이 지붕의 몇 할인지(낮 64.7%)를 재서, 벽과 벽 사이가 그보다 더
 * 벌어지지 않게 한다. 우리가 고른 숫자가 아니라 이 장면에 이미 있던 대비다
 */
export function backFill(look: TimeLook): number {
  const base = WALL_NORMALS.map((n) => faceLight(look, n))
  const bright = Math.max(...base)
  const dark = Math.min(...base)
  // 해가 벽과 지붕 사이에 만들어 둔 비율. 벽끼리는 이보다 더 벌어지면 안 된다
  const want = bright / faceLight(look, UP)
  const at = WALL_NORMALS[base.indexOf(dark)]!
  const gain = luminance(look.skyColor) * lambert(BACK_DIR, at)
  if (gain <= 0) return 0
  const short = want * bright - dark
  return short <= 0 ? 0 : short / gain
}

/** 아래를 보는 면 — 깨어진 세계의 천장 판이 걷는 면이다 */
const DOWN: readonly [number, number, number] = [0, -1, 0]

/**
 * 밑빛 세기 (`DOWN_DIR`). **깨어진 세계에서만 켠다.**
 *
 * `backFill`과 같은 방식이다 — 고른 숫자가 아니라 **모자란 만큼**이라, 프리셋을
 * 다시 손보면 이 값도 따라 움직인다.
 *
 * 목표치도 `backFill`이 쓰는 것과 같은 잣대다: **해가 벽과 지붕 사이에 이미
 * 만들어 둔 비율**(낮 64.7%)까지 아랫면을 올린다. 아랫면을 윗면과 같게 만들면
 * 명암이 사라져 판때기가 납작해지고, 그냥 두면 천장 판이 검게 뭉친다
 */
export function downFill(look: TimeLook): number {
  // 볕 드는 벽이 지붕의 몇 할인지 — 그 자리까지 아랫면을 끌어올린다
  const bright = Math.max(...WALL_NORMALS.map((n) => faceLight(look, n)))
  const gain = luminance(look.skyColor) * lambert(DOWN_DIR, DOWN)
  if (gain <= 0) return 0
  const short = bright - faceLight(look, DOWN)
  return short <= 0 ? 0 : short / gain
}

/**
 * 인물 키 라이트 (플레이어 발밑 기준, 미터).
 *
 * **밤에 빛을 줄이면 사람도 같이 사라진다.** 심야의 몸빛은 낮의 25.6%라 실루엣이
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
 * 낮 대비 몸빛이 해질녘 54.9% · 밤 38.2% · 심야 25.6%라 그 사이를 잡았다
 * (`sky.test`가 이 자리를 지킨다).
 *
 * 이 값은 **밤 프리셋 자체의 바닥**이기도 하다 — 키 라이트가 없는 지형·벽도
 * 여기까지는 올라와 있어야 사람만 밝고 세상은 까만 화면이 안 나온다
 */
export const NIGHT_FLOOR = 0.42

/**
 * 사람 몸이 받는 밝기의 어림. 세 광원을 램버트로 더한 것이다.
 *
 * ⚠️ **세기만 더하면 안 된다.** 밤이 어둡다는 느낌의 절반은 색이 만든다 —
 * 밤 하늘빛 `#99b2e4`의 휘도가 낮 `#d4e9f7`의 절반을 겨우 넘는다. 세기만 보면
 * 밤이 낮의 79%인데 화면에서는 38%다. 그 차이가 키 라이트를 켤지 말지를
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
 * 그라디언트의 `v` 자리 색. 캔버스 `createLinearGradient`와 같은 계산이다 —
 * 이웃한 두 정지점을 sRGB 8비트에서 선형으로 잇고, 양끝 밖은 끝 색으로 붙든다.
 *
 * 안개색이 지평선과 맞는지를 이걸로 잰다. 눈으로 맞추면 어긋난다
 */
export function skyAt(stops: SkyPreset['stops'], v: number): string {
  const first = stops[0]!, last = stops[stops.length - 1]!
  if (v <= first[0]) return first[1]
  if (v >= last[0]) return last[1]
  for (let i = 1; i < stops.length; i++) {
    const [at, col] = stops[i]!
    if (v > at) continue
    const [prevAt, prevCol] = stops[i - 1]!
    return at === prevAt ? col : mixHex(prevCol, col, (v - prevAt) / (at - prevAt))
  }
  return last[1]
}

/** 날씨가 하늘·안개를 물들이는 몫. `weatherFogProfile`의 `tint`·`mix`다 */
interface SkyAtmosphere {
  tint: string
  mix: number
}

/**
 * 날씨를 탄 안개색. `MapStreamer`가 안개에 넣는 것과 **같은 계산**이다 —
 * three `Color`의 `lerp`라 선형 공간에서 섞는다. `mixHex`(sRGB)로 섞으면 지평선
 * 정지점과 안개가 몇 단계씩 어긋난다
 */
export function weatherFogColor(preset: SkyPreset, atmosphere: SkyAtmosphere): string {
  if (atmosphere.mix <= 0) return preset.fog
  return `#${new Color(preset.fog).lerp(new Color(atmosphere.tint), atmosphere.mix).getHexString()}`
}

/**
 * 천정이 날씨에 물드는 비율. 지평선은 1이다.
 *
 * 하늘 전체를 안개와 같은 비율로 누르면 흐린 날도 그라디언트가 사라져 회색
 * 판이 된다. 천정을 덜 누르면 맑음·흐림은 위가 짙고 아래가 흰 하늘을 지키고,
 * 폭풍·안개처럼 `mix`가 큰 날만 하늘이 납작한 잿빛으로 내려앉는다
 */
export const ZENITH_WEATHER = 0.6

/**
 * 날씨를 탄 정지점. `atmosphere`가 없거나 `mix`가 0이면 그대로 돌려준다.
 *
 * ⚠️ 각 정지점을 **안개와 같은 날씨색(`tint`)** 쪽으로 섞는다 — 안개색이 아니라.
 * 그래야 지평선 정지점(= `preset.fog`)이 `weatherFogColor`와 정확히 같아진다.
 * 안개색 쪽으로 `mix`만큼 섞으면 지평선이 안개에 못 미쳐 띠가 다시 뜬다.
 *
 * 비율은 천정 `mix × ZENITH_WEATHER`에서 지평선 `mix`까지 오르고, 지평선 밑은
 * 지평선과 같다
 */
export function skyStops(
  preset: SkyPreset, atmosphere?: SkyAtmosphere,
): SkyPreset['stops'] {
  if (!atmosphere || atmosphere.mix <= 0) return preset.stops
  const tint = new Color(atmosphere.tint)
  return preset.stops.map(([at, col]) => {
    const up = Math.min(1, at / HORIZON)
    const k = atmosphere.mix * (ZENITH_WEATHER + (1 - ZENITH_WEATHER) * up)
    return [at, `#${new Color(col).lerp(tint, k).getHexString()}`] as const
  })
}

/**
 * 그라디언트 텍스처. 구(sphere) 안쪽에 입힌다.
 *
 * `atmosphere`는 야외 날씨다 (`weatherFogProfile`). 비·폭풍·안개 날에 하늘만
 * 맑은 파랑으로 남으면 회청색 안개에 묻힌 땅 위로 쨍한 하늘이 떠서 둘 사이에
 * 밝은 단절선이 생긴다 — 1인칭은 하늘이 화면 절반이라 특히 어색했다.
 *
 * ⚠️ 구를 `scale={[-1,1,1]}`로 뒤집으면 안 된다 — 감기 방향만 바뀌고 컬링은
 * 그대로라 통째로 안 보인다(배틀 무대에서 그렇게 만들었다가 배경이 검게 나왔다).
 * `side={BackSide}`가 맞다.
 */
export function makeSkyTexture(
  preset: SkyPreset, atmosphere?: SkyAtmosphere,
): CanvasTexture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  for (const [at, color] of skyStops(preset, atmosphere)) grad.addColorStop(at, color)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 2, 256)
  const tex = new CanvasTexture(canvas)
  // 이름은 GPU 라벨로 그대로 간다 — 안 붙이면 오류가 `unlabeled`라고만 한다 (REPAIR §48)
  tex.name = 'sky-gradient'
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
  // 이름은 GPU 라벨로 그대로 간다 — 안 붙이면 오류가 `unlabeled`라고만 한다 (REPAIR §48)
  tex.name = 'blob-shadow'
  tex.colorSpace = SRGBColorSpace
  return tex
}
