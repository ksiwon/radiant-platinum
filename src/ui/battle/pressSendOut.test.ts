import { describe, expect, it } from 'vitest'
import type { Beat } from '../../engine/battle/playback'
import { BeatRunner } from './beatRunner'

/** 등판 한 벌 — 몸이 서는 연출 → 누를 때까지 서는 글 → 다음 등판 */
const BEATS: Beat[] = [
  { text: null, events: [], hold: 112, presentation: true },
  { text: '상대는 꼬마돌을 내보냈다!', events: [], hold: 30, press: true },
  { text: null, events: [], hold: 96, presentation: true },
  { text: '가랏! 모부기!', events: [], hold: 30, press: true },
]

function runner() {
  const shown: string[] = []
  let done = false
  const r = new BeatRunner({
    text: (line) => { shown.push(line) },
    hold: () => { /* 안 본다 */ },
    apply: () => { /* 안 본다 */ },
    ask: () => { /* 물음 없음 */ },
    caughtUp: (now) => { done = now },
  })
  const frames = (n: number) => { for (let i = 0; i < n; i++) r.step(BEATS, 1000 / 60, 1) }
  return { r, shown, frames, done: () => done }
}

describe('등판 글은 누를 때까지 선다 (`Beat.press`)', () => {
  it('쉼이 끝나도 안 넘어간다 — 누르면 다음 등판으로 간다', () => {
    const { r, shown, frames } = runner()
    frames(112 + 30 + 600)
    expect(shown).toEqual(['상대는 꼬마돌을 내보냈다!'])
    expect(r.index).toBe(1)
    r.advance(BEATS)
    frames(96 + 5)
    expect(shown).toEqual(['상대는 꼬마돌을 내보냈다!', '가랏! 모부기!'])
  })

  it('몸이 서는 동안 누른 것은 글을 넘기지 않는다', () => {
    const { r, shown, frames } = runner()
    frames(40)
    r.advance(BEATS)
    frames(112 + 30 + 60)
    expect(shown).toEqual(['상대는 꼬마돌을 내보냈다!'])
    expect(r.index).toBe(1)
  })

  it('마지막 등판 글도 눌러야 끝난다 — 그 전에는 명령 메뉴가 안 뜬다', () => {
    const { r, frames, done } = runner()
    frames(112 + 40); r.advance(BEATS)
    frames(96 + 600)
    expect(done()).toBe(false)
    r.advance(BEATS)
    frames(2)
    expect(done()).toBe(true)
  })
})
