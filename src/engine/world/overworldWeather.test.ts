// 지금 걸린 날씨 (PARITY §8.3)
//
// 여기서 못 박는 것이 셋이다 — **덮어쓰는 규칙** · **예외 둘** · **스크립트가
// 넣을 수 있는 값이 맑음뿐이라는 것**.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearOverworldWeather, enterMapWeather, OVERWORLD_WEATHER, overworldWeather, resolveHeaderWeather,
  weatherOnEnter,
} from './overworldWeather'
import { YEARLY_WEATHER } from './yearlyWeather'

const NONE = { flash: false, defog: false }
const BOTH = { flash: true, defog: true }
/** 비 (`OVERWORLD_WEATHER_RAINING`) — 예외에 안 걸리는 아무 값 */
const RAIN = 2

beforeEach(() => { overworldWeather.value = OVERWORLD_WEATHER.clear })

describe('지금 걸린 날씨', () => {
  it('맵에 들어서면 헤더 값으로 덮는다', () => {
    overworldWeather.value = RAIN
    expect(enterMapWeather(OVERWORLD_WEATHER.clear, NONE)).toBe(OVERWORLD_WEATHER.clear)
    expect(overworldWeather.value).toBe(OVERWORLD_WEATHER.clear)
  })

  it('⚠️ 스크립트가 바꾼 날씨는 맵을 나가면 사라진다', () => {
    // 한동안 문서가 「맵을 나가도 남는다」고 적고 있었는데, 원작은 맵을 옮길
    // 때마다 헤더 값으로 덮어쓴다 (`field_map_change.c:280`)
    enterMapWeather(RAIN, NONE)
    clearOverworldWeather()
    expect(overworldWeather.value).toBe(OVERWORLD_WEATHER.clear)
    expect(enterMapWeather(RAIN, NONE)).toBe(RAIN)
  })

  it('안개제거를 쓴 상태의 안개는 맑음이 된다', () => {
    expect(weatherOnEnter(OVERWORLD_WEATHER.fog, NONE)).toBe(OVERWORLD_WEATHER.fog)
    expect(weatherOnEnter(OVERWORLD_WEATHER.fog, { flash: false, defog: true }))
      .toBe(OVERWORLD_WEATHER.clear)
  })

  it('플래시를 쓴 상태의 어둠은 맑음이 된다', () => {
    expect(weatherOnEnter(OVERWORLD_WEATHER.darkFlash, NONE)).toBe(OVERWORLD_WEATHER.darkFlash)
    expect(weatherOnEnter(OVERWORLD_WEATHER.darkFlash, { flash: true, defog: false }))
      .toBe(OVERWORLD_WEATHER.clear)
  })

  it('⚠️ 짝이 안 맞으면 안 걷힌다', () => {
    // 플래시로 안개를 걷거나 안개제거로 어둠을 걷지 못한다 — 원작이 값마다
    // 제 표식만 본다. 한 줄로 묶으면 두 기술이 서로의 일을 하게 된다
    expect(weatherOnEnter(OVERWORLD_WEATHER.fog, { flash: true, defog: false }))
      .toBe(OVERWORLD_WEATHER.fog)
    expect(weatherOnEnter(OVERWORLD_WEATHER.darkFlash, { flash: false, defog: true }))
      .toBe(OVERWORLD_WEATHER.darkFlash)
  })

  it('예외는 그 둘뿐이다', () => {
    // 비·눈·모래바람은 표식이 다 서 있어도 그대로다
    for (const w of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 15]) {
      expect(weatherOnEnter(w, BOTH), `날씨 ${String(w)}`).toBe(w)
    }
  })

  it('스크립트가 넣는 값은 맑음뿐이다', () => {
    // `ScrCmd_0C3`·`0C4`가 날씨를 건드리는 명령의 전부고 둘 다 CLEAR다
    overworldWeather.value = RAIN
    expect(clearOverworldWeather()).toBe(OVERWORLD_WEATHER.clear)
  })
})

describe('연간 날씨 표 (`FieldSystem_GetWeather`)', () => {
  const on = (header: number, year: number, month: number, day: number): number =>
    resolveHeaderWeather(header, { year, month, day })

  it('32 미만은 헤더 값 그대로다', () => {
    expect(on(0, 2026, 1, 1)).toBe(0)
    expect(on(14, 2026, 7, 7)).toBe(14)
  })

  it('1월 1일 — 212번도로 비 · 213번도로 맑음 · 216번도로 대설 · 아큐티·눈설 눈', () => {
    expect([32, 33, 34, 35, 36].map((h) => on(h, 2026, 1, 1))).toEqual([2, 0, 6, 5, 5])
  })

  it('1월 6일 212번도로 남쪽은 뇌우, 12월 31일 216번도로는 눈보라', () => {
    expect(on(32, 2026, 1, 6)).toBe(4)
    expect(on(34, 2026, 12, 31)).toBe(7)
  })

  it('평년의 3월 1일은 윤년의 3월 1일과 같은 행이다 (2월 29일을 건너뛴다)', () => {
    for (const h of [32, 33, 34, 35, 36]) {
      expect(on(h, 2026, 3, 1)).toBe(on(h, 2024, 3, 1))
      expect(on(h, 2026, 12, 31)).toBe(on(h, 2024, 12, 31))
      expect(on(h, 2026, 2, 28)).toBe(on(h, 2024, 2, 28))
    }
    // 윤년의 2월 29일은 그 행이 따로 있고, 3월 1일 행과 다른 칸을 읽는다
    expect([32, 33, 34, 35, 36].map((h) => on(h, 2024, 2, 29)))
      .toEqual([32, 33, 34, 35, 36].map((h) => YEARLY_WEATHER[59]![h - 32]))
  })

  it('시계를 돌린 표식이 서면 1월 2일 행이다', () => {
    expect(resolveHeaderWeather(35, { year: 2026, month: 8, day: 1 }, true)).toBe(6)
  })

  it('표는 366일이고 걸리는 값은 전부 날씨 번호다', () => {
    expect(YEARLY_WEATHER).toHaveLength(366)
    for (const row of YEARLY_WEATHER) for (const w of row) expect(w).toBeLessThan(32)
  })

  it('213번도로는 366일 중 맑음 344 · 흐림 12 · 비 10이다', () => {
    const count = new Map<number, number>()
    for (const row of YEARLY_WEATHER) count.set(row[1], (count.get(row[1]) ?? 0) + 1)
    expect(count.get(0)).toBe(344)
    expect(count.get(1)).toBe(12)
    expect(count.get(2)).toBe(10)
  })

  it('맵에 들어서면 풀린 값이 걸린다 — 눈숨기가 216번도로에서 먹는 값이다', () => {
    const w = enterMapWeather(34, { flash: false, defog: false }, { year: 2026, month: 1, day: 1 })
    expect(w).toBe(6)
    expect(overworldWeather.value).toBe(6)
  })
})
