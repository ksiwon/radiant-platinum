// 시간대 (DATA.md §2.19)
//
// **경계를 지어내지 않는다.** 원작 `src/rtc.c`의 `TimeOfDayForHour`가 24칸 표로
// 박아 두고 있고, 값 다섯의 순서는 `generated/time_of_day.txt`가 준다.
// 그대로 옮긴다 — 인카운터 표가 이 구분을 쓰므로 한 시간만 밀려도 잡히는
// 포켓몬이 달라진다.

/** `enum TimeOfDay`. 순서가 곧 값이다 (`generated/time_of_day.txt`) */
export const TimeOfDay = {
  MORNING: 0,
  DAY: 1,
  TWILIGHT: 2,
  NIGHT: 3,
  LATE_NIGHT: 4,
} as const
export type TimeOfDayId = (typeof TimeOfDay)[keyof typeof TimeOfDay]

/**
 * `src/rtc.c`의 `lookup[24]` 그대로.
 *
 * 0~3시 심야 · 4~9시 아침 · 10~16시 낮 · 17~19시 해질녘 · 20~23시 밤이다.
 * 밤이 둘로 갈리는 것(밤·심야)이 4세대의 특징이고, 인카운터는 그 둘을 묶어
 * 쓰지만 화면은 갈라야 한다 — 심야가 제일 어둡다
 */
const BY_HOUR: readonly TimeOfDayId[] = [
  4, 4, 4, 4,
  0, 0, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1,
  2, 2, 2,
  3, 3, 3, 3,
]

export function timeOfDayForHour(hour: number): TimeOfDayId {
  const h = Math.floor(hour) % 24
  return BY_HOUR[h < 0 ? h + 24 : h] ?? TimeOfDay.DAY
}

/**
 * `rtc.c`의 `IsNight` — **밤과 심야를 묶은** 하나의 참/거짓.
 *
 * 진화가 이 값을 본다(에브이/블래키·글라이온·독개굴 …). 해질녘은 밤이 아니다 —
 * 17~19시에 블래키를 만들려고 하면 안 된다
 */
export function isNight(hour: number): boolean {
  const t = timeOfDayForHour(hour)
  return t === TimeOfDay.NIGHT || t === TimeOfDay.LATE_NIGHT
}

/**
 * 시간대가 바뀌는 경계에서 0→1로 넘어가는 값.
 *
 * 표는 시간 단위라 20시 정각에 하늘이 툭 바뀐다. 원작은 화면 전환이 있어서
 * 티가 안 났지만 여기는 걸어 다니는 중에 바뀌므로 **경계 앞뒤 30분에 걸쳐**
 * 섞는다. 인카운터는 이 값을 안 본다 — 그쪽은 원작 표 그대로여야 한다
 */
export const BLEND_HOURS = 0.5

export function timeBlend(hour: number): {
  from: TimeOfDayId; to: TimeOfDayId; k: number
} {
  const h = ((hour % 24) + 24) % 24
  const now = timeOfDayForHour(h)
  const next = timeOfDayForHour(h + 1)
  const toBoundary = Math.ceil(h) - h
  if (next === now || toBoundary > BLEND_HOURS) return { from: now, to: now, k: 0 }
  return { from: now, to: next, k: 1 - toBoundary / BLEND_HOURS }
}
