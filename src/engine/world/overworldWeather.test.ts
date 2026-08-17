// 지금 걸린 날씨 (PARITY §8.3)
//
// 여기서 못 박는 것이 셋이다 — **덮어쓰는 규칙** · **예외 둘** · **스크립트가
// 넣을 수 있는 값이 맑음뿐이라는 것**.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearOverworldWeather, enterMapWeather, OVERWORLD_WEATHER, overworldWeather, weatherOnEnter,
} from './overworldWeather'

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
