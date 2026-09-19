// 배틀 연출이 **화면 주사율에 안 묶인다** (지시서 R1).
//
// 예전 재생기는 `requestAnimationFrame` 콜백마다 남은 쉼에서 1을 뺐다. 원작의
// 60프레임을 **디스플레이 60회**와 같은 것으로 친 구현이라, 같은 연출이
// 30Hz에서 4,033ms · 60Hz에서 2,017ms · 120Hz에서 1,008ms · 144Hz에서 840ms였다
// (지시서의 실측표). 그 자리를 못 박는다.
//
// ⚠️ **화면을 안 띄운다.** 훅을 돌리려면 브라우저가 있어야 하는데, 그러면 주사율을
// 마음대로 못 고른다. 그래서 알맹이(`BeatRunner`)를 **제품 소스 그대로** 쓰고
// 걸음의 길이만 시험이 정한다 — 재는 것은 「몇 ms 만에 그 사건이 접혔는가」다.
import { describe, expect, it } from 'vitest'
import type { Actor, BattleEvent } from '../../engine/battle/events'
import { buildBeats, type Beat } from '../../engine/battle/playback'
import { MAX_STEP_MS } from '../../engine/battle/presentationClock'
import { BeatRunner } from './beatRunner'

const p1: Actor = { slot: 'p1a', side: 'p1', name: '모부기' }
const p2: Actor = { slot: 'p2a', side: 'p2', name: '이상해씨' }

const move = (actor: Actor): BattleEvent => ({
  kind: 'move', actor, move: 33, moveName: '몸통박치기', target: null, miss: false, from: null,
})
const hit = (actor: Actor, hp: number): BattleEvent => ({
  kind: 'damage', actor, condition: { hp, maxHp: 20, status: 'ok' }, from: null,
})

const say = (e: BattleEvent): string | null =>
  (e.kind === 'move' ? `${e.actor.name}의 ${e.moveName}!` : null)

const TURN: BattleEvent[] = [{ kind: 'turn', turn: 1 }, move(p1), hit(p2, 12)]

/** 걸음마다 그 사건이 접힌 **연출 시각**을 적는다 */
function run(
  beats: readonly Beat[],
  steps: Iterable<number>,
  scale = 1,
): { damageAt: number | null, total: number, order: string[] } {
  const order: string[] = []
  let at = 0
  let damageAt: number | null = null
  const runner = new BeatRunner({
    text: (line) => { order.push(`글:${line}`) },
    hold: () => { /* 게이지 전환 길이는 여기서 안 잰다 */ },
    apply: (events) => {
      for (const e of events) {
        order.push(`사건:${e.kind}`)
        if (e.kind === 'damage' && damageAt === null) damageAt = at
      }
    },
    ask: () => { /* 이 판에는 물음이 없다 */ },
    caughtUp: () => { /* 끝났는지는 걸음 수로 안다 */ },
  })
  for (const step of steps) {
    at += step
    runner.step(beats, step, scale)
  }
  return { damageAt, total: at, order }
}

/** 그 주사율로 넉넉히 도는 걸음들 */
function ticks(hz: number, seconds = 12): number[] {
  const step = 1000 / hz
  return Array.from({ length: Math.ceil(hz * seconds) }, () => step)
}

describe('연출 길이는 주사율을 안 탄다', () => {
  const beats = buildBeats(TURN, say)

  const rates = [30, 60, 120, 144, 165]
  const measured = rates.map((hz) => ({ hz, ...run(beats, ticks(hz)) }))

  it('어느 주사율에서도 피해가 같은 시각에 접힌다', () => {
    const times = measured.map((m) => m.damageAt)
    for (const [i, t] of times.entries()) {
      expect(t, `${String(rates[i])}Hz에서 피해가 안 왔다`).not.toBeNull()
    }
    const base = times[1]!  // 60Hz
    for (const [i, t] of times.entries()) {
      // 한 프레임(16.7ms) 안이면 같은 것으로 친다. 그 이상 벌어지면 다시
      // 디스플레이 횟수를 세고 있는 것이다
      expect(Math.abs(t! - base), `${String(rates[i])}Hz가 ${String(t)}ms · 60Hz가 ${String(base)}ms`)
        .toBeLessThanOrEqual(1000 / 60 + 1)
    }
  })

  it('걸음 길이가 들쭉날쭉해도 같다', () => {
    // 실제 브라우저의 프레임은 고르지 않다 — GC·합성·입력이 끼어든다
    let seed = 1234
    const wobbly = Array.from({ length: 900 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return 4 + (seed % 40)
    })
    const got = run(beats, wobbly)
    expect(got.damageAt).not.toBeNull()
    expect(Math.abs(got.damageAt! - measured[1]!.damageAt!)).toBeLessThanOrEqual(45)
  })

  it('차례는 어느 주사율에서도 똑같다', () => {
    const shapes = measured.map((m) => m.order.join(' → '))
    for (const [i, shape] of shapes.entries()) {
      expect(shape, `${String(rates[i])}Hz의 차례가 다르다`).toBe(shapes[0])
    }
  })

  it('연출이 끝나기 전에는 체력이 안 바뀐다', () => {
    // 기술 글 → 연출 → 게이지 순서다. 사건 `move`가 접힌 뒤 `damage`가 올
    // 때까지 최소한 그 연출 프레임만큼은 흘러야 한다
    const shape = measured[1]!.order
    expect(shape.indexOf('사건:move')).toBeLessThan(shape.indexOf('사건:damage'))
    const moveBeat = beats.find((b) => b.events.some((e) => e.kind === 'move'))
    expect(moveBeat?.presentation, '기술 박자가 연출로 안 잠겼다').toBe(true)
    const least = (moveBeat?.hold ?? 0) * (1000 / 60)
    // 기술 글이 뜬 뒤 게이지까지 걸린 시간이 연출 길이 아래로 안 내려간다
    expect(measured[1]!.damageAt).toBeGreaterThanOrEqual(least)
  })
})

describe('긴 프레임 하나가 여러 박자를 삼키지 않는다', () => {
  const beats = buildBeats(TURN, say)

  it('탭을 숨겼다 돌아와도 한 걸음에 한 박자만 쓴다', () => {
    // 5초짜리 걸음 하나. 예전 구현은 이것도 **한 프레임**이라 쉼이 1만 줄었지만,
    // ms로 바꾸면 반대로 다섯 박자를 통째로 삼킬 수 있다 — 둘 다 틀렸다
    const slow = run(beats, [5000, 5000])
    const fast = run(beats, ticks(60))
    expect(slow.order.length, '긴 걸음 둘에 배틀이 통째로 지나갔다')
      .toBeLessThan(fast.order.length)
  })

  it('시계가 한 걸음을 잘라 둔다', () => {
    // 재생기는 받은 ms를 그대로 쓴다. 자르는 쪽은 시계다 — 그 값이 이 시험의
    // 전제이므로 여기서 같이 붙잡는다
    expect(MAX_STEP_MS).toBeLessThanOrEqual(200)
  })
})

describe('A·Z는 글만 줄인다', () => {
  it('연출 박자는 연타로도 안 줄어든다', () => {
    const beats = buildBeats(TURN, say)
    const order: string[] = []
    let at = 0
    let damageAt: number | null = null
    const runner = new BeatRunner({
      text: () => { /* 글은 이 시험에서 안 본다 */ },
      hold: () => { /* 게이지 전환 길이는 안 본다 */ },
      apply: (events) => {
        for (const e of events) {
          order.push(e.kind)
          if (e.kind === 'damage' && damageAt === null) damageAt = at
        }
      },
      ask: () => { /* 물음 없음 */ },
      caughtUp: () => { /* 끝은 걸음 수로 안다 */ },
    })
    // 매 걸음마다 A를 누른다
    for (let i = 0; i < 720; i++) {
      at += 1000 / 60
      runner.advance(beats)
      runner.step(beats, 1000 / 60, 1)
    }
    const moveBeat = beats.find((b) => b.events.some((e) => e.kind === 'move'))!
    // 부동소수 한 톨은 봐준다 — 재는 것은 「연타가 연출을 반으로 잘랐는가」다
    expect(damageAt, '연타로 연출이 잘렸다')
      .toBeGreaterThan(moveBeat.hold * (1000 / 60) - 1)
  })
})
