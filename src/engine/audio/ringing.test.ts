// 울리는 소리 세기 (`ringing.ts`)
//
// ⚠️ **여기가 게임이 멈추느냐 마느냐를 가른다.** 필드 스크립트가 `WaitSE`·
// `WaitFanfare`로 이 답이 거짓이 되기를 기다리는데, 참에 갇히면 주인공이 그
// 자리에 영영 묶인다. 실측으로 그랬다 — 새 게임 침실에서 팡파르 하나가
// 안 끝나 오프닝이 거기서 죽었고, 밖에서는 "얼었다"로만 보였다.
import { describe, expect, it } from 'vitest'
import { RingCounter, type Timers } from './ringing'

/** 손으로 돌리는 시계. 실제 시간을 안 기다린다 */
function fakeTimers(): Timers & { tick: (ms: number) => void } {
  let at = 0
  let next = 1
  const jobs = new Map<number, { due: number, fn: () => void }>()
  return {
    set: (fn, ms) => { const id = next++; jobs.set(id, { due: at + ms, fn }); return id },
    clear: (h) => { jobs.delete(h as number) },
    tick: (ms) => {
      at += ms
      for (const [id, job] of [...jobs]) {
        if (job.due <= at) { jobs.delete(id); job.fn() }
      }
    },
  }
}

describe('울리는 소리', () => {
  it('끝났다고 알리면 곧바로 안 울린다', () => {
    const clock = fakeTimers()
    const ring = new RingCounter(15_000, clock)
    const one = ring.start(1500)
    expect(ring.has(1500)).toBe(true)
    one.release()
    expect(ring.has(1500)).toBe(false)
  })

  it('같은 소리가 겹쳐 나면 마지막 하나가 끝나야 끝이다', () => {
    const clock = fakeTimers()
    const ring = new RingCounter(15_000, clock)
    const a = ring.start(1500)
    const b = ring.start(1500)
    a.release()
    expect(ring.has(1500)).toBe(true)
    b.release()
    expect(ring.has(1500)).toBe(false)
  })

  it('아무도 안 알려 줘도 상한에서 스스로 끝난다 — 이게 없으면 게임이 멈춘다', () => {
    const clock = fakeTimers()
    const ring = new RingCounter(15_000, clock)
    ring.start(1500) // 놓아 주는 사람이 없다: 파일을 못 받았거나 워커가 죽었다
    clock.tick(14_999)
    expect(ring.has(1500)).toBe(true)
    clock.tick(2)
    expect(ring.has(1500)).toBe(false)
  })

  it('소리 길이를 알게 되면 상한을 그것으로 줄인다', () => {
    const clock = fakeTimers()
    const ring = new RingCounter(15_000, clock)
    const one = ring.start(1500)
    one.by(800) // 편 버퍼가 0.8초짜리였다
    clock.tick(900)
    expect(ring.has(1500)).toBe(false)
  })

  it('끝난 뒤에 상한을 다시 걸어도 되살아나지 않는다', () => {
    const clock = fakeTimers()
    const ring = new RingCounter(15_000, clock)
    const one = ring.start(1500)
    one.release()
    one.by(100)
    clock.tick(200)
    expect(ring.has(1500)).toBe(false)
  })

  it('끊으면 센 것이 사라진다 — 소리는 남아도 스크립트는 안 멎는다', () => {
    const clock = fakeTimers()
    const ring = new RingCounter(15_000, clock)
    ring.start(1500)
    ring.clear(1500)
    expect(ring.has(1500)).toBe(false)
  })

  it('끊은 뒤 다시 튼 소리를 앞 소리의 타이머가 끝내지 않는다', () => {
    // A 시작 → 끊기 → B 시작 → **A의 상한 타이머가 뒤늦게 깨어난다.** 수만
    // 세면 여기서 B가 0이 되고 `WaitSE`가 너무 일찍 풀린다
    const clock = fakeTimers()
    const ring = new RingCounter(15_000, clock)
    ring.start(1500)
    clock.tick(10_000)
    ring.clear(1500)
    const b = ring.start(1500)
    clock.tick(6_000) // A의 상한이 여기서 지난다
    expect(ring.has(1500)).toBe(true)
    b.release()
    expect(ring.has(1500)).toBe(false)
  })
})
