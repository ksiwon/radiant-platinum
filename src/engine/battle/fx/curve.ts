// 유니티 곡선 · 그라디언트 · 난수 (BATTLE_FX §4).
//
// 곡선은 `AnimationCurve`의 에르미트 보간이다 — 키 사이를 두 끝값과 두 기울기로
// 잇는다. 기울기가 무한이면(JSON에서는 `null`) 계단이다: 다음 키까지 앞 값을 쥔다.
// 곡선 밖은 양 끝 값으로 붙든다(유니티 입자 곡선은 늘 0~1 안에서 읽힌다).
import type { Gradient, Key, MinMaxCurve, MinMaxGradient, Rgba } from './schema'

/**
 * 결정적 난수 (mulberry32).
 *
 * ⚠️ **`Math.random`을 쓰지 않는다.** 같은 씨앗이면 같은 그림이어야 트레일러
 * 가상 시계(`tools/reels`)와 `/fxlab?t=`가 매번 같은 프레임을 낸다
 */
export class FxRandom {
  private s: number
  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9
  }
  /** [0, 1) */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }
  /** 정수 씨앗 하나 */
  seed(): number {
    return (this.next() * 4294967296) >>> 0
  }
}

/**
 * 입자 하나의 고정 난수에서 모듈마다 다른 난수를 뽑는다.
 *
 * 유니티는 모듈마다 입자의 「안정 난수」를 따로 쓴다 — 크기 곡선과 회전 곡선이 같은
 * 난수를 보면 큰 입자가 늘 빨리 돈다. 씨앗에 모듈 번호를 섞어 해시한다
 */
export function stableRandom(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 키 배열 하나를 `t`에서 읽는다 */
export function evalKeys(keys: readonly Key[] | undefined, t: number): number {
  if (!keys || keys.length === 0) return 0
  const first = keys[0]!
  if (keys.length === 1 || t <= first[0]) return first[1]
  const last = keys[keys.length - 1]!
  if (t >= last[0]) return last[1]
  let i = 0
  while (i < keys.length - 2 && t >= keys[i + 1]![0]) i++
  const a = keys[i]!
  const b = keys[i + 1]!
  const dt = b[0] - a[0]
  if (dt <= 0) return b[1]
  const out = a[3]
  const inn = b[2]
  // 무한 기울기 = 계단 (유니티 「Constant」 탄젠트)
  if (out === null || inn === null || !Number.isFinite(out) || !Number.isFinite(inn)) return a[1]
  const s = (t - a[0]) / dt
  const s2 = s * s
  const s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1
  const h10 = s3 - 2 * s2 + s
  const h01 = -2 * s3 + 3 * s2
  const h11 = s3 - s2
  return h00 * a[1] + h10 * dt * out + h01 * b[1] + h11 * dt * inn
}

/**
 * `MinMaxCurve`를 읽는다.
 *
 * @param t 곡선 가로축 (수명 비율 · 시스템 시간 비율)
 * @param r 이 입자의 고정 난수 [0,1). 두 곡선 · 두 상수 사이를 고른다
 */
export function evalCurve(c: MinMaxCurve | undefined, t: number, r: number, fallback = 0): number {
  if (!c) return fallback
  if (c.const !== undefined) return c.const
  if (c.randMin !== undefined || c.randMax !== undefined) {
    const lo = c.randMin ?? 0
    const hi = c.randMax ?? lo
    return lo + (hi - lo) * r
  }
  const k = c.scalar ?? 1
  if (c.curveMin || c.curveMax) {
    const lo = evalKeys(c.curveMin, t)
    const hi = evalKeys(c.curveMax, t)
    return (lo + (hi - lo) * r) * k
  }
  if (c.curve) return evalKeys(c.curve, t) * k
  return fallback
}

/** 곡선이 「늘 0」인가 — 모듈을 아예 건너뛸 수 있는지 본다 */
export function isZeroCurve(c: MinMaxCurve | undefined): boolean {
  if (!c) return true
  if (c.const !== undefined) return c.const === 0
  if (c.randMin !== undefined || c.randMax !== undefined) return (c.randMin ?? 0) === 0 && (c.randMax ?? 0) === 0
  if ((c.scalar ?? 1) === 0) return true
  const zero = (keys: readonly Key[] | undefined): boolean => !keys || keys.every((k) => k[1] === 0)
  return zero(c.curve) && zero(c.curveMin) && zero(c.curveMax)
}

/** 그라디언트를 `t`에서 읽어 `out`에 rgba로 적는다 */
export function evalGradient(g: Gradient, t: number, out: number[]): number[] {
  const fixed = g.mode === 'fixed'
  const ck = g.colorKeys
  const ak = g.alphaKeys
  if (ck.length === 0) {
    out[0] = 1; out[1] = 1; out[2] = 1
  } else {
    const [i, f] = locate(ck, t, fixed)
    const a = ck[i]!
    const b = ck[Math.min(i + 1, ck.length - 1)]!
    out[0] = a[1] + (b[1] - a[1]) * f
    out[1] = a[2] + (b[2] - a[2]) * f
    out[2] = a[3] + (b[3] - a[3]) * f
  }
  if (ak.length === 0) out[3] = 1
  else {
    const [i, f] = locate(ak, t, fixed)
    const a = ak[i]!
    const b = ak[Math.min(i + 1, ak.length - 1)]!
    out[3] = a[1] + (b[1] - a[1]) * f
  }
  return out
}

/**
 * 키 사이 어디인가. [앞 키 번호, 사이 비율].
 *
 * 「고정」 모드는 **그 시각 이후의 첫 키**의 값을 쥔다(유니티 `GradientMode.Fixed`)
 */
function locate(keys: readonly (readonly number[])[], t: number, fixed: boolean): [number, number] {
  const n = keys.length
  if (t <= keys[0]![0]) return [0, 0]
  if (t >= keys[n - 1]![0]) return [n - 1, 0]
  let i = 0
  while (i < n - 2 && t > keys[i + 1]![0]) i++
  const t0 = keys[i]![0]!
  const t1 = keys[i + 1]![0]!
  if (fixed) return [i + 1, 0]
  return [i, t1 > t0 ? (t - t0) / (t1 - t0) : 1]
}

const scratchA = [0, 0, 0, 0]
const scratchB = [0, 0, 0, 0]

/**
 * `MinMaxGradient`를 읽는다.
 *
 * @param t 그라디언트 가로축
 * @param r 이 입자의 고정 난수 — 두 색 · 두 그라디언트 사이, 또는 「그라디언트에서 무작위」의 자리
 */
export function evalColor(g: MinMaxGradient | undefined, t: number, r: number, out: number[]): number[] {
  if (!g) {
    out[0] = 1; out[1] = 1; out[2] = 1; out[3] = 1
    return out
  }
  if (g.const) return copy(g.const, out)
  if (g.gradient) return evalGradient(g.gradient, t, out)
  if (g.randColorMin || g.randColorMax) {
    const a = g.randColorMin ?? g.randColorMax!
    const b = g.randColorMax ?? a
    for (let i = 0; i < 4; i++) out[i] = a[i]! + (b[i]! - a[i]!) * r
    return out
  }
  if (g.randGradMin || g.randGradMax) {
    const a = evalGradient(g.randGradMin ?? g.randGradMax!, t, scratchA)
    const b = evalGradient(g.randGradMax ?? g.randGradMin!, t, scratchB)
    for (let i = 0; i < 4; i++) out[i] = a[i]! + (b[i]! - a[i]!) * r
    return out
  }
  if (g.randomFromGradient) return evalGradient(g.randomFromGradient, r, out)
  out[0] = 1; out[1] = 1; out[2] = 1; out[3] = 1
  return out
}

/** 시간에 따라 변하는 색인가 — 태어날 때 한 번 읽고 말지를 정한다 */
export function colorVaries(g: MinMaxGradient | undefined): boolean {
  return !!g && !!(g.gradient || g.randGradMin || g.randGradMax)
}

function copy(c: Rgba, out: number[]): number[] {
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = c[3]
  return out
}
