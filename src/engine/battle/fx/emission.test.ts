import { describe, expect, it } from 'vitest'
import { FxRandom } from './curve'
import { deathBurstCount, emitBetween } from './emission'
import type { EmissionModule } from './schema'

/** 0초부터 `until`까지 60Hz로 밀며 뿜은 시각을 모은다 */
function times(em: EmissionModule, duration: number, looping: boolean, until: number): number[] {
  const out: number[] = []
  const state = { carry: 0 }
  const rng = new FxRandom(1)
  const steps = Math.round(until * 60)
  for (let i = 0; i < steps; i++) {
    emitBetween(em, duration, looping, i / 60, (i + 1) / 60, state, rng, (at) => { out.push(at) })
  }
  return out
}

describe('방출', () => {
  it('끝없는 버스트는 지속 시간 안에서만 — 0.1초 · 0.0333 간격 · 10개면 넷', () => {
    // `eb001_capture` tubu_add 그대로. 0.09999는 0.1보다 작아서 넷째도 터진다
    const em: EmissionModule = { m_Bursts: [{ time: 0, countCurve: { const: 10 }, cycleCount: 0, repeatInterval: 0.03333 }] }
    const got = times(em, 0.1, false, 1)
    expect(got.length).toBe(40)
    const distinct = [...new Set(got.map((t) => t.toFixed(5)))]
    expect(distinct).toEqual(['0.00000', '0.03333', '0.06666', '0.09999'])
  })

  it('cycleCount 1이면 한 번', () => {
    const em: EmissionModule = { m_Bursts: [{ time: 0, countCurve: { const: 8 }, cycleCount: 1, repeatInterval: 0.0333 }] }
    expect(times(em, 0.05, false, 1).length).toBe(8)
  })

  it('지속 시간 뒤에 오는 버스트는 안 터진다', () => {
    const em: EmissionModule = { m_Bursts: [{ time: 0.2, countCurve: { const: 3 }, cycleCount: 1 }] }
    expect(times(em, 0.1, false, 1).length).toBe(0)
  })

  it('초당 개수는 소수를 누적한다', () => {
    const em: EmissionModule = { rateOverTime: { const: 10 } }
    expect(times(em, 1, false, 2).length).toBe(10)
  })

  it('되풀이면 바퀴마다 버스트가 다시 선다', () => {
    // `flash_many_Child` — 0.05초 되풀이 · 0초 버스트 1 (간격 0.85는 바퀴보다 길다)
    const em: EmissionModule = { m_Bursts: [{ time: 0, countCurve: { const: 1 }, cycleCount: 0, repeatInterval: 0.85 }] }
    expect(times(em, 0.05, true, 0.5).length).toBe(10)
  })

  it('확률 0이면 안 터진다', () => {
    const em: EmissionModule = { m_Bursts: [{ time: 0, countCurve: { const: 5 }, cycleCount: 1, probability: 0 }] }
    expect(times(em, 1, false, 1).length).toBe(0)
  })

  it('죽을 때 부속 이미터는 버스트 수의 합', () => {
    const em: EmissionModule = { m_Bursts: [{ time: 0, countCurve: { const: 3 } }, { time: 0.5, countCurve: { const: 2 } }] }
    expect(deathBurstCount(em, new FxRandom(1))).toBe(5)
  })
})
