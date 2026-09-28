// 달콤한향기 (`ov5_021F0488`) — 날씨 · 덮개 · 기다림 · 조우를 원작 단계대로 밟는가
import { describe, expect, it } from 'vitest'
import { SWEET_SCENT_SCRIPT, SWEET_SCENT_SE, SweetScentRun, sweetScentBlocked, type SweetScentFrame } from './sweetScent'

function run(weather: number, hasWild: boolean, rate: boolean): SweetScentFrame[] {
  const r = new SweetScentRun({ weather, hasWild, tileHasRate: () => rate })
  const out: SweetScentFrame[] = []
  for (let f = 0; f < 500 && !r.done; f++) out.push(r.step())
  return out
}

describe('달콤한향기', () => {
  it('풀숲이면 분홍이 10/16까지 차고 22프레임을 기다린 뒤 조우한다', () => {
    const frames = run(0, true, true)
    const last = frames.at(-1)!
    expect(last.encounter).toBe(true)
    expect(Math.max(...frames.map((f) => f.tint))).toBe(10 / 16)
    // 소리는 덮기 시작하는 한 번
    expect(frames.filter((f) => f.se === SWEET_SCENT_SE)).toHaveLength(1)
    // 덮개가 다 찬 프레임부터 23프레임 뒤(22 → −1)에 조우한다
    const full = frames.findIndex((f) => f.tint === 10 / 16)
    expect(frames.length - 1 - full).toBeGreaterThanOrEqual(23)
    // 조우할 때 덮개는 아직 덮여 있다
    expect(last.tint).toBe(10 / 16)
  })

  it('출현률이 없는 칸이면 분홍을 걷고 「아무 일도 없었다」를 낸다', () => {
    const frames = run(0, true, false)
    expect(frames.some((f) => f.encounter)).toBe(false)
    expect(frames.filter((f) => f.script !== null).map((f) => f.script)).toEqual([SWEET_SCENT_SCRIPT.nothingHere])
    expect(frames.at(-1)!.tint).toBe(0)
  })

  it('야생이 없는 맵은 22프레임을 안 기다린다 — 3단을 한 프레임만 지난다', () => {
    const wild = run(0, true, false).length
    const none = run(0, false, false).length
    expect(wild - none).toBe(22)
  })

  it('비·흐림·안개면 덮지 않고 20프레임 뒤 「향기가 흩어졌다」', () => {
    for (const weather of [1, 2, 14, 16]) {
      expect(sweetScentBlocked(weather)).toBe(true)
      const frames = run(weather, true, true)
      expect(frames.every((f) => f.tint === 0)).toBe(true)
      expect(frames.filter((f) => f.script !== null).map((f) => f.script)).toEqual([SWEET_SCENT_SCRIPT.faded])
    }
    // 우박·맑음은 된다
    expect(sweetScentBlocked(11)).toBe(false)
    expect(sweetScentBlocked(0)).toBe(false)
  })

  it('날씨 23은 8/16까지만 칠한다', () => {
    expect(Math.max(...run(23, true, true).map((f) => f.tint))).toBe(8 / 16)
  })
})
