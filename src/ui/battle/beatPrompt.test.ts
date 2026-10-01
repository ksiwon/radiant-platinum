// 재생기가 「지금 누름을 기다리는가 · 지금 넘길 것이 있는가」를 알린다 (`BeatSink`).
//
// 글창의 ▼와 「Z 넘기기」가 재생 내내 떠 있었다 — 기술 연출·게이지·볼 흔들림 동안에도.
// 그때는 Z가 아무것도 안 줄인다 (`beatRunner.advance`가 잠긴 쉼을 못 건드린다).
// 물음 뒤에 끼우는 박자(기술을 잊고 배운 결과 줄)도 여기서 잰다.
import { describe, expect, it } from 'vitest'
import type { Beat } from '../../engine/battle/playback'
import { BeatRunner, type LevelPanelShot } from './beatRunner'

const FRAME = 1000 / 60

function runner(beats: readonly Beat[]) {
  const shown: string[] = []
  const seen = { press: false, skip: false, panel: null as LevelPanelShot | null, ask: false, done: false }
  const r = new BeatRunner({
    text: (line) => { if (line !== '') shown.push(line) },
    hold: () => { /* 안 본다 */ },
    apply: () => { /* 안 본다 */ },
    ask: (prompt) => { seen.ask = prompt !== null },
    caughtUp: (now) => { seen.done = now },
    waitingPress: (on) => { seen.press = on },
    skippable: (on) => { seen.skip = on },
    panel: (panel) => { seen.panel = panel },
  })
  const frames = (n: number) => { for (let i = 0; i < n; i++) r.step(beats, FRAME, 1) }
  return { r, shown, seen, frames }
}

describe('▼는 누름을 기다릴 때만이다', () => {
  const BEATS: Beat[] = [
    { text: null, events: [], hold: 96, presentation: true },
    { text: '가랏! 모부기!', events: [], hold: 30, press: true },
  ]

  it('몸이 서는 연출 동안은 안 뜨고, 등판 글에서 뜨고, 누르면 진다', () => {
    const { r, seen, frames } = runner(BEATS)
    frames(10)
    expect(seen.press).toBe(false)
    frames(96)
    expect(seen.press).toBe(true)
    r.advance(BEATS)
    expect(seen.press).toBe(false)
  })
})

describe('「Z 넘기기」는 무엇이든 줄일 수 있을 때만이다', () => {
  const BEATS: Beat[] = [
    { text: '모부기의 몸통박치기!', events: [], hold: 0 },
    { text: null, events: [], hold: 40, presentation: true },
    { text: null, events: [], hold: 48, gauge: true },
    { text: '효과가 굉장했다!', events: [], hold: 30 },
  ]

  it('글 읽는 시간에는 뜨고, 연출과 게이지 동안은 안 뜬다', () => {
    const { seen, frames } = runner(BEATS)
    frames(1)
    expect(seen.skip).toBe(true)
    // 「모부기의 몸통박치기!」 열한 자 × 4프레임이 지나면 연출 박자다
    frames(50)
    expect(seen.skip).toBe(false)
    // 연출 40프레임 → 게이지 48프레임
    frames(60)
    expect(seen.skip).toBe(false)
    frames(40)
    expect(seen.skip).toBe(true)
  })

  it('넘기면 그 박자에서는 더 안 뜬다', () => {
    const { r, seen, frames } = runner(BEATS.slice(3))
    frames(1)
    expect(seen.skip).toBe(true)
    r.advance(BEATS.slice(3))
    expect(seen.skip).toBe(false)
  })
})

describe('물음 뒤에 결과 줄을 끼운다 (`resolve(after)`)', () => {
  const BEATS: Beat[] = [
    { text: '모부기는 새로 이상한빛을 배우고 싶다…', events: [], hold: 30, ask: { key: 'p1-0', move: 109 } },
    { text: '다음 줄', events: [], hold: 30 },
  ]
  const AFTER: Beat[] = [
    { text: '1, 2, 그리고… 짠!', events: [], hold: 30 },
    { text: '모부기는 몸통박치기의 사용법을 깨끗이 잊었다!', events: [], hold: 30 },
  ]

  it('물은 박자 → 끼운 박자 → 목록의 다음 박자 차례다', () => {
    const { r, shown, seen, frames } = runner(BEATS)
    frames(200)
    expect(seen.ask).toBe(true)
    r.resolve(AFTER)
    frames(400)
    expect(shown).toEqual([
      '모부기는 새로 이상한빛을 배우고 싶다…',
      '1, 2, 그리고… 짠!',
      '모부기는 몸통박치기의 사용법을 깨끗이 잊었다!',
      '다음 줄',
    ])
    expect(seen.ask).toBe(false)
    expect(seen.done).toBe(true)
  })

  it('끼운 박자가 도는 동안은 「다 소화했다」가 아니다', () => {
    const { r, seen, frames } = runner(BEATS.slice(0, 1))
    frames(200)
    r.resolve(AFTER)
    frames(5)
    expect(seen.done).toBe(false)
    expect(r.index).toBe(1)
    frames(400)
    expect(seen.done).toBe(true)
  })

  it('답만 하고 끼울 것이 없으면 예전 그대로 다음 박자다', () => {
    const { r, shown, frames } = runner(BEATS)
    frames(200)
    r.resolve()
    frames(200)
    expect(shown).toEqual(['모부기는 새로 이상한빛을 배우고 싶다…', '다음 줄'])
  })
})

describe('레벨업 능력치 창을 박자와 함께 알린다', () => {
  const stats = { hp: 20, atk: 11, def: 12, spa: 10, spd: 10, spe: 9 }
  const panel: LevelPanelShot = { key: 'p1-0', level: 6, before: stats, after: { ...stats, hp: 23 } }
  const BEATS = [
    { text: '모부기는 레벨 6으로 올랐다!', events: [], hold: 30 },
    { text: null, events: [], hold: 0, press: true, levelPanel: panel },
    { text: '다음 줄', events: [], hold: 30 },
  ] as Beat[]

  it('창 박자에서만 서고, 누르면 걷힌다', () => {
    const { r, seen, frames } = runner(BEATS)
    frames(5)
    expect(seen.panel).toBeNull()
    frames(200)
    expect(seen.panel).toBe(panel)
    expect(seen.press).toBe(true)
    r.advance(BEATS)
    frames(2)
    expect(seen.panel).toBeNull()
  })
})
