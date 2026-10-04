// 방출 모듈 — 언제 몇 개를 뿜는가 (유니티 `EmissionModule`).
//
// 시간 구간 [t0, t1)을 받아 그 안에 태어날 것을 센다. 같은 셈을 두 군데가 쓴다:
// 시스템 자신의 시간축, 그리고 「태어날 때」 부속 이미터가 부모 입자 **나이**를
// 시간축으로 삼을 때다. 그래서 상태(속도 누적)를 밖에 둔다.
//
// - 초당 개수(`rateOverTime`)는 소수점을 누적했다가 1이 차면 뿜는다
// - 버스트는 `time + k·repeatInterval` 시각마다 (k < cycleCount, 0이면 끝없이).
//   **구간이 끝나는 시각 그 자체는 안 넣는다** — 0.1초짜리 시스템이 0.0333 간격이면
//   0 · 0.0333 · 0.0667 · 0.09999에 터진다 (0.1은 이미 끝)
// - 되풀이(`looping`)면 지속 시간마다 버스트 셈이 처음으로 돌아간다
import { evalCurve, type FxRandom } from './curve'
import type { EmissionModule } from './schema'

/** 밖에 두는 상태 — 초당 개수의 소수점 */
export interface EmissionState {
  carry: number
}

/**
 * 뿜을 때마다 부른다.
 *
 * @param at 태어난 시각 (구간 시간축). 부르는 쪽이 `t1 - at`만큼 먼저 나이를 먹인다
 * @param index 버스트 안에서 몇 번째 (아니면 0)
 * @param count 버스트 크기 (아니면 1)
 */
type EmitSink = (at: number, index: number, count: number) => void

/** 이 구간 [t0, t1) 안에 태어날 것을 `sink`로 낸다. 시간은 재생 시작부터의 초 */
export function emitBetween(
  em: EmissionModule, duration: number, looping: boolean,
  t0: number, t1: number, state: EmissionState, rng: FxRandom, sink: EmitSink,
): void {
  if (t1 <= t0) return
  const dur = duration > 1e-6 ? duration : 1e-6
  if (!looping) {
    const end = Math.min(t1, dur)
    if (end > t0) segment(em, dur, 0, t0, end, state, rng, sink)
    return
  }
  // 되풀이: 지속 시간 경계에서 쪼갠다
  let a = t0
  let guard = 0
  while (a < t1 && guard++ < 64) {
    // 부동소수로 경계 바로 앞에 떨어져 한 바퀴를 놓치지 않게 아주 조금 너그럽게
    const loop = Math.floor(a / dur + 1e-9)
    const base = loop * dur
    const b = Math.min(t1, base + dur)
    segment(em, dur, base, a, b, state, rng, sink)
    a = b
  }
}

/** 한 바퀴 안의 구간. `base`는 이 바퀴가 시작한 시각 */
function segment(
  em: EmissionModule, dur: number, base: number, a: number, b: number,
  state: EmissionState, rng: FxRandom, sink: EmitSink,
): void {
  const la = a - base
  const lb = b - base
  // 초당 개수 — 곡선 가로축은 이 바퀴 안의 시간 비율
  const rate = evalCurve(em.rateOverTime, la / dur, rng.next(), 0)
  if (rate > 0) {
    state.carry += rate * (b - a)
    const n = Math.floor(state.carry)
    if (n > 0) {
      state.carry -= n
      // 구간 안에 고르게 흩는다 — 한 시각에 몰리면 줄무늬가 진다
      for (let i = 0; i < n; i++) sink(a + ((i + 1) / n) * (b - a) - 1e-9, 0, 1)
    }
  }
  const bursts = em.m_Bursts
  if (!bursts) return
  for (const burst of bursts) {
    const interval = burst.repeatInterval ?? 0
    const cycles = burst.cycleCount ?? 1
    const first = burst.time
    let kLo: number
    let kHi: number
    if (interval > 1e-6) {
      kLo = Math.max(0, Math.ceil((la - first) / interval - 1e-9))
      kHi = Math.ceil((lb - first) / interval - 1e-9) - 1
      if (cycles > 0) kHi = Math.min(kHi, cycles - 1)
    } else {
      kLo = 0
      kHi = first >= la && first < lb ? 0 : -1
    }
    for (let k = kLo; k <= kHi; k++) {
      const tau = first + k * interval
      if (tau < la - 1e-9 || tau >= lb) continue
      if ((burst.probability ?? 1) < 1 && rng.next() >= (burst.probability ?? 1)) continue
      const count = Math.max(0, Math.round(evalCurve(burst.countCurve, tau / dur, rng.next(), 30)))
      for (let i = 0; i < count; i++) sink(base + tau, i, count)
    }
  }
}

/** 죽을 때 부속 이미터: 버스트 개수만 한꺼번에 (유니티가 그렇게 쓴다) */
export function deathBurstCount(em: EmissionModule | undefined, rng: FxRandom): number {
  if (!em?.m_Bursts) return 0
  let n = 0
  for (const b of em.m_Bursts) {
    if ((b.probability ?? 1) < 1 && rng.next() >= (b.probability ?? 1)) continue
    n += Math.max(0, Math.round(evalCurve(b.countCurve, 0, rng.next(), 30)))
  }
  return n
}
