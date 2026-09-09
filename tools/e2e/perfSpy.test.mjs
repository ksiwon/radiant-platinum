// 진단기가 원래 오류를 덮지 않는가 (`perfSpy.mjs`) — 후속 §7의 회귀 검사
//
// ⚠️ **재는 것은 「진단이 실패해도 원래 예외가 그대로 나가는가」다.** 예전에는
// 기록을 만드는 코드가 `catch` 안에 그냥 있어서, getter나 proxy가 거기서 터지면
// **다른 오류**가 나가고 진짜 원인이 사라졌다.
import { afterEach, describe, expect, it } from 'vitest'
import { SPY } from './perfSpy.mjs'

const was = performance.measure.bind(performance)

/** `SPY`는 브라우저 전역을 쓴다 — 여기서 그 셋만 세워 준다 */
function arm(fail) {
  globalThis.window = globalThis
  globalThis.document = { documentElement: { dataset: { scene: 'overworld' } } }
  performance.measure = (name, options) => {
    if (fail) throw new Error(`could not be cloned: ${String(name)}`)
    return { name, options }
  }
  SPY()
  return globalThis.__perfSpy
}

afterEach(() => {
  performance.measure = was
  delete globalThis.__perfSpy
})

describe('원래 동작 보존', () => {
  it('안 터지면 원래 값을 그대로 돌려주고 센다', () => {
    const spy = arm(false)
    expect(performance.measure('a', { detail: 1 })).toEqual({ name: 'a', options: { detail: 1 } })
    expect(spy.calls).toBe(1)
    expect(spy.fails).toEqual([])
  })

  it('터지면 그 오류를 그대로 다시 던진다', () => {
    const spy = arm(true)
    expect(() => performance.measure('b', { detail: { x: 1 } })).toThrow(/could not be cloned: b/)
    expect(spy.fails).toHaveLength(1)
    expect(spy.fails[0].name).toBe('b')
  })

  it('detail을 읽다 터져도 원래 오류가 이긴다', () => {
    const spy = arm(true)
    const nasty = { get boom() { throw new Error('진단이 터졌다') } }
    let caught = null
    try { performance.measure('c', { detail: nasty }) } catch (e) { caught = e }
    // ⚠️ **여기가 이 파일의 핵심이다** — 나간 것은 진단의 오류가 아니다
    expect(String(caught?.message)).toMatch(/could not be cloned: c/)
    expect(String(caught?.message)).not.toMatch(/진단이 터졌다/)
    expect(spy.calls).toBe(1)
  })
})

describe('비용과 확정의 상한', () => {
  it('무거운 추적은 첫 실패에만 한다', () => {
    const spy = arm(true)
    const detail = { fn() {} }
    for (const n of ['a', 'b', 'c']) {
      expect(() => performance.measure(n, { detail })).toThrow()
    }
    expect(Array.isArray(spy.fails[0].culprit)).toBe(true)
    expect(spy.fails[1].culprit).toBe('첫 실패에서만 판다')
    expect(spy.fails[2].culprit).toBe('첫 실패에서만 판다')
  })

  it('자식을 다 안 봤으면 그 객체를 범인으로 확정하지 않는다', () => {
    const spy = arm(true)
    // 앞 24개는 멀쩡하고 **스물다섯째**가 복제를 막는다
    const big = {}
    for (let i = 0; i < 24; i++) big[`ok${String(i)}`] = i
    big.late = () => {}
    expect(() => performance.measure('d', { detail: big })).toThrow()
    const hit = spy.fails[0].culprit.find((c) => c.path === 'detail')
    expect(hit).toBeDefined()
    expect(hit.truncated).toBe(25)
    expect(hit.verdict).toMatch(/미확정/)
  })

  it('실제 범인은 길로 짚는다', () => {
    const spy = arm(true)
    expect(() => performance.measure('e', { detail: { a: 1, deep: { bad: () => {} } } })).toThrow()
    const paths = spy.fails[0].culprit.map((c) => c.path)
    expect(paths).toContain('detail.deep.bad')
  })

  it('prop 이름은 타입으로 접지 않는다', () => {
    const spy = arm(true)
    const detail = { devtools: { properties: [['onPointerMove', () => {}]] } }
    expect(() => performance.measure('f', { detail })).toThrow()
    expect(spy.fails[0].props).toEqual([['onPointerMove', 'function']])
  })
})
