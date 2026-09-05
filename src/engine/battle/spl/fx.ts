// 고정소수와 난수 — 원작 `nitro/fx`와 `lib/spl/spl_random.h`.
//
// ⚠️ **정수로 둔다.** 입자 자료의 값이 전부 fx32(1.19.12)라, 실수로 바꿔 계산하면
// 원작과 비트로 못 맞댄다. 화면에 올릴 때 한 번만 나눈다.
//
// ⚠️ **곱이 안전한가.** `FX_MUL`은 두 fx32를 곱해 12비트를 내린다. 자바스크립트
// 수는 2⁵³까지 정확한데, 입자 자리·속도가 ±2²⁴(=4,096타일)를 넘지 않으므로
// 곱은 최대 2⁴⁸이다 — 안전하다. 그래도 곱한 값을 바로 `| 0`으로 접어서 s32
// 범위를 원작과 같이 유지한다.

/** fx32 한 칸 (1.19.12) */
export const FX32_ONE = 4096
/** fx32 소수 자릿수 */
const FX32_SHIFT = 12
/** 소수부 마스크 */
export const FX32_DEC_MASK = 0xfff
/** 0.5 */
export const FX32_HALF = 2048

/**
 * C의 `>>`는 음수에서 **내림**이다 (`Math.trunc`가 아니다).
 *
 * ⚠️ **이걸 틀리면 음수 자리에서만 1 LSB씩 어긋난다** — 화면에서는 안 보이고
 * 원작과 맞대면 그때 갈린다. 자바스크립트 `>>`는 32비트로 접으므로 큰 중간값에
 * 못 쓴다
 */
export const shr = (v: number, n: number): number => Math.floor(v / 2 ** n)

/** `FX_MUL` — fx32 × fx32 */
export function fxMul(a: number, b: number): number {
  return shr(a * b, FX32_SHIFT)
}

/** `FX_DIV` — fx32 ÷ fx32 */
export function fxDiv(a: number, b: number): number {
  return b === 0 ? 0 : Math.trunc((a * FX32_ONE) / b)
}

export type Vec = { x: number, y: number, z: number }

export const vec = (x = 0, y = 0, z = 0): Vec => ({ x, y, z })

/** `VEC_Normalize` — 길이를 1(FX32_ONE)로 */
export function normalize(v: Vec): void {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  if (len === 0) return
  v.x = Math.trunc((v.x * FX32_ONE) / len)
  v.y = Math.trunc((v.y * FX32_ONE) / len)
  v.z = Math.trunc((v.z * FX32_ONE) / len)
}

/** `VEC_DotProduct` */
export const dot = (a: Vec, b: Vec): number =>
  fxMul(a.x, b.x) + fxMul(a.y, b.y) + fxMul(a.z, b.z)

/** `VEC_CrossProduct` */
export function cross(a: Vec, b: Vec, out: Vec): void {
  const x = fxMul(a.y, b.z) - fxMul(a.z, b.y)
  const y = fxMul(a.z, b.x) - fxMul(a.x, b.z)
  const z = fxMul(a.x, b.y) - fxMul(a.y, b.x)
  out.x = x
  out.y = y
  out.z = z
}

/**
 * 각 표. 원작은 한 바퀴가 **0x10000**이고 `FX_SinIdx`가 4,096칸짜리 표를 본다
 * (`idx >> 4`로 줄여 찾는다).
 *
 * ⚠️ **여기만 원작과 비트가 다를 수 있다.** 원작 표는 롬에 박힌 값이고 우리는
 * `Math.sin`으로 만든다 — 같은 4,096칸으로 **양자화까지 맞췄으므로** 어긋나도
 * 1 LSB(1/4096)이다. 자리로 치면 한 타일의 0.02%라 화면에서 못 본다
 */
const TRIG_STEPS = 4096
const SIN = new Int32Array(TRIG_STEPS)
const COS = new Int32Array(TRIG_STEPS)
for (let i = 0; i < TRIG_STEPS; i++) {
  const a = (i * Math.PI * 2) / TRIG_STEPS
  SIN[i] = Math.round(Math.sin(a) * FX32_ONE)
  COS[i] = Math.round(Math.cos(a) * FX32_ONE)
}

/** `FX_SinIdx` — 한 바퀴가 0x10000 */
export const sinIdx = (idx: number): number => SIN[(idx >>> 4) & (TRIG_STEPS - 1)]!
/** `FX_CosIdx` */
export const cosIdx = (idx: number): number => COS[(idx >>> 4) & (TRIG_STEPS - 1)]!

/**
 * 난수 — 원작 그대로의 선형 합동법 (`SPLRandom_Next`).
 *
 * ⚠️ **씨앗을 우리가 쥔다.** 원작은 전역 하나(`gSPLRandomState`)를 온 게임이
 * 나눠 쓰는데, 우리는 이미터마다 따로 둔다 — 같은 기술을 두 번 쓰면 **같은
 * 그림**이 나와야 화면을 견줄 수 있다 (`.audit/splFrames.mjs`가 그 성질을 쓴다)
 */
export class SplRandom {
  private state: number

  constructor(seed = 0x1234_5678) {
    this.state = seed >>> 0
  }

  /**
   * `SPLRandom_Next` — `state = state * 0x5eedf715 + 0x1b0cb173`.
   *
   * ⚠️ **`Math.imul`이어야 한다.** 그냥 곱하면 2⁵³을 넘어 **하위 비트가**
   * 날아가는데, 하위 비트가 곧 다음 난수라 수열이 통째로 달라진다
   */
  next(): number {
    this.state = (Math.imul(this.state, 0x5eedf715) + 0x1b0cb173) >>> 0
    return this.state
  }

  /** `SPLRandom_U32(bits)` — [0, 2^bits) */
  u32(bits: number): number {
    return this.next() >>> (32 - bits)
  }

  /** `SPLRandom_S32(bits)` */
  s32(bits: number): number {
    return this.u32(bits) | 0
  }

  /** `SPLRandom_FX32(bits)` — 부호 있는 fx32로 본다 */
  fx32(bits: number): number {
    return (this.next() | 0) >> (32 - bits)
  }

  /** `SPLRandom_ScaledRangeFX32` — [num·(1−range), num) */
  scaledRange(num: number, range: number): number {
    return shr(num * (255 - shr(range * this.u32(8), 8)), 8)
  }

  /** `SPLRandom_DoubleScaledRangeFX32` */
  doubleScaledRange(num: number, range: number): number {
    return shr(num * (255 + range - shr(range * this.u32(8), 7)), 8)
  }

  /** `SPLRandom_RangeFX32` — [−num, num) */
  range(num: number): number {
    return shr(num * this.u32(9) - num * 256, 8)
  }

  /** `SPLRandom_BetweenFX32` — 정수 min·max 사이의 fx32 */
  between(min: number, max: number): number {
    return (max - min) * this.u32(12) + min * FX32_ONE
  }

  /** `SPLRandom_VecFx32` — 아무 방향의 단위 벡터 */
  unitVec(out: Vec): void {
    out.x = this.fx32(24)
    out.y = this.fx32(24)
    out.z = this.fx32(24)
    normalize(out)
  }

  /** `SPLRandom_VecFx32_XY` — xy 평면 위의 단위 벡터 */
  unitVecXY(out: Vec): void {
    out.x = this.fx32(24)
    out.y = this.fx32(24)
    out.z = 0
    normalize(out)
  }
}
