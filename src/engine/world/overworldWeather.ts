// 지금 걸린 날씨 (PARITY §8.3 · `FieldOverworldState`)
//
// 맵 헤더에 적힌 날씨와 **지금 걸린 날씨는 다른 값**이다. 원작은 뒤엣것을 따로
// 들고 있고(`field_overworld_state.c`), 화면도 스크립트도 그쪽을 본다.
//
// ⚠️ **맵을 나가도 남는 값이 아니다.** 한동안 문서에 그렇게 적혀 있었는데,
// 원작은 맵을 옮길 때마다 헤더 값으로 **덮어쓴다** (`field_map_change.c:280`).
// 스크립트가 갈아 끼운 날씨는 그 맵을 나가는 순간 사라진다.
//
// ⚠️ **덮어쓸 때 두 자리만 예외다** — 안개제거를 쓴 상태의 안개와 플래시를 쓴
// 상태의 어둠은 **맑음이 된다.** 이게 없으면 비전기술을 써도 화면이 그대로라,
// 안개제거가 아무 일도 안 하는 기술이 된다.
import { YEARLY_WEATHER } from './yearlyWeather'

/**
 * 여기서 쓰는 날씨 번호만 (`constants/overworld_weather.h`).
 *
 * ⚠️ **번호 전체 표를 여기 옮기지 않는다** — 화면 쪽이 번호를 보임새 갈래로
 * 옮기는 표를 이미 들고 있다 (`scene/weatherVisual`). 갈래를 가르는 것은
 * 그리는 쪽 일이고, 여기서 필요한 것은 **덮어쓸 때 예외인 둘**뿐이다
 */
export const OVERWORLD_WEATHER = {
  clear: 0,
  fog: 14,
  darkFlash: 16,
} as const

/**
 * 헤더 날씨 32~36의 시작 (`OVERWORLD_WEATHER_YEARLY_START`). 이 다섯은 날씨가 아니라
 * 날짜 표(`yearlyWeather`)의 열이다 — 212번도로 남쪽·213번도로·216번도로·아큐티 호반·눈설시티
 */
export const YEARLY_WEATHER_START = 32

/** 오늘. 시계에서 읽은 달력 날짜 (`RTCDate`) — 달은 1~12 */
export interface WeatherDate { year: number, month: number, day: number }

/** 지금의 날짜 (본체 시계 = 이 기기의 시계) */
export function nowWeatherDate(now: Date = new Date()): WeatherDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

/** 4로 나뉘고 100으로 안 나뉘거나 400으로 나뉘는 해 (`IsLeapYear`) */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** 평년 기준 달 첫날 앞까지의 날수 (`DayNumberForDate`의 `monthStart`) */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const

/**
 * 헤더 날씨를 오늘의 날씨로 (`FieldSystem_GetWeather`).
 *
 * 32 미만이면 헤더 값 그대로다. 32~36이면 `YEARLY_WEATHER[오늘][헤더 − 32]`다.
 *
 * ⚠️ **표는 윤년 달력이다.** `DayNumberForDate`는 윤년의 3월 이후에 하루를 더해 세고(= 윤년 기준
 * 번호), 평년이면 `GetWeather`가 3월 이후에 하루를 **다시 더해** 같은 행을 가리킨다 — 둘을
 * 한 번에 합치면 하루가 어긋난다.
 *
 * `penalty`는 시계를 돌린 표식(`FieldSystem_HasPenalty`)이다. 서면 1월 2일 행을 읽는다.
 * 우리 게임은 그 표식을 아직 안 세워서 부르는 쪽이 안 넘긴다
 */
export function resolveHeaderWeather(
  headerWeather: number, date: WeatherDate, penalty = false,
): number {
  if (headerWeather < YEARLY_WEATHER_START) return headerWeather
  const leap = isLeapYear(date.year)
  // DayNumberForDate(…) − 1
  let at = date.day + MONTH_START[date.month - 1]! - 1
  if (date.month >= 3 && leap) at++
  if (date.month > 2 && !leap) at++
  if (penalty) at = 1
  const row = YEARLY_WEATHER[at]
  return row?.[headerWeather - YEARLY_WEATHER_START] ?? OVERWORLD_WEATHER.clear
}

/** 지금 걸린 날씨. 한 번에 하나뿐이라 모듈에 둔다 */
export const overworldWeather: { value: number } = { value: OVERWORLD_WEATHER.clear }

/** 비전기술이 세워 둔 표식. `SystemFlag_Check{Flash,Defog}Active`가 읽는 그 둘 */
interface FieldMoveActive {
  flash: boolean
  defog: boolean
}

/**
 * 맵에 들어설 때 걸리는 날씨 (`field_map_change.c`).
 *
 * 헤더 값을 (32~36이면 오늘 날짜의 칸으로 풀어서) 그대로 쓰는데, **안개 + 안개제거**와 **어둠 + 플래시**만 맑음이 된다
 */
export function weatherOnEnter(
  headerWeather: number, active: FieldMoveActive, date: WeatherDate = nowWeatherDate(),
): number {
  headerWeather = resolveHeaderWeather(headerWeather, date)
  if (headerWeather === OVERWORLD_WEATHER.fog && active.defog) return OVERWORLD_WEATHER.clear
  if (headerWeather === OVERWORLD_WEATHER.darkFlash && active.flash) return OVERWORLD_WEATHER.clear
  return headerWeather
}

/** 맵을 옮겼다. 헤더 값으로 덮어쓴다 */
export function enterMapWeather(
  headerWeather: number, active: FieldMoveActive, date: WeatherDate = nowWeatherDate(),
): number {
  overworldWeather.value = weatherOnEnter(headerWeather, active, date)
  return overworldWeather.value
}

/**
 * 스크립트가 날씨를 맑음으로 되돌린다 (`ScrCmd_0C3` · `ScrCmd_0C4`).
 *
 * ⚠️ **바꾸는 명령은 이 둘뿐이고 둘 다 맑음이다.** 원작 스크립트 명령표를
 * 다 훑어도 날씨에 **다른 값**을 넣는 명령은 없다 — 「스크립트가 날씨를 갈아
 * 끼운다」는 곧 「맑게 되돌린다」다
 */
export function clearOverworldWeather(): number {
  overworldWeather.value = OVERWORLD_WEATHER.clear
  return overworldWeather.value
}
