export type FieldWeatherKind =
  | 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'blizzard'
  | 'ash' | 'sand' | 'hail' | 'spirits' | 'fog' | 'deepFog' | 'dark'

/** `constants/overworld_weather.h`의 번호를 화면 표현 갈래로 접는다. */
export function fieldWeatherKind(weather: number): FieldWeatherKind {
  switch (weather) {
    case 1: return 'cloudy'
    case 2: case 3: return 'rain'
    case 4: return 'storm'
    case 5: case 6: return 'snow'
    case 7: return 'blizzard'
    case 9: return 'ash'
    case 10: return 'sand'
    case 11: return 'hail'
    case 12: return 'spirits'
    case 14: return 'fog'
    case 15: return 'deepFog'
    case 16: return 'dark'
    // 32~36은 날짜 표를 가리키는 다섯 지역의 헤더 값이고, 맵에 들어설 때 오늘 날짜의
    // 칸으로 풀린다 (`world/overworldWeather`의 `resolveHeaderWeather`). 풀리기 전 값이
    // 들어오는 자리(시험·미리보기)에서도 지역의 주된 날씨가 보이게 한다: 212·213은 비, 북부 셋은 눈
    case 32: case 33: return 'rain'
    case 34: case 35: case 36: return 'snow'
    default: return 'clear'
  }
}

interface WeatherProfile {
  /** 3인칭 입자 수 */
  count: number
  /**
   * 1인칭 입자 수. 상자가 작아지므로(`FIRST_LAYOUT`) 같은 수로도 여섯 배 빽빽하다.
   *
   * 빗방울만 2.5배로 더 늘린다 — 3인칭 부감은 위에서 내려다보는 겹침 덕에 성긴
   * 비도 비로 읽히지만, 수평 시선에서는 앞에 선 가닥 수가 곧 빗발이다.
   *
   * 값이 가장 큰 폭풍 650개가 프레임당 행렬 갱신 0.09~0.17ms(노드에서 5000프레임
   * 평균, 여러 판) · 그리기 한 번 · 삼각형 10,400개다 — 프레임 예산(16.7ms)의 1%다
   */
  firstCount: number
  fall: number
  drift: number
  color: string
  opacity: number
  shape: 'drop' | 'flake' | 'grain' | 'orb'
}

export function weatherProfile(kind: FieldWeatherKind): WeatherProfile | null {
  switch (kind) {
    case 'rain': return { count: 190, firstCount: 480, fall: 19, drift: 2.2, color: '#a7cfff', opacity: 0.72, shape: 'drop' }
    case 'storm': return { count: 260, firstCount: 650, fall: 24, drift: 3.6, color: '#c3dcff', opacity: 0.82, shape: 'drop' }
    case 'snow': return { count: 150, firstCount: 150, fall: 2.5, drift: 1.4, color: '#ffffff', opacity: 0.82, shape: 'flake' }
    case 'blizzard': return { count: 240, firstCount: 240, fall: 5.2, drift: 8.5, color: '#f1f7ff', opacity: 0.9, shape: 'flake' }
    case 'ash': return { count: 130, firstCount: 130, fall: 1.6, drift: 2.8, color: '#b6aaa1', opacity: 0.56, shape: 'grain' }
    case 'sand': return { count: 220, firstCount: 220, fall: 0.35, drift: 11, color: '#d7b66e', opacity: 0.58, shape: 'grain' }
    case 'hail': return { count: 110, firstCount: 110, fall: 12, drift: 2, color: '#d9f3ff', opacity: 0.86, shape: 'grain' }
    case 'spirits': return { count: 46, firstCount: 46, fall: -0.55, drift: 1.2, color: '#b58cff', opacity: 0.7, shape: 'orb' }
    default: return null
  }
}

/** 카메라 갈래. `worldState.camera.mode`와 같다 */
type WeatherView = 'third' | 'first'

/** 날씨 입자를 까는 상자 */
interface WeatherLayout {
  /** 가로·세로 반폭(타일). 상자는 `2·range × 2·range`다 */
  range: number
  /** 높이(타일) */
  height: number
  /** 상자 중심을 시선 앞쪽으로 미는 거리(타일) */
  ahead: number
  /** 빗방울 원통의 굵기·길이 배율. 기하는 하나고 인스턴스 축척으로 늘린다 */
  dropWidth: number
  dropLength: number
}

/** 3인칭. 플레이어를 가운데 두고 위에서 내려다본다 */
export const THIRD_LAYOUT: WeatherLayout = {
  range: 22, height: 18, ahead: 0, dropWidth: 1, dropLength: 1,
}

/**
 * 1인칭.
 *
 * ⚠️ 3인칭 상자(44×44×18칸)를 그대로 쓰면 비가 0.0055개/칸³라, 85° 화각 앞
 * 10칸 부채꼴(높이 18)에 일곱 가닥 남짓이다 — 안개만 끼고 비는 안 오는 화면이
 * 된다. 그래서 상자를 24×24×10칸으로 줄이고 중심을 시선 앞 5칸으로 민다(뒤
 * 7칸 · 앞 17칸). 비 480개면 0.083개/칸³로 같은 부채꼴에 예순 가닥이 넘는다
 * (`weatherVisual.test`).
 *
 * 빗방울은 반지름 평균 0.015 → 0.025, 길이 0.82 → 1.15다. 눈높이에서 보면
 * 3인칭 굵기로는 한 픽셀도 안 되는 실선이다
 */
export const FIRST_LAYOUT: WeatherLayout = {
  range: 12, height: 10, ahead: 5, dropWidth: 0.025 / 0.015, dropLength: 1.15 / 0.82,
}

export function weatherLayout(view: WeatherView): WeatherLayout {
  return view === 'first' ? FIRST_LAYOUT : THIRD_LAYOUT
}

/** 그 시점에서 그리는 입자 수 */
export function weatherCount(profile: WeatherProfile, view: WeatherView): number {
  return view === 'first' ? profile.firstCount : profile.count
}

/** 인스턴스를 잡아 둘 수. 시점이 바뀌어도 다시 안 만들고 `mesh.count`로 줄인다 */
export function weatherCapacity(profile: WeatherProfile): number {
  return Math.max(profile.count, profile.firstCount)
}

/** 상자 안 입자 밀도(개/칸³) */
export function weatherDensity(profile: WeatherProfile, view: WeatherView): number {
  const { range, height } = weatherLayout(view)
  return weatherCount(profile, view) / (4 * range * range * height)
}

/**
 * 월드 좌표 `world`를 `center` 둘레 `[−range, range)`로 접은 상대 좌표.
 *
 * 1인칭은 상자 중심이 시선을 따라 돈다. 입자를 상자에 붙여 두면 고개를 돌릴
 * 때 빗발 전체가 옆으로 미끄러진다. 그래서 입자는 **월드에 고정된 격자**로
 * 두고 상자는 창문처럼 그 위를 움직인다 — 넘어간 입자는 반대편 끝(뒤쪽이나
 * 안개 속)에서 다시 나온다
 */
export function wrapAround(world: number, center: number, range: number): number {
  const size = range * 2
  return ((((world - center + range) % size) + size) % size) - range
}

interface WeatherFogProfile {
  nearScale: number
  farScale: number
  tint: string
  mix: number
}

/** 필드 기본 안개를 날씨에 맞게 당기고 색만 섞는다. */
export function weatherFogProfile(kind: FieldWeatherKind): WeatherFogProfile {
  switch (kind) {
    case 'cloudy': return { nearScale: 0.82, farScale: 0.82, tint: '#77859d', mix: 0.35 }
    case 'rain': return { nearScale: 0.72, farScale: 0.7, tint: '#647891', mix: 0.42 }
    case 'storm': return { nearScale: 0.55, farScale: 0.5, tint: '#3f4d65', mix: 0.58 }
    case 'snow': return { nearScale: 0.78, farScale: 0.72, tint: '#dbe8f3', mix: 0.38 }
    case 'blizzard': return { nearScale: 0.42, farScale: 0.36, tint: '#d9e6ef', mix: 0.66 }
    case 'ash': return { nearScale: 0.62, farScale: 0.55, tint: '#82766f', mix: 0.52 }
    case 'sand': return { nearScale: 0.38, farScale: 0.34, tint: '#b99a5b', mix: 0.64 }
    case 'hail': return { nearScale: 0.68, farScale: 0.62, tint: '#9eb8c8', mix: 0.4 }
    case 'spirits': return { nearScale: 0.7, farScale: 0.65, tint: '#58477a', mix: 0.38 }
    case 'fog': return { nearScale: 0.28, farScale: 0.3, tint: '#bdc7c7', mix: 0.76 }
    case 'deepFog': return { nearScale: 0.15, farScale: 0.2, tint: '#aebaba', mix: 0.86 }
    case 'dark': return { nearScale: 0.18, farScale: 0.24, tint: '#05070d', mix: 0.9 }
    default: return { nearScale: 1, farScale: 1, tint: '#ffffff', mix: 0 }
  }
}
