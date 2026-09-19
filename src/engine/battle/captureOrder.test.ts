// 포획 결과 글은 **공 연출을 기다린다** (지시서 R2).
//
// 예전에는 `ball` 사건에 제 박자가 없어서 `default` 분기의 `show([told], 0)`으로
// 떨어졌다. 쉼이 0인 박자는 재생기가 **같은 프레임에** 이어 붙이므로
// (`ui/battle/beatRunner`) 「잡았다!」가 던지는 순간에 떴다 — 흔들림 세 번이
// 끝나는 시각은 공 함수 기준 0.92 + 3×0.46 = 2.30초다.
import { describe, expect, it } from 'vitest'
import { captureDuration, captureResolveAt } from './captureTiming'
import type { Actor, BattleEvent } from './events'
import { buildBeats, type Beat } from './playback'
import { FRAME_SECONDS } from './presentationClock'

const me: Actor = { slot: 'p1a', side: 'p1', name: '모부기' }
const wild: Actor = { slot: 'p2a', side: 'p2', name: '꼬링크' }

const ball = (shakes: number, caught: boolean): BattleEvent => ({
  kind: 'ball', actor: wild, ball: 4, shakes, caught,
})

const say = (e: BattleEvent): string | null => {
  if (e.kind !== 'ball') return null
  return e.caught ? '신난다! 꼬링크를 잡았다!' : `안돼! 볼에서 나와버렸다! (${String(e.shakes)})`
}

/**
 * 박자 목록을 **연출 시각**으로 편다. 재생기가 쉬는 프레임을 그대로 더한다 —
 * 실제 화면 없이 「그 글이 몇 초에 처음 떴는가」를 재는 자리다
 */
function timeline(beats: readonly Beat[]): { at: number, text: string | null, kinds: string[] }[] {
  let at = 0
  return beats.map((b) => {
    const row = { at, text: b.text, kinds: b.events.map((e) => e.kind) }
    at += b.hold * FRAME_SECONDS
    return row
  })
}

describe('공이 멎은 뒤에 결과를 말한다', () => {
  for (const shakes of [0, 1, 2, 3]) {
    it(`흔들림 ${String(shakes)}회 · 실패`, () => {
      const beats = buildBeats([ball(shakes, false)], say)
      const rows = timeline(beats)
      const result = rows.find((r) => r.text !== null)
      expect(result, '결과 글이 없다').toBeDefined()
      // ⚠️ **확정 시각 이상이어야 한다.** 0.01초는 프레임 하나를 올림한 여유다
      expect(result!.at + 0.001, `${String(result!.at)}초에 떴다`)
        .toBeGreaterThanOrEqual(captureResolveAt(shakes))
    })
  }

  it('흔들림 3회 · 성공', () => {
    const beats = buildBeats([ball(3, true)], say)
    const rows = timeline(beats)
    const result = rows.find((r) => r.text !== null)
    expect(result!.at + 0.001).toBeGreaterThanOrEqual(captureResolveAt(3))
  })

  it('결과 글 뒤에 연출이 사그라지는 자리가 남는다', () => {
    // 마지막 반짝임이 뜨기 전에 무대가 내려가면 안 된다
    const beats = buildBeats([ball(3, true)], say)
    const rows = timeline(beats)
    const last = rows[rows.length - 1]!
    const total = last.at + (beats[beats.length - 1]!.hold * FRAME_SECONDS)
    expect(total + 0.001).toBeGreaterThanOrEqual(captureDuration(3, true))
  })

  it('공 박자는 연출로 잠긴다 — A·Z로도 빠르기로도 안 줄어든다', () => {
    const beats = buildBeats([ball(3, false)], say)
    const throwing = beats.find((b) => b.events.some((e) => e.kind === 'ball'))
    expect(throwing?.presentation, '공 박자가 글 대기로 남아 있다').toBe(true)
  })

  it('글자 수로 기다리지 않는다', () => {
    // 문구 길이를 바꿔도 공이 흔들리는 시간은 같다
    const short = buildBeats([ball(2, false)], () => '앗')
    const long = buildBeats([ball(2, false)], () => '아깝다! 조금만 더 하면 잡을 수 있었는데!')
    const holdOf = (list: Beat[]): number =>
      list.find((b) => b.events.some((e) => e.kind === 'ball'))?.hold ?? -1
    expect(holdOf(short)).toBe(holdOf(long))
  })
})

describe('성공 뒤의 일은 포획이 풀린 뒤에 온다', () => {
  it('배틀 종료 사건이 공 박자보다 뒤다', () => {
    const win: BattleEvent = { kind: 'win', winner: '나' }
    const beats = buildBeats([ball(3, true), win], say)
    const ballAt = beats.findIndex((b) => b.events.some((e) => e.kind === 'ball'))
    const winAt = beats.findIndex((b) => b.events.some((e) => e.kind === 'win'))
    expect(ballAt).toBeGreaterThanOrEqual(0)
    expect(winAt).toBeGreaterThan(ballAt)
    // 그 사이에 실제로 쉬는 자리가 있어야 한다 — 0이면 같은 프레임이다
    const between = beats.slice(ballAt, winAt).reduce((sum, b) => sum + b.hold, 0)
    expect(between * FRAME_SECONDS + 0.001).toBeGreaterThanOrEqual(captureDuration(3, true))
  })

  it('실패 뒤 상대의 다음 기술도 마찬가지다', () => {
    const next: BattleEvent = {
      kind: 'move', actor: wild, move: 33, moveName: '몸통박치기',
      target: { slot: me.slot, side: me.side, name: me.name }, miss: false, from: null,
    }
    const beats = buildBeats([ball(1, false), next], say)
    const ballAt = beats.findIndex((b) => b.events.some((e) => e.kind === 'ball'))
    const moveAt = beats.findIndex((b) => b.events.some((e) => e.kind === 'move'))
    const between = beats.slice(ballAt, moveAt).reduce((sum, b) => sum + b.hold, 0)
    expect(between * FRAME_SECONDS + 0.001).toBeGreaterThanOrEqual(captureDuration(1, false))
  })
})
