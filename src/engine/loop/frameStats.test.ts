// 프레임 분포를 재는 자 (PLAN §10.5)
//
// ⚠️ **여기가 「부드러운가」의 정의다.** 평균 FPS로는 300ms짜리 걸림이 안 보이고,
// 그 하나가 사용자가 느끼는 전부다. 백분위와 구간 최장값이 그것을 잡는지 잰다.
import { describe, expect, it } from 'vitest'
import { FrameStats } from './frameStats'

/** 60Hz 한 프레임 */
const F = 1000 / 60

describe('백분위', () => {
  it('아무것도 안 밀었으면 0이다', () => {
    expect(new FrameStats().percentile(0.99)).toBe(0)
    expect(new FrameStats().count).toBe(0)
  })

  it('한 프레임이 걸리면 평균은 멀쩡한데 p99가 잡는다', () => {
    // 예순 프레임 중 쉰아홉이 16.7ms고 하나가 300ms다
    const s = new FrameStats()
    for (let i = 0; i < 59; i += 1) s.push(F)
    s.push(300)
    // 평균은 21.4ms — 「FPS 47」로 읽혀 별일 아닌 것처럼 보인다
    expect((59 * F + 300) / 60).toBeCloseTo(21.4, 1)
    // 중간값은 그 하나를 아예 못 본다
    expect(s.percentile(0.5)).toBeCloseTo(F, 6)
    // p99가 잡는다
    expect(s.percentile(0.99)).toBe(300)
  })

  it('백분위가 커질수록 값도 커진다', () => {
    const s = new FrameStats()
    for (let i = 1; i <= 100; i += 1) s.push(i)
    expect(s.percentile(0)).toBe(1)
    expect(s.percentile(0.5)).toBe(51)
    expect(s.percentile(0.99)).toBe(100)
    // 1을 넘겨도 자리가 안 넘친다
    expect(s.percentile(1)).toBe(100)
  })

  it('1024장까지만 들고 그 뒤로는 오래된 것을 버린다', () => {
    const s = new FrameStats()
    for (let i = 0; i < 1024; i += 1) s.push(999)
    expect(s.count).toBe(1024)
    // 한 바퀴를 더 채우면 옛 값이 다 밀려난다
    for (let i = 0; i < 1024; i += 1) s.push(F)
    expect(s.count).toBe(1024)
    expect(s.percentile(1)).toBeCloseTo(F, 6)
  })
})

describe('구간마다의 최장 프레임', () => {
  it('구간을 안 열었으면 아무것도 안 남는다', () => {
    const s = new FrameStats()
    s.push(500)
    expect(s.spans.size).toBe(0)
  })

  it('구간 안의 제일 긴 프레임을 남긴다', () => {
    const s = new FrameStats()
    s.push(F) // 구간 밖 — 안 세어야 한다
    s.openSpan('맵 전환')
    s.push(F); s.push(3300); s.push(F)
    s.closeSpan()
    s.push(9999) // 닫힌 뒤 — 안 세어야 한다
    expect(s.spans.get('맵 전환')).toEqual({ first: 3300, worst: 3300, last: 3300, count: 1 })
  })

  it('처음 한 번과 제일 나쁜 번을 따로 든다', () => {
    // 첫 배틀은 `@pkmn/sim`이 그때 오므로 **처음**이 임자고,
    // 맵 전환은 어느 맵이 아픈가라 **제일 나쁜 번**이 임자다
    const s = new FrameStats()
    for (const worst of [800, 120, 2400, 90]) {
      s.openSpan('첫 배틀')
      s.push(worst)
      s.closeSpan()
    }
    expect(s.spans.get('첫 배틀')).toEqual({ first: 800, worst: 2400, last: 90, count: 4 })
  })

  it('안 닫아도 다음 구간이 열리면 닫힌다', () => {
    // 닫는 것을 잊어서 값이 영영 안 남는 일이 없어야 한다
    const s = new FrameStats()
    s.openSpan('맵 전환')
    s.push(700)
    s.openSpan('맵 전환')
    s.push(200)
    s.closeSpan()
    expect(s.spans.get('맵 전환')).toEqual({ first: 700, worst: 700, last: 200, count: 2 })
  })

  it('한 프레임도 안 지난 구간은 안 남긴다', () => {
    const s = new FrameStats()
    s.openSpan('맵 전환')
    s.closeSpan()
    expect(s.spans.size).toBe(0)
  })

  it('닫히기 전에도 값이 보인다', () => {
    // ⚠️ **이게 없으면 처음 한 번이 화면에 영영 안 뜬다** — 구간은 다음 구간이
    // 열릴 때 닫히는데, 맵을 처음 나간 사람에게는 다음 구간이 없다
    const s = new FrameStats()
    s.openSpan('맵 전환')
    s.push(700)
    expect(s.spans.get('맵 전환')).toEqual({ first: 700, worst: 700, last: 700, count: 1 })
    s.push(1200)
    expect(s.spans.get('맵 전환')).toEqual({ first: 1200, worst: 1200, last: 1200, count: 1 })
  })

  it('reset하면 통째로 버린다', () => {
    const s = new FrameStats()
    s.openSpan('맵 전환')
    s.push(700)
    s.closeSpan()
    s.reset()
    expect(s.count).toBe(0)
    expect(s.spans.size).toBe(0)
    expect(s.percentile(0.99)).toBe(0)
  })
})
