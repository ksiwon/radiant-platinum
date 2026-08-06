// 시간대 검증 (DATA.md §2.19)
//
// 경계를 지어내면 안 된다. 원작 `src/rtc.c`의 `TimeOfDayForHour`가 24칸 표로
// 박아 두고 있고, 인카운터 표가 이 구분을 쓰므로 한 시간만 밀려도 잡히는
// 포켓몬이 달라진다.
import { describe, it, expect } from 'vitest'
import { BLEND_HOURS, TimeOfDay, timeBlend, timeOfDayForHour } from './timeOfDay'

describe('시간대', () => {
  it('원작 rtc.c의 24칸 표 그대로다', () => {
    // 0~3 심야 · 4~9 아침 · 10~16 낮 · 17~19 해질녘 · 20~23 밤
    const want = [
      ...Array<number>(4).fill(TimeOfDay.LATE_NIGHT),
      ...Array<number>(6).fill(TimeOfDay.MORNING),
      ...Array<number>(7).fill(TimeOfDay.DAY),
      ...Array<number>(3).fill(TimeOfDay.TWILIGHT),
      ...Array<number>(4).fill(TimeOfDay.NIGHT),
    ]
    expect(want).toHaveLength(24)
    for (let h = 0; h < 24; h++) {
      expect(timeOfDayForHour(h), `${String(h)}시`).toBe(want[h])
    }
  })

  it('값 다섯의 순서가 원작 열거형과 같다', () => {
    // `generated/time_of_day.txt` — 아침 0 · 낮 1 · 해질녘 2 · 밤 3 · 심야 4.
    // 순서가 어긋나면 스크립트의 `GoToIfEq VAR_RESULT, TIMEOFDAY_MORNING`이
    // 엉뚱한 가지로 간다
    expect([
      TimeOfDay.MORNING, TimeOfDay.DAY, TimeOfDay.TWILIGHT,
      TimeOfDay.NIGHT, TimeOfDay.LATE_NIGHT,
    ]).toEqual([0, 1, 2, 3, 4])
  })

  it('하루를 넘어가도 돈다', () => {
    expect(timeOfDayForHour(24)).toBe(timeOfDayForHour(0))
    expect(timeOfDayForHour(-1)).toBe(timeOfDayForHour(23))
    expect(timeOfDayForHour(13.9)).toBe(TimeOfDay.DAY)
  })

  it('경계 앞 30분에서만 섞인다', () => {
    // 한낮에는 안 섞인다
    expect(timeBlend(12).k).toBe(0)
    expect(timeBlend(12).from).toBe(timeBlend(12).to)
    // 17시가 해질녘 시작이므로 16시 30분부터 섞인다
    expect(timeBlend(16.4).k).toBe(0)
    expect(timeBlend(16.5).k).toBeCloseTo(0, 5)
    expect(timeBlend(16.75).k).toBeCloseTo(0.5, 5)
    expect(timeBlend(16.99).k).toBeGreaterThan(0.9)
    expect(timeBlend(16.75).from).toBe(TimeOfDay.DAY)
    expect(timeBlend(16.75).to).toBe(TimeOfDay.TWILIGHT)
  })

  it('같은 시간대가 이어지는 경계에서는 안 섞는다', () => {
    // 11시→12시는 둘 다 낮이라 섞을 것이 없다
    expect(timeBlend(11.9).k).toBe(0)
    expect(BLEND_HOURS).toBeLessThan(1)
  })
})
