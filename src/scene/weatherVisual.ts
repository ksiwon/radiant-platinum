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
    // 32~36은 날짜 표를 가리키는 다섯 지역이다. 표를 못 읽는 프레임에도
    // 지역의 주된 날씨가 보이게 한다: 212·213번도로는 비, 북부 셋은 눈.
    case 32: case 33: return 'rain'
    case 34: case 35: case 36: return 'snow'
    default: return 'clear'
  }
}

export interface WeatherProfile {
  count: number
  fall: number
  drift: number
  color: string
  opacity: number
  shape: 'drop' | 'flake' | 'grain' | 'orb'
}

export function weatherProfile(kind: FieldWeatherKind): WeatherProfile | null {
  switch (kind) {
    case 'rain': return { count: 190, fall: 19, drift: 2.2, color: '#a7cfff', opacity: 0.72, shape: 'drop' }
    case 'storm': return { count: 260, fall: 24, drift: 3.6, color: '#c3dcff', opacity: 0.82, shape: 'drop' }
    case 'snow': return { count: 150, fall: 2.5, drift: 1.4, color: '#ffffff', opacity: 0.82, shape: 'flake' }
    case 'blizzard': return { count: 240, fall: 5.2, drift: 8.5, color: '#f1f7ff', opacity: 0.9, shape: 'flake' }
    case 'ash': return { count: 130, fall: 1.6, drift: 2.8, color: '#b6aaa1', opacity: 0.56, shape: 'grain' }
    case 'sand': return { count: 220, fall: 0.35, drift: 11, color: '#d7b66e', opacity: 0.58, shape: 'grain' }
    case 'hail': return { count: 110, fall: 12, drift: 2, color: '#d9f3ff', opacity: 0.86, shape: 'grain' }
    case 'spirits': return { count: 46, fall: -0.55, drift: 1.2, color: '#b58cff', opacity: 0.7, shape: 'orb' }
    default: return null
  }
}

export interface WeatherFogProfile {
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
