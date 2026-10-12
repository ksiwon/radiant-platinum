// **기다림을 상태로 바꾼 자들을 건다** — 상한이 예전 고정 시간 이상이고, 못 읽으면 예전 고정 시간으로 물러나는지.
//
// ⚠️ 이 바꿈이 잘못되면 두 쪽으로 나쁘다: 상태가 안 섰는데 일찍 나오면 **판정이 달라지고**(없는 결함 · 놓친 결함),
// 상태가 서도 안 나오면 **예전보다 느려진다.** 그래서 참 · 거짓 · 못 읽음 · 상한을 각각 준다.
import { describe, expect, it } from 'vitest'
import { pauseFrames, pauseIdle, pauseSettled, waitFor, waitForOrThrow } from './waits.mjs'

/** `obs.motion()`을 흉내 낸다 — 부를 때마다 다음 답을 준다 (마지막 것을 되풀이한다) */
const motionOf = (answers) => {
  let n = 0
  const fn = async () => {
    fn.calls += 1
    const a = answers[Math.min(n++, answers.length - 1)]
    if (a instanceof Error) throw a
    return a
  }
  fn.calls = 0
  return fn
}
const known = (frames, speed = 0, hop = false) => ({ known: true, value: { frames, speed, hop } })
const UNKNOWN = { known: false, why: '배포물에서는 못 읽는다' }

describe('waitFor — 상태가 서기를 기다린다', () => {
  it('이미 참이면 한 번 묻고 바로 나온다', async () => {
    const t0 = Date.now()
    const r = await waitFor(async () => 'ok', { timeout: 5_000, poll: 200 })
    expect(r.ok).toBe(true)
    expect(r.value).toBe('ok')
    expect(Date.now() - t0).toBeLessThan(150)
  })

  it('몇 번 거짓이다 참이 되면 그때 나온다', async () => {
    let n = 0
    const r = await waitFor(async () => ++n >= 3, { timeout: 2_000, poll: 5 })
    expect(r.ok).toBe(true)
    expect(n).toBe(3)
  })

  it('끝내 거짓이면 상한에서 ok:false로 돌아온다 — 던지지 않는다', async () => {
    const t0 = Date.now()
    const r = await waitFor(async () => false, { timeout: 120, poll: 10 })
    expect(r.ok).toBe(false)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(110)
    expect(Date.now() - t0).toBeLessThan(600)
  })

  it('판정식이 던지면 「아직」으로 읽고 마지막 까닭을 남긴다', async () => {
    const r = await waitFor(async () => { throw new Error('모듈을 못 열었다') }, { timeout: 60, poll: 10 })
    expect(r.ok).toBe(false)
    expect(r.why).toContain('모듈을 못 열었다')
  })

  it('상한이 0이어도 한 번은 묻는다', async () => {
    let n = 0
    const r = await waitFor(async () => { n++; return true }, { timeout: 0 })
    expect(r.ok).toBe(true)
    expect(n).toBe(1)
  })
})

describe('waitForOrThrow — 안 서면 이어 가면 안 되는 자리', () => {
  it('상한을 넘기면 까닭을 달아 던진다', async () => {
    await expect(waitForOrThrow(async () => false, { timeout: 50, poll: 10 }, '맵이 안 섰다')).rejects.toThrow('맵이 안 섰다')
  })
})

describe('pauseFrames — 프레임이 나가기를 기다린다', () => {
  it('프레임이 나가면 상한 전에 나온다', async () => {
    const read = motionOf([known(100), known(100), known(101), known(103), known(105)])
    const t0 = Date.now()
    const r = await pauseFrames(read, 3, 5_000, { poll: 5 })
    expect(r.known).toBe(true)
    expect(r.ok).toBe(true)
    expect(r.frames).toBeGreaterThanOrEqual(3)
    expect(Date.now() - t0).toBeLessThan(1_000)
  })

  it('프레임이 안 나가면 상한(예전 시간의 5배, 최소 1초)에서 ok:false다', async () => {
    const read = motionOf([known(7)])
    const t0 = Date.now()
    const r = await pauseFrames(read, 2, 10, { poll: 10 })
    expect(r.known).toBe(true)
    expect(r.ok).toBe(false)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(950)
  })

  it('못 읽으면 예전 고정 시간 그대로 잔다 — 「됐다」로 접지 않는다', async () => {
    const read = motionOf([UNKNOWN])
    const t0 = Date.now()
    const r = await pauseFrames(read, 5, 90)
    expect(r.known).toBe(false)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(80)
    expect(read.calls).toBe(1)
  })

  it('읽다가 던져도 예전 고정 시간으로 물러난다', async () => {
    const read = motionOf([new Error('페이지가 닫혔다')])
    const r = await pauseFrames(read, 5, 30)
    expect(r.known).toBe(false)
  })
})

describe('pauseSettled — 남은 속도가 죽기를 기다린다', () => {
  it('이미 멈춰 있으면 바로 나온다 (막힌 채로 뗀 손 · 제자리 돌기)', async () => {
    const read = motionOf([known(1, 0)])
    const t0 = Date.now()
    const r = await pauseSettled(read, 5_000)
    expect(r.known).toBe(true)
    expect(r.ok).toBe(true)
    expect(Date.now() - t0).toBeLessThan(300)
  })

  it('남은 미끄러짐이 0.02칸(속력 0.24) 이하가 될 때 나온다 — 그보다 빠르면 기다린다', async () => {
    // 4.5 → 2 → 0.5 → 0.2: 마지막 읽기에서야 문턱(0.24) 아래다
    const read = motionOf([known(1, 4.5), known(2, 4.5), known(3, 2), known(4, 0.5), known(5, 0.2)])
    const r = await pauseSettled(read, 5_000, { poll: 5 })
    expect(r.ok).toBe(true)
    expect(read.calls).toBe(5)
  })

  it('끝내 안 죽으면 상한에서 ok:false다 (판정은 부르는 쪽이 한다)', async () => {
    const read = motionOf([known(1, 4.5)])
    const r = await pauseSettled(read, 10, { poll: 10 })
    expect(r.ok).toBe(false)
  })

  it('못 읽으면 예전 고정 시간 그대로다', async () => {
    const t0 = Date.now()
    const r = await pauseSettled(motionOf([UNKNOWN]), 80)
    expect(r.known).toBe(false)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(70)
  })
})

describe('pauseIdle — 뛰기가 끝나고 속력이 죽기를 기다린다', () => {
  it('프레임이 minFrames장 나가기 전에는 「안 뛴다」를 안 믿는다 — 시작 전을 끝으로 읽지 않는다', async () => {
    // 첫 읽기 100 → 101(뛰기 아직 거짓이지만 프레임이 한 장뿐) → 102(두 장, 뛰기 거짓) → 나온다
    const read = motionOf([known(100), known(101, 0, false), known(102, 0, false)])
    const r = await pauseIdle(read, 5_000, { minFrames: 2, poll: 5 })
    expect(r.ok).toBe(true)
    expect(read.calls).toBe(3)
  })

  it('뛰는 동안은 기다린다', async () => {
    const read = motionOf([known(1), known(5, 3, true), known(9, 3, true), known(14, 0.1, false)])
    const r = await pauseIdle(read, 5_000, { minFrames: 2, poll: 5 })
    expect(r.ok).toBe(true)
    expect(read.calls).toBe(4)
  })

  it('못 읽으면 예전 고정 시간 그대로다', async () => {
    const t0 = Date.now()
    const r = await pauseIdle(motionOf([UNKNOWN]), 80)
    expect(r.known).toBe(false)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(70)
  })
})
