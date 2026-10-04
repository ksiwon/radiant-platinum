// 헤더 날씨 32~36(날짜 표의 열)이 풀려서 조우율에 닿는가 (`stepSystem`의 `publishMods` → `encounters.mods.weather`)
//
// `publishMods`는 `overworldWeather.value`를 그대로 `mods.weather`에 싣는다. 그 값이 **풀린 날씨**여야 눈숨기가 216번도로에서 먹는다 —
// 헤더 번호(34)를 그대로 넘기면 5·6·7이 아니라서 영영 안 먹는다
import { beforeEach, describe, expect, it } from 'vitest'
import { Flute, LeadAbility, NO_LEAD, OverworldWeather, walkRate, type FieldMods } from '../battle/encounterLead'
import { enterMapWeather, overworldWeather, resolveHeaderWeather } from './overworldWeather'
import { YEARLY_WEATHER } from './yearlyWeather'

const NONE = { flash: false, defog: false }
const mods = (ability: number, weather: number): FieldMods => ({
  lead: { ...NO_LEAD, isEgg: false, ability, level: 20 }, weather, flute: Flute.NONE, repelLevel: 0, month: 6, day: 1,
})
const RATE = 20
const SNOWY = new Set<number>([OverworldWeather.SNOWING, OverworldWeather.HEAVY_SNOW, OverworldWeather.BLIZZARD])

beforeEach(() => { overworldWeather.value = 0 })

describe('눈숨기 × 날짜 표 날씨', () => {
  it('216번도로(34) 1월 1일 — 대설(6)로 풀려 출현률이 반이다', () => {
    const w = enterMapWeather(34, NONE, { year: 2026, month: 1, day: 1 })
    expect(w).toBe(OverworldWeather.HEAVY_SNOW)
    expect(walkRate(RATE, mods(LeadAbility.SNOW_CLOAK, overworldWeather.value))).toBe(RATE / 2)
  })

  it('⚠️ 풀기 전의 헤더 번호를 넘기면 눈숨기가 안 먹는다 — 그래서 풀린 값을 싣는다', () => {
    expect(walkRate(RATE, mods(LeadAbility.SNOW_CLOAK, 34))).toBe(RATE)
  })

  it('비 오는 날(212번도로 남쪽 · 1월 1일 = 비)이나 맑은 날(213번도로)에는 안 먹는다', () => {
    for (const header of [32, 33]) {
      const w = enterMapWeather(header, NONE, { year: 2026, month: 1, day: 1 })
      expect(SNOWY.has(w)).toBe(false)
      expect(walkRate(RATE, mods(LeadAbility.SNOW_CLOAK, w))).toBe(RATE)
    }
  })

  it('눈이 오는 곳의 모래숨기는 안 먹는다 · 모래숨기는 모래바람에서만이다', () => {
    const snow = enterMapWeather(36, NONE, { year: 2026, month: 1, day: 1 })
    expect(walkRate(RATE, mods(LeadAbility.SAND_VEIL, snow))).toBe(RATE)
    expect(walkRate(RATE, mods(LeadAbility.SAND_VEIL, OverworldWeather.SANDSTORM))).toBe(RATE / 2)
  })

  it('212번도로 남쪽 · 213번도로 열에는 눈이 없다', () => {
    for (const col of [0, 1]) expect(YEARLY_WEATHER.some((row) => SNOWY.has(row[col]!)), `열 ${String(col)}`).toBe(false)
  })

  it('다섯 열 모두 — 풀린 날씨가 눈 · 눈보라일 때만, 그리고 그때 늘 반이다 (평년 · 윤년 전 날)', () => {
    const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    for (const year of [2026, 2028]) {
      const leap = year % 4 === 0
      for (let header = 32; header <= 36; header++) {
        for (let month = 1; month <= 12; month++) {
          const days = month === 2 && leap ? 29 : MONTH_DAYS[month - 1]!
          for (let day = 1; day <= days; day++) {
            const w = resolveHeaderWeather(header, { year, month, day })
            expect(w, `${String(year)}-${String(month)}-${String(day)} 헤더 ${String(header)}`).toBeLessThan(32)
            const got = walkRate(RATE, mods(LeadAbility.SNOW_CLOAK, w))
            expect(got).toBe(SNOWY.has(w) ? RATE / 2 : RATE)
          }
        }
      }
    }
  })

  it('표가 눈을 내리는 날이 실제로 있다 — 216번도로 · 아큐티 호반 · 눈설시티 (212번도로 남쪽 · 213번도로는 눈이 안 온다)', () => {
    for (const col of [2, 3, 4]) {
      expect(YEARLY_WEATHER.some((row) => SNOWY.has(row[col]!)), `열 ${String(col)}`).toBe(true)
    }
  })
})
