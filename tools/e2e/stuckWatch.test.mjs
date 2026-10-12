// **멈춤 감시를 건다** — 지문이 한 글자라도 바뀌면 진행이고, 한도 동안 그대로면 멈춤이다.
//
// ⚠️ 이 감시자가 잘못되면 두 쪽으로 나쁘다: 멀쩡한 판을 끊거나(진행을 못 알아봄), 멈춘 판을 안 끊는다(계기판 숫자 따위가
// 지문에 섞여 늘 진행 중). 그래서 「무엇이 진행인가」를 지문 재료별로 준다.
import { describe, expect, it } from 'vitest'
import { DEFAULT_STUCK_MINUTES, fingerprintOf, makeStuckClock, startStuckWatch } from './stuckWatch.mjs'

const base = () => ({
  marks: { path: '/play', scene: 'overworld', map: '3', tile: '112,880', fps: '60' },
  script: null,
  battle: null,
  at: { x: 112.5, z: 880.5 },
})

describe('fingerprintOf — 무엇이 진행인가', () => {
  it('같은 재료는 같은 글이다', () => {
    expect(fingerprintOf(base())).toBe(fingerprintOf(base()))
  })

  it.each([
    ['맵', (r) => { r.marks.map = '4' }],
    ['칸', (r) => { r.marks.tile = '113,880' }],
    ['정확한 좌표', (r) => { r.at = { x: 112.6, z: 880.5 } }],
    ['장면', (r) => { r.marks.scene = 'battle' }],
    ['대사', (r) => { r.marks.talk = '1' }],
    ['스크립트 표식', (r) => { r.marks.script = '1' }],
    ['메뉴', (r) => { r.marks.menu = 'bag' }],
    ['컷인', (r) => { r.marks.cutin = '2' }],
    ['복원', (r) => { r.marks.restoring = 'loading' }],
    ['배틀 종류', (r) => { r.marks.battle = 'wild' }],
    ['주소', (r) => { r.marks.path = '/intro' }],
    ['스크립트 줄', (r) => { r.script = { file: 'a.s', pc: 3, state: 'run' } }],
    ['배틀 턴', (r) => { r.battle = { phase: 'running', turn: 2, shiftAsk: null, actions: 4 } }],
  ])('%s이 바뀌면 지문이 바뀐다', (_, change) => {
    const r = base()
    change(r)
    expect(fingerprintOf(r)).not.toBe(fingerprintOf(base()))
  })

  it('스크립트가 한 줄 나아가면 지문이 바뀐다 — 대사를 넘기는 중은 진행이다', () => {
    const a = { ...base(), script: { file: 'a.s', pc: 3, state: 'run' } }
    const b = { ...base(), script: { file: 'a.s', pc: 4, state: 'run' } }
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b))
  })

  it('계기판 숫자(fps)는 지문에 안 든다 — 매 초 바뀌는 값이 멈춤을 가리면 안 된다', () => {
    const a = base()
    const b = base()
    b.marks.fps = '4'
    b.marks.perf = 'anything'
    expect(fingerprintOf(a)).toBe(fingerprintOf(b))
  })

  it('못 읽은 것(undefined)과 없는 것(null)을 같은 글로 접지 않는다', () => {
    const a = { ...base(), script: undefined }
    const b = { ...base(), script: null }
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b))
  })
})

describe('makeStuckClock', () => {
  it('지문이 바뀌면 처음부터 센다', () => {
    const c = makeStuckClock(1_000)
    expect(c.note('a', 0)).toEqual({ stuck: false, sameMs: 0 })
    expect(c.note('a', 600).stuck).toBe(false)
    expect(c.note('b', 900)).toEqual({ stuck: false, sameMs: 0 })
    expect(c.note('b', 1_800).stuck).toBe(false)
    expect(c.note('b', 1_900).stuck).toBe(true)
  })

  it('한도 정각에 멈춤이다', () => {
    const c = makeStuckClock(500)
    c.note('x', 0)
    expect(c.note('x', 499).stuck).toBe(false)
    expect(c.note('x', 500).stuck).toBe(true)
  })

  it('한도가 0 이하면 만들지 않는다 (끄는 것은 부르는 쪽이 안 켜는 것이다)', () => {
    expect(() => makeStuckClock(0)).toThrow()
    expect(() => makeStuckClock(-1)).toThrow()
    expect(() => makeStuckClock(NaN)).toThrow()
  })

  it('기본 한도는 8분이다', () => {
    expect(DEFAULT_STUCK_MINUTES).toBe(8)
  })
})

describe('startStuckWatch', () => {
  /** 시각을 손으로 넘기는 가짜 시계와 재료를 손으로 갈아 끼우는 가짜 읽기 */
  const rig = (limitMs) => {
    let t = 0
    let now = base()
    const evidence = []
    const w = startStuckWatch({}, {
      limitMs, pollMs: 1,
      clock: () => t,
      read: async () => now,
      onStuck: async (info) => { evidence.push(info); return { shot: 'stuck.png', state: 'stuck.json' } },
    })
    return { w, at: (ms) => { t = ms }, set: (next) => { now = next }, evidence }
  }
  const settle = () => new Promise((r) => { setTimeout(r, 30) })

  it('지문이 그대로면 한도 뒤에 풀리고 증거를 남긴다', async () => {
    const { w, at, evidence } = rig(1_000)
    at(0); await settle()
    at(1_500)
    const z = await w.stuck
    expect(z.sameMs).toBeGreaterThanOrEqual(1_000)
    expect(z.evidence).toEqual({ shot: 'stuck.png', state: 'stuck.json' })
    expect(z.fingerprint).toContain('map=3')
    expect(evidence).toHaveLength(1)
  })

  it('지문이 바뀌는 동안은 안 풀린다 — 진행 중인 칸을 안 끊는다', async () => {
    const { w, at, set } = rig(1_000)
    let resolved = false
    void w.stuck.then(() => { resolved = true })
    for (let i = 0; i < 8; i++) {
      at(i * 600)
      set({ ...base(), at: { x: 112.5 + i, z: 880.5 } })
      await settle()
    }
    expect(resolved).toBe(false)
    w.stop()
  })

  it('stop하면 더는 안 읽는다', async () => {
    const { w, at } = rig(1_000)
    w.stop()
    at(99_999)
    await settle()
    let resolved = false
    void w.stuck.then(() => { resolved = true })
    await settle()
    expect(resolved).toBe(false)
  })

  it('증거를 못 남겨도 멈춤은 멈춤이다', async () => {
    let t = 0
    const w = startStuckWatch({}, {
      limitMs: 100, pollMs: 1, clock: () => t, read: async () => base(),
      onStuck: async () => { throw new Error('스크린샷이 안 찍혔다') },
    })
    await settle()
    t = 500
    const z = await w.stuck
    expect(String(z.evidence)).toContain('증거를 못 남겼다')
  })

  it('읽다가 던져도 감시가 죽지 않는다 (페이지가 잠깐 안 대답하는 것은 멈춤이 아니다)', async () => {
    let t = 0
    let n = 0
    const w = startStuckWatch({}, {
      limitMs: 100, pollMs: 1, clock: () => t,
      read: async () => { n++; if (n <= 3) throw new Error('evaluate 실패'); return base() },
    })
    await settle()
    t = 1_000
    await settle()
    t = 2_000
    const z = await w.stuck
    expect(z.fingerprint).toContain('map=3')
  })
})
