// 무대의 몸도 **공통 연출 시계** 위에 선다 (지시서 2026-09-20 §3 / R1).
//
// 결함은 이랬다. `BattleStage`의 Slot이 `useFrame((_, delta) => …)`의 **원시
// delta**를 등장/퇴장(FADE 0.35초)·전진·피격·`mixer.update`에 그대로 썼다.
// 그 값은 벽시계라 `MAX_STEP_MS`도 탭 숨김도 모른다 — 프레임 하나가 1초가 되면
// 시계는 0.1초(28.6%)만 가는데 몸은 1초를 소비해 퇴장이 이미 100% 끝나 있었다.
//
// 여기서는 셋을 잰다: ① `ClockReader`의 계약, ② 같은 지연에서 시계 쪽과
// 원시 delta 쪽이 실제로 갈린다는 것, ③ 제품이 정말 시계를 읽는다는 것.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ClockReader, MAX_STEP_MS } from '../../engine/battle/presentationClock'

const SLOT_SOURCE = new URL('./BattleStage.tsx', import.meta.url)

describe('ClockReader — 읽는 쪽이 제 몫만 떼어 간다', () => {
  it('첫 읽기는 0이다 — 마운트 순간의 시계 값을 통째로 안 삼킨다', () => {
    const r = new ClockReader()
    expect(r.read(12.5)).toBe(0)
    expect(r.read(12.75)).toBeCloseTo(0.25, 10)
  })

  it('같은 프레임에 두 번 읽어도 두 번 안 나아간다', () => {
    const r = new ClockReader()
    r.read(1)
    expect(r.read(2)).toBe(1)
    expect(r.read(2)).toBe(0)
  })

  it('시계가 되돌아가면(다음 배틀 reset) 음수 대신 0을 주고 거기서 다시 센다', () => {
    const r = new ClockReader()
    r.read(9)
    expect(r.read(0)).toBe(0)
    expect(r.read(0.5)).toBeCloseTo(0.5, 10)
  })

  it('reset 뒤 첫 읽기는 다시 0이다 — 모델이 바뀌면 기다린 시간을 안 소비한다', () => {
    const r = new ClockReader()
    r.read(1)
    r.reset()
    expect(r.read(5)).toBe(0)
    expect(r.read(5.1)).toBeCloseTo(0.1, 10)
  })
})

/** 몸이 서고 지는 적분 — `BattleStage`의 그 줄 그대로다 */
const FADE = 0.35
function approach(shown: number, want: number, delta: number): number {
  return shown + Math.sign(want - shown) * Math.min(delta / FADE, Math.abs(want - shown))
}

describe('긴 프레임 하나가 퇴장을 통째로 끝내지 않는다', () => {
  it('1초 멈춤에서 시계는 0.1초만 준다 — 원시 delta는 1초를 준다', () => {
    // 시계가 한 걸음을 자른 만큼(`MAX_STEP_MS`)만 흐른다
    const capped = MAX_STEP_MS / 1000
    expect(approach(1, 0, capped)).toBeCloseTo(1 - capped / FADE, 10)
    // 원시 delta였을 때. 0.35초짜리 퇴장이 한 프레임에 끝난다
    expect(approach(1, 0, 1)).toBe(0)
  })

  it('시계가 멈춰 있으면(탭 숨김) 몸도 선다', () => {
    const r = new ClockReader()
    let now = 2
    let shown = 1
    r.read(now)
    // 숨어 있는 동안 `tick`이 0을 돌려주므로 `now`가 안 는다
    for (let i = 0; i < 300; i++) shown = approach(shown, 0, r.read(now))
    expect(shown).toBe(1)
    // 돌아오면 한 걸음씩 흐른다 — 밀린 시간을 한꺼번에 소비하지 않는다
    now += MAX_STEP_MS / 1000
    shown = approach(shown, 0, r.read(now))
    expect(shown).toBeCloseTo(1 - (MAX_STEP_MS / 1000) / FADE, 10)
  })

  it('주사율이 달라도 같은 시계 시간에 같은 만큼 진다', () => {
    const at = (hz: number): number => {
      const r = new ClockReader()
      let shown = 1
      let now = 0
      r.read(now)
      for (let i = 0; i < hz; i++) { now += 1 / hz; shown = approach(shown, 0, r.read(now)) }
      return shown
    }
    // 1초면 FADE 0.35초를 넘기므로 어디서나 다 졌다
    for (const hz of [30, 60, 120, 144]) expect(at(hz)).toBe(0)
    const half = (hz: number): number => {
      const r = new ClockReader()
      let shown = 1
      let now = 0
      r.read(now)
      const steps = Math.round(hz * 0.175)
      for (let i = 0; i < steps; i++) { now += 1 / hz; shown = approach(shown, 0, r.read(now)) }
      return shown
    }
    for (const hz of [30, 60, 120, 144]) expect(half(hz)).toBeCloseTo(0.5, 1)
  })
})

describe('제품이 정말 시계를 읽는다', () => {
  const source = readFileSync(SLOT_SOURCE, 'utf8')

  it('Slot의 useFrame이 원시 delta를 안 받는다', () => {
    // ⚠️ 이 한 줄이 결함의 전부였다. 다시 들어오면 여기서 막힌다
    expect(source).not.toMatch(/useFrame\(\([^)]*delta[^)]*\)/)
  })

  it('몸이 쓰는 delta가 ClockReader에서 온다', () => {
    expect(source).toContain('new ClockReader()')
    expect(source).toMatch(/const delta = \w+\.current\.read\(battleClock\.now\(\)\)/)
  })

  it('모델이 바뀌면 읽는 시간을 되돌린다', () => {
    expect(source).toMatch(/\w+\.current\.reset\(\)/)
  })
})
