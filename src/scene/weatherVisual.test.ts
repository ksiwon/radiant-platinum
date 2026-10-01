// 날씨 입자의 시점별 배치 (FieldWeather)
import { describe, expect, it } from 'vitest'
import {
  FIRST_LAYOUT, THIRD_LAYOUT, weatherCapacity, weatherCount, weatherDensity, weatherLayout,
  weatherProfile, wrapAround,
} from './weatherVisual'

const RAIN = weatherProfile('rain')!
const STORM = weatherProfile('storm')!

/**
 * 1인칭 85° 화각 앞 10칸 부채꼴에 드는 입자 수의 어림. 상자 높이를 통째로 본다.
 * 부채꼴이 상자 안에 다 드는지도 같이 따진다 — 삐져나가면 밀도로 셀 수 없다
 */
function inFrontSector(view: 'third' | 'first', profile = RAIN): number {
  const { range, height, ahead } = weatherLayout(view)
  const reach = 10, half = (85 / 2) * (Math.PI / 180)
  expect(reach * Math.sin(half)).toBeLessThan(range)
  expect(reach).toBeLessThan(range + ahead)
  const area = reach * reach * half
  return weatherDensity(profile, view) * area * height
}

describe('1인칭 날씨', () => {
  it('3인칭 배치는 예전 그대로다', () => {
    expect(weatherLayout('third')).toBe(THIRD_LAYOUT)
    expect(THIRD_LAYOUT).toMatchObject({ range: 22, height: 18, ahead: 0, dropWidth: 1, dropLength: 1 })
    expect(weatherCount(RAIN, 'third')).toBe(190)
    expect(weatherCount(STORM, 'third')).toBe(260)
  })

  it('3인칭 상자로는 앞에 빗줄기 일곱 가닥 남짓이다 — 그래서 1인칭이 따로 있다', () => {
    expect(inFrontSector('third')).toBeLessThan(8)
  })

  it('1인칭은 같은 부채꼴에 빗줄기가 예순 가닥을 넘는다', () => {
    expect(inFrontSector('first')).toBeGreaterThan(60)
    expect(inFrontSector('first', STORM)).toBeGreaterThan(inFrontSector('first'))
  })

  it('빗방울만 2~3배로 늘린다 — 나머지는 상자가 작아진 만큼으로 충분하다', () => {
    for (const profile of [RAIN, STORM]) {
      const k = weatherCount(profile, 'first') / weatherCount(profile, 'third')
      expect(k).toBeGreaterThanOrEqual(2)
      expect(k).toBeLessThanOrEqual(3)
    }
    for (const kind of ['snow', 'blizzard', 'ash', 'sand', 'hail', 'spirits'] as const) {
      const profile = weatherProfile(kind)!
      expect(profile.firstCount, kind).toBe(profile.count)
      expect(weatherDensity(profile, 'first'), kind).toBeGreaterThan(weatherDensity(profile, 'third'))
    }
  })

  it('1인칭 빗방울은 반지름 0.025 남짓으로 굵고 길다', () => {
    // 기하는 반지름 0.012~0.018(평균 0.015), 길이 0.82다 (`FieldWeather`)
    expect(0.015 * FIRST_LAYOUT.dropWidth).toBeCloseTo(0.025, 6)
    expect(0.82 * FIRST_LAYOUT.dropLength).toBeCloseTo(1.15, 6)
  })

  it('인스턴스는 두 시점 중 큰 쪽으로 잡는다', () => {
    expect(weatherCapacity(RAIN)).toBe(weatherCount(RAIN, 'first'))
    expect(weatherCapacity(STORM)).toBe(weatherCount(STORM, 'first'))
    const snow = weatherProfile('snow')!
    expect(weatherCapacity(snow)).toBe(snow.count)
  })

  it('상자 중심은 시선 앞에 있고 뒤도 조금 덮는다', () => {
    expect(FIRST_LAYOUT.ahead).toBeGreaterThan(0)
    expect(FIRST_LAYOUT.ahead).toBeLessThan(FIRST_LAYOUT.range)
  })
})

describe('월드 격자에 접기', () => {
  it('상자 반폭 안으로 접는다', () => {
    for (const w of [-37.2, -12, 0, 5.5, 11.99, 12, 40]) {
      const local = wrapAround(w, 3, 12)
      expect(local).toBeGreaterThanOrEqual(-12)
      expect(local).toBeLessThan(12)
    }
  })

  it('중심이 움직여도 상자 안에 남은 입자는 월드 자리가 그대로다 — 고개를 돌려도 빗발이 안 미끄러진다', () => {
    const world = 7.25
    for (const center of [0, 2, 4.5, 6, 9]) {
      expect(center + wrapAround(world, center, 12)).toBeCloseTo(world, 10)
    }
  })

  it('넘어간 입자는 상자 한 칸 너머의 같은 격자 자리로 다시 나온다', () => {
    const world = 7.25
    const center = -10
    expect(center + wrapAround(world, center, 12)).toBeCloseTo(world - 24, 10)
  })
})
