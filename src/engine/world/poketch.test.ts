import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKERS, DOTART_HEIGHT, DOTART_WIDTH, FRIENDSHIP_TIERS, MOVE_TESTER_TYPE_ORDER,
  POKETCH_APP_COUNT, POKETCH_COLOR_COUNT, POKETCH_DOTART_BYTES, POKETCH_HISTORY_MAX,
  POKETCH_MARKER_COUNT, POKETCH_REGISTRY_SIZE, PoketchApp, fallbackShades, poketchShades,
  appCount, calendarMarked, clearCalendarMark, dotArtGet, dotArtSet, dowsingInRange,
  friendshipTier, historyEnqueue, isAppRegistered, modifyDotArt, moveTesterExclamations,
  newPoketch, registerApp, setAlarm, setCalendarMark, setMarker, setScreenColor,
  setStepCount, stepApp, CALC_KEYS, applyCalcKey, newCalc,
} from './poketch'

describe('앱 등록', () => {
  it('새 포켓치에는 디지털시계 하나가 들어 있다', () => {
    const p = newPoketch()
    expect(appCount(p)).toBe(1)
    expect(isAppRegistered(p, PoketchApp.DIGITAL_WATCH)).toBe(true)
    expect(p.appIndex).toBe(PoketchApp.DIGITAL_WATCH)
  })

  it('같은 앱을 두 번 등록해도 수가 안 는다', () => {
    let p = newPoketch()
    p = registerApp(p, PoketchApp.CALCULATOR)
    const once = appCount(p)
    p = registerApp(p, PoketchApp.CALCULATOR)
    expect(appCount(p)).toBe(once)
  })

  it('만보기를 받아야 걸음이 쌓인다', () => {
    let p = newPoketch()
    expect(setStepCount(p, 500).stepCount).toBe(0)
    p = registerApp(p, PoketchApp.PEDOMETER)
    expect(setStepCount(p, 500).stepCount).toBe(500)
  })

  it('없는 번호는 안 받는다', () => {
    const p = newPoketch()
    expect(registerApp(p, POKETCH_APP_COUNT)).toBe(p)
    expect(registerApp(p, -1)).toBe(p)
  })

  it('표가 서른두 칸이다 — 원작 배열 크기 그대로다', () => {
    expect(newPoketch().registry).toHaveLength(POKETCH_REGISTRY_SIZE)
  })
})

describe('앱 넘기기', () => {
  it('등록 안 된 앱은 건너뛴다', () => {
    let p = newPoketch()
    p = registerApp(p, PoketchApp.CALENDAR)
    expect(stepApp(p, 1).appIndex).toBe(PoketchApp.CALENDAR)
    expect(stepApp(stepApp(p, 1), 1).appIndex).toBe(PoketchApp.DIGITAL_WATCH)
  })

  it('한 바퀴를 돌아 끝에서 처음으로 넘어간다', () => {
    let p = newPoketch()
    p = registerApp(p, PoketchApp.ALARM_CLOCK)
    // 뒤로 한 번이면 마지막 앱이다
    expect(stepApp(p, -1).appIndex).toBe(PoketchApp.ALARM_CLOCK)
  })

  it('등록된 앱이 하나뿐이면 제자리에 선다 — 무한 고리가 안 된다', () => {
    const p = newPoketch()
    expect(stepApp(p, 1)).toBe(p)
    expect(stepApp(p, -1)).toBe(p)
  })
})

describe('화면 색', () => {
  it('여덟 가지고 그 밖은 안 받는다', () => {
    const p = newPoketch()
    expect(setScreenColor(p, 7).screenColor).toBe(7)
    expect(setScreenColor(p, POKETCH_COLOR_COUNT)).toBe(p)
    expect(setScreenColor(p, -1)).toBe(p)
  })

  it('색마다 명암 넷이 있고 바탕이 제일 밝다', () => {
    for (let i = 0; i < POKETCH_COLOR_COUNT; i++) {
      const s = fallbackShades(i)
      for (const c of [s.ground, s.mid, s.dark, s.ink]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
      // 밝기가 단조로 떨어져야 한다 — 안 그러면 글씨가 바탕보다 밝아진다
      const lum = (hex: string): number =>
        Number.parseInt(hex.slice(1, 3), 16) + Number.parseInt(hex.slice(3, 5), 16)
        + Number.parseInt(hex.slice(5, 7), 16)
      expect(lum(s.ground)).toBeGreaterThan(lum(s.mid))
      expect(lum(s.mid)).toBeGreaterThan(lum(s.dark))
      expect(lum(s.dark)).toBeGreaterThan(lum(s.ink))
    }
  })

  it('⚠️ 설치본의 팔레트가 우리 색을 이긴다 — 원작 값이 있으면 그쪽이다', () => {
    const rom = Array.from({ length: POKETCH_COLOR_COUNT }, () =>
      ['#73b573', '#528452', '#395231', '#102918'])
    expect(poketchShades(0, rom).ground).toBe('#73b573')
    expect(poketchShades(0, null)).toEqual(fallbackShades(0))
    // 넷이 아니면 안 믿는다 — 잘린 자료로 화면을 칠하지 않는다
    expect(poketchShades(0, [['#fff']])).toEqual(fallbackShades(0))
  })
})

describe('캘린더', () => {
  it('같은 달이면 표시가 쌓인다', () => {
    let p = newPoketch()
    p = setCalendarMark(p, 8, 13)
    p = setCalendarMark(p, 8, 20)
    expect(calendarMarked(p, 8, 13)).toBe(true)
    expect(calendarMarked(p, 8, 20)).toBe(true)
  })

  it('⚠️ 달이 바뀌면 앞의 표시가 통째로 사라진다 — 달 하나만 든다', () => {
    let p = setCalendarMark(newPoketch(), 8, 13)
    p = setCalendarMark(p, 9, 1)
    expect(calendarMarked(p, 8, 13)).toBe(false)
    expect(calendarMarked(p, 9, 1)).toBe(true)
  })

  it('지우는 쪽도 달이 다르면 통째로 비운다', () => {
    let p = setCalendarMark(newPoketch(), 8, 13)
    p = clearCalendarMark(p, 9, 5)
    expect(p.calendar.marks).toBe(0)
    expect(p.calendar.month).toBe(9)
  })

  it('31일까지 든다 — 32비트라 자리가 남는다', () => {
    let p = newPoketch()
    for (let d = 1; d <= 31; d++) p = setCalendarMark(p, 3, d)
    for (let d = 1; d <= 31; d++) expect(calendarMarked(p, 3, d)).toBe(true)
    expect(p.calendar.marks >>> 0).toBe(0x7fffffff)
  })
})

describe('알람', () => {
  it('시와 분을 24·60으로 돌린다', () => {
    const p = setAlarm(newPoketch(), true, 25, 61)
    expect(p.alarm).toEqual({ set: true, hour: 1, minute: 1 })
  })
})

describe('마킹맵', () => {
  it('여섯 개가 기본 자리에 놓여 있다', () => {
    expect(newPoketch().markers).toEqual(DEFAULT_MARKERS)
    expect(DEFAULT_MARKERS).toHaveLength(POKETCH_MARKER_COUNT)
  })

  it('자리를 옮긴다. 범위 밖은 안 받는다', () => {
    const p = newPoketch()
    expect(setMarker(p, 2, 10, 20).markers[2]).toEqual({ x: 10, y: 20 })
    expect(setMarker(p, POKETCH_MARKER_COUNT, 1, 1)).toBe(p)
  })
})

describe('도트아트', () => {
  it('한 바이트에 넉 점이 들어간다', () => {
    expect(POKETCH_DOTART_BYTES).toBe((DOTART_WIDTH * DOTART_HEIGHT) / 4)
  })

  it('찍고 읽는다 — 옆 점을 안 건드린다', () => {
    let data: Uint8Array = new Uint8Array(POKETCH_DOTART_BYTES)
    data = dotArtSet(data, 0, 0, 3)
    data = dotArtSet(data, 1, 0, 1)
    expect(dotArtGet(data, 0, 0)).toBe(3)
    expect(dotArtGet(data, 1, 0)).toBe(1)
    expect(dotArtGet(data, 2, 0)).toBe(0)
    // 덮어쓰면 앞 값이 남지 않는다
    data = dotArtSet(data, 0, 0, 1)
    expect(dotArtGet(data, 0, 0)).toBe(1)
  })

  it('네 귀퉁이가 다 잡힌다', () => {
    let data: Uint8Array = new Uint8Array(POKETCH_DOTART_BYTES)
    for (const [x, y] of [[0, 0], [DOTART_WIDTH - 1, 0], [0, DOTART_HEIGHT - 1],
      [DOTART_WIDTH - 1, DOTART_HEIGHT - 1]] as const) {
      data = dotArtSet(data, x, y, 2)
      expect(dotArtGet(data, x, y)).toBe(2)
    }
  })

  it('범위 밖은 안 찍고 안 읽는다', () => {
    const data = new Uint8Array(POKETCH_DOTART_BYTES)
    expect(dotArtSet(data, DOTART_WIDTH, 0, 3)).toBe(data)
    expect(dotArtGet(data, -1, 0)).toBe(0)
  })

  it('⚠️ 한 번 고치면 「고친 적 있다」가 영영 참이다', () => {
    const p = modifyDotArt(newPoketch(), new Uint8Array(POKETCH_DOTART_BYTES))
    expect(p.dotArtModified).toBe(true)
    expect(modifyDotArt(p, new Uint8Array(POKETCH_DOTART_BYTES)).dotArtModified).toBe(true)
  })
})

describe('포켓몬 이력', () => {
  it('열둘이 차면 앞이 밀려 나간다', () => {
    let p = newPoketch()
    for (let i = 1; i <= POKETCH_HISTORY_MAX + 2; i++) {
      p = historyEnqueue(p, { species: i, form: 0 })
    }
    expect(p.history).toHaveLength(POKETCH_HISTORY_MAX)
    expect(p.history[0]?.species).toBe(3)
    expect(p.history[POKETCH_HISTORY_MAX - 1]?.species).toBe(POKETCH_HISTORY_MAX + 2)
  })
})

describe('친밀도 체커', () => {
  it('하트가 일곱 갈래다 — 0부터 6까지', () => {
    expect(friendshipTier(0)).toBe(0)
    expect(friendshipTier(1)).toBe(1)
    expect(friendshipTier(34)).toBe(1)
    expect(friendshipTier(35)).toBe(2)
    expect(friendshipTier(69)).toBe(2)
    expect(friendshipTier(70)).toBe(3)
    expect(friendshipTier(149)).toBe(3)
    expect(friendshipTier(150)).toBe(4)
    expect(friendshipTier(199)).toBe(4)
    expect(friendshipTier(200)).toBe(5)
    expect(friendshipTier(254)).toBe(5)
    expect(friendshipTier(255)).toBe(6)
  })

  it('칸이 여섯이라 갈래가 일곱이다', () => {
    expect(FRIENDSHIP_TIERS).toHaveLength(6)
  })
})

describe('기술효과체커', () => {
  /** 배수 표를 흉내 낸다 — 실제 표는 `engine/battle`이 든다 */
  const chart = (a: number, d: number): number => {
    if (a === 0 && d === 0) return 1        // 노말 → 노말 1배
    if (a === 1 && d === 0) return 2        // 격투 → 노말 2배
    if (a === 0 && d === 5) return 0.5      // 노말 → 바위 0.5배
    if (a === 0 && d === 7) return 0        // 노말 → 고스트 0배
    if (a === 4 && d === 5) return 2        // 땅 → 바위 2배
    if (a === 4 && d === 10) return 2       // 땅 → 불꽃 2배
    return 1
  }

  it('보통은 3이다', () => {
    expect(moveTesterExclamations(chart, 0, 0, null)).toBe(3)
  })

  it('2배면 4, 0.5배면 2다', () => {
    expect(moveTesterExclamations(chart, 1, 0, null)).toBe(4)
    expect(moveTesterExclamations(chart, 0, 5, null)).toBe(2)
  })

  it('⚠️ 4배는 5다 — 곱셈이 아니라 덧셈이라 2배와 갈린다', () => {
    // 땅 → 바위/불꽃 둘 다 2배
    expect(moveTesterExclamations(chart, 4, 5, 10)).toBe(5)
    expect(moveTesterExclamations(chart, 4, 5, null)).toBe(4)
  })

  it('0배가 하나라도 있으면 0이다', () => {
    expect(moveTesterExclamations(chart, 0, 7, null)).toBe(0)
    expect(moveTesterExclamations(chart, 0, 0, 7)).toBe(0)
  })

  it('두 타입이 같으면 한 번만 센다', () => {
    expect(moveTesterExclamations(chart, 1, 0, 0)).toBe(4)
  })

  it('늘어놓는 차례가 열일곱이고 ???(9번)이 빠져 있다', () => {
    expect(MOVE_TESTER_TYPE_ORDER).toHaveLength(17)
    expect(MOVE_TESTER_TYPE_ORDER).not.toContain(9)
    expect(new Set(MOVE_TESTER_TYPE_ORDER).size).toBe(17)
  })
})

describe('다우징머신', () => {
  it('⚠️ 앞뒤가 안 맞는다 — 뒤쪽만 6칸이다', () => {
    expect(dowsingInRange(0, -7)).toBe(true)
    expect(dowsingInRange(0, 6)).toBe(true)
    expect(dowsingInRange(0, 7)).toBe(false)
    expect(dowsingInRange(-7, 0)).toBe(true)
    expect(dowsingInRange(7, 0)).toBe(true)
    expect(dowsingInRange(8, 0)).toBe(false)
  })
})

describe('계산기', () => {
  /** 자판을 차례로 누른다 */
  const type = (...keys: string[]) => keys.reduce(applyCalcKey, newCalc()).shown

  it('자판이 열여섯 칸이다', () => { expect(CALC_KEYS).toHaveLength(16) })

  it('숫자를 이어 찍는다 — 앞의 0은 안 남는다', () => {
    expect(type('1', '2', '3')).toBe('123')
    expect(type('0', '5')).toBe('5')
  })

  it('넷 다 센다', () => {
    expect(type('2', '+', '3', '=')).toBe('5')
    expect(type('9', '−', '4', '=')).toBe('5')
    expect(type('6', '×', '7', '=')).toBe('42')
    expect(type('8', '÷', '2', '=')).toBe('4')
  })

  it('연산자를 이어 누르면 앞의 것부터 접는다', () => {
    expect(type('2', '+', '3', '+')).toBe('5')
    expect(type('2', '+', '3', '+', '4', '=')).toBe('9')
  })

  it('⚠️ 0으로 나누면 0이다 — 액정이 Infinity로 넘치지 않는다', () => {
    expect(type('5', '÷', '0', '=')).toBe('0')
  })

  it('C가 통째로 지운다', () => {
    expect(type('1', '2', '+', '3', 'C')).toBe('0')
  })

  it('=만 누르면 지금 값 그대로다', () => {
    expect(type('7', '=')).toBe('7')
  })

  it('자릿수가 열둘을 안 넘는다', () => {
    expect(type(...'1234567890123456'.split('')).length).toBeLessThanOrEqual(12)
  })
})
