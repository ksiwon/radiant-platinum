// ASTC LDR 풀기 — 브라우저에서 (IMPORT.md §12)
//
// BDSP 인물 텍스처의 거의 전부가 ASTC다 (실측: `Characters` 아래 527장 중 526장이
// `ASTC_RGB_6x6`, 한 장이 `8x8`). BC만 풀어서는 사람이 한 명도 안 나온다.
//
// ASTC는 블록 하나가 자기 배치를 스스로 적는다 — 가중치 격자 크기도, 색 끝점
// 개수도, 양자화 단계도 블록마다 다르다. 그래서 "블록을 읽는다"가 아니라 "블록이
// 말하는 대로 읽는 법을 먼저 정한다"가 된다.
//
// ⚠️ **오라클은 `texture2ddecoder`다.** 무작위 128비트를 흔들어 픽셀까지 맞춘다
// (`astc.test.ts`). 진짜 텍스처만으로는 실제로 나오는 모드만 지나가고, 안 밟은
// 갈래가 게임 한복판에서 터진다.
//
// ⚠️ **HDR은 안 푼다.** BDSP가 쓰는 것은 `ASTC_RGB_*`(LDR)뿐이고, HDR 끝점 모드
// (2·3·7·11·14·15)는 색 계산이 통째로 다르다. 짐작으로 채우지 않고 세운다.

export class AstcError extends Error {
  constructor(message: string) { super(message); this.name = 'AstcError' }
}

// ── 정수열 부호화 (BISE) ─────────────────────────────────────────────────────
//
// 값 하나가 비트 몇 개로 안 떨어진다. 3진수(trit) 다섯 개를 8비트에, 5진수(quint)
// 셋을 7비트에 눌러 담고 나머지를 비트로 붙인다.

interface IseParams { bits: number, trits: number, quints: number }

/** 양자화 단계 0..20. 끝점은 21개를 다 쓰고 가중치는 앞 12개만 쓴다 */
const ISE: readonly IseParams[] = [
  { bits: 1, trits: 0, quints: 0 },  // 0..1
  { bits: 0, trits: 1, quints: 0 },  // 0..2
  { bits: 2, trits: 0, quints: 0 },  // 0..3
  { bits: 0, trits: 0, quints: 1 },  // 0..4
  { bits: 1, trits: 1, quints: 0 },  // 0..5
  { bits: 3, trits: 0, quints: 0 },  // 0..7
  { bits: 1, trits: 0, quints: 1 },  // 0..9
  { bits: 2, trits: 1, quints: 0 },  // 0..11
  { bits: 4, trits: 0, quints: 0 },  // 0..15
  { bits: 2, trits: 0, quints: 1 },  // 0..19
  { bits: 3, trits: 1, quints: 0 },  // 0..23
  { bits: 5, trits: 0, quints: 0 },  // 0..31
  { bits: 3, trits: 0, quints: 1 },  // 0..39
  { bits: 4, trits: 1, quints: 0 },  // 0..47
  { bits: 6, trits: 0, quints: 0 },  // 0..63
  { bits: 4, trits: 0, quints: 1 },  // 0..79
  { bits: 5, trits: 1, quints: 0 },  // 0..95
  { bits: 7, trits: 0, quints: 0 },  // 0..127
  { bits: 5, trits: 0, quints: 1 },  // 0..159
  { bits: 6, trits: 1, quints: 0 },  // 0..191
  { bits: 8, trits: 0, quints: 0 },  // 0..255
]

export const iseMax = (level: number): number => {
  const p = ISE[level]!
  return ((p.trits ? 3 : p.quints ? 5 : 1) << p.bits) - 1
}

/** 값 n개를 이 단계로 적으면 몇 비트인가 */
export function iseBitCount(n: number, level: number): number {
  const p = ISE[level]!
  if (p.trits) return n * p.bits + Math.ceil((n * 8) / 5)
  if (p.quints) return n * p.bits + Math.ceil((n * 7) / 3)
  return n * p.bits
}

/**
 * 8비트 → 3진수 다섯. 규격 C.2.12의 복호 절차 그대로다.
 *
 * ⚠️ **`C`를 거치는 두 단계 구조를 펴지 않는다.** 위 둘(t3·t4)과 아래 셋(t0..t2)이
 * 각각 "둘 다 2" 갈래를 따로 갖는다. 한 겹으로 줄이면 그 갈래가 사라진다
 */
export function tritsOf(t: number): [number, number, number, number, number] {
  let c: number
  let t3: number
  let t4: number
  if (((t >> 2) & 7) === 7) {
    c = (((t >> 5) & 7) << 2) | (t & 3)
    t3 = 2
    t4 = 2
  } else {
    c = t & 0x1f
    if (((t >> 5) & 3) === 3) { t4 = 2; t3 = (t >> 7) & 1 } else { t4 = (t >> 7) & 1; t3 = (t >> 5) & 3 }
  }
  let t0: number
  let t1: number
  let t2: number
  if ((c & 3) === 3) {
    t2 = 2
    t1 = (c >> 4) & 1
    t0 = (((c >> 3) & 1) << 1) | (((c >> 2) & 1) & ~((c >> 3) & 1) & 1)
  } else if (((c >> 2) & 3) === 3) {
    t2 = 2
    t1 = 2
    t0 = c & 3
  } else {
    t2 = (c >> 4) & 1
    t1 = (c >> 2) & 3
    t0 = ((c & 2)) | ((c & 1) & (~(c >> 1)) & 1)
  }
  return [t0, t1, t2, t3, t4]
}

/**
 * 7비트 → 5진수 셋.
 *
 * 셋 다 0..3이면 세 조각(3·2·2비트)에 그대로 담긴다. 4가 끼면 담을 자리가
 * 모자라서 낮은 조각이 **어느 자리가 4인가**를 대신 말한다:
 *
 *   · `m = 5` → 가운데가 4, 첫째는 가운데 조각으로 옮겨 간다
 *   · `m = 6·7` → 위 조각이 어느 짝이 4인지를 고른다
 *
 * ⚠️ **이 갈래를 규격 글로 옮겨 적지 않았다.** 세 번 틀렸고, 틀려도 색이 조금
 * 뭉개질 뿐이라 눈으로는 안 잡힌다. 표 128칸을 `texture2ddecoder`에서 그대로 읽어
 * 내 그 무늬를 적은 것이다 (`astc.test.ts`가 128칸을 다시 대조한다)
 */
export function quintsOf(q: number): [number, number, number] {
  const m = q & 7
  const a = (q >> 3) & 3
  const b = (q >> 5) & 3
  if (m < 5) return [m, a, b]
  if (m === 5) return [a, 4, b]
  const hi = m & 1
  if (b === 0) return hi ? [4, 4, 4] : [4, 4, a]
  if (b === 1) return hi ? [a, 4, 4] : [4, a, 4]
  return [(b === 2 ? 2 : 0) + hi, a, 4]
}

const TRIT_TABLE = new Uint8Array(256 * 5)
for (let t = 0; t < 256; t++) TRIT_TABLE.set(tritsOf(t), t * 5)
const QUINT_TABLE = new Uint8Array(128 * 3)
for (let q = 0; q < 128; q++) QUINT_TABLE.set(quintsOf(q), q * 3)

/** 3진수 묶음(다섯 값)에서 8비트가 흩어지는 자리. 값 사이에 끼워 넣는다 */
const TRIT_CHUNKS = [2, 2, 1, 2, 1]
const QUINT_CHUNKS = [3, 2, 2]

class Bits {
  private readonly src: Uint8Array
  at = 0
  constructor(src: Uint8Array, at = 0) { this.src = src; this.at = at }
  read(n: number): number {
    let out = 0
    for (let i = 0; i < n; i++) {
      out |= ((this.src[this.at >> 3]! >> (this.at & 7)) & 1) << i
      this.at++
    }
    return out
  }
}

/** 값 n개를 읽는다 */
function readIse(bits: Bits, n: number, level: number): Uint8Array {
  const p = ISE[level]!
  const out = new Uint8Array(n)
  if (p.trits) {
    for (let base = 0; base < n; base += 5) {
      let packed = 0
      let got = 0
      const low: number[] = []
      for (let i = 0; i < 5; i++) {
        if (base + i < n) low.push(bits.read(p.bits))
        else low.push(0)
        // 묶음이 잘려도 남은 3진수 비트는 읽지 않는다 — 길이 셈과 맞아야 한다
        if (base + i < n) { packed |= bits.read(TRIT_CHUNKS[i]!) << got }
        got += TRIT_CHUNKS[i]!
      }
      const t = TRIT_TABLE.subarray(packed * 5, packed * 5 + 5)
      for (let i = 0; i < 5 && base + i < n; i++) out[base + i] = (t[i]! << p.bits) | low[i]!
    }
    return out
  }
  if (p.quints) {
    for (let base = 0; base < n; base += 3) {
      let packed = 0
      let got = 0
      const low: number[] = []
      for (let i = 0; i < 3; i++) {
        low.push(base + i < n ? bits.read(p.bits) : 0)
        if (base + i < n) packed |= bits.read(QUINT_CHUNKS[i]!) << got
        got += QUINT_CHUNKS[i]!
      }
      const q = QUINT_TABLE.subarray(packed * 3, packed * 3 + 3)
      for (let i = 0; i < 3 && base + i < n; i++) out[base + i] = (q[i]! << p.bits) | low[i]!
    }
    return out
  }
  for (let i = 0; i < n; i++) out[i] = bits.read(p.bits)
  return out
}

// ── 역양자화 ─────────────────────────────────────────────────────────────────
//
// 값 → 0..255. 사다리는 고르지만 **차례가 뒤섞여 있다** — v가 커도 색이 커지지
// 않는다. 규격이 그렇게 정했다(하드웨어에서 나눗셈을 안 하려고):
//
//     u = ((D·C + B) ^ A) 를 9비트로 보고, A의 최상위 비트를 씌운 뒤 2비트 내린다
//
// A는 최하위 비트를 아홉 번 되풀이한 것이라, 그 비트가 서면 사다리가 통째로
// 뒤집힌다. C와 B는 (3진수냐 5진수냐, 비트 몇 개냐)로 정해진다.

/** (3진수/5진수, 비트수) → C. 사다리 한 칸의 9비트 크기다 */
const STEP_C: Readonly<Record<string, number>> = {
  t1: 204, t2: 93, t3: 44, t4: 22, t5: 11, t6: 5,
  q1: 113, q2: 54, q3: 26, q4: 13, q5: 6,
}

/**
 * (3진수/5진수, 비트수) → 최하위 비트 위 비트들이 더하는 값.
 *
 * 규격은 이것을 9비트 되풀이 무늬로 적는다 (`dcb000dcb` 같은 것). 여기서는 그
 * 무늬가 만드는 **비트별 몫**으로 둔다 — 자리 하나가 몇을 더하는가. 무늬를 글자로
 * 옮겨 적으면 옮겨 적다 틀리고, 틀린 것이 색 한두 칸 차이라 눈에 안 보인다.
 * 값은 `astc.test.ts`가 오라클과 맞춰 확인한다
 */
const STEP_B: Readonly<Record<string, readonly number[]>> = {
  t1: [], t2: [278], t3: [133, 266], t4: [64, 130, 260], t5: [32, 64, 129, 258],
  t6: [16, 32, 64, 128, 257],
  q1: [], q2: [268], q3: [130, 260], q4: [64, 129, 258], q5: [32, 64, 128, 256],
}

const UNQUANT: Uint8Array[] = ISE.map((p, level) => {
  const n = iseMax(level) + 1
  const out = new Uint8Array(n)
  if (!p.trits && !p.quints) {
    // 비트만 쓰는 단계는 되풀이로 8비트를 채운다. 1비트면 0/255, 8비트면 그대로
    for (let v = 0; v < n; v++) {
      let x = 0
      for (let at = 8; at > 0; at -= p.bits) x |= at >= p.bits ? v << (at - p.bits) : v >> (p.bits - at)
      out[v] = x & 0xff
    }
    return out
  }
  if (p.bits === 0) {
    // 비트가 없으면 뒤집을 최하위 비트도 없다. 사다리를 그냥 고르게 편다
    for (let v = 0; v < n; v++) out[v] = Math.round((v * 255) / (n - 1))
    return out
  }
  const key = (p.trits ? 't' : 'q') + String(p.bits)
  const c = STEP_C[key]
  const b = STEP_B[key]
  if (c === undefined || b === undefined) throw new AstcError(`역양자화 표에 ${key}가 없다`)
  for (let v = 0; v < n; v++) {
    const low = v & ((1 << p.bits) - 1)
    const d = v >> p.bits
    const a = (low & 1) ? 0x1ff : 0
    let bs = 0
    for (let i = 1; i < p.bits; i++) if ((low >> i) & 1) bs += b[i - 1]!
    let u = (d * c + bs) & 0x1ff
    u ^= a
    out[v] = ((a & 0x80) | (u >> 2)) & 0xff
  }
  return out
})

/**
 * 가중치 역양자화 0..64. 규격이 표로 싣는 자리다 (C.2.15).
 *
 * ⚠️ **색 표를 줄여서 만들면 안 된다.** 거의 다 맞다가 단계 7·9에서 여덟 칸이
 * 1씩 어긋난다 — 색과 가중치는 사다리 칸 수가 달라서 반올림이 다른 자리에서
 * 떨어진다. 그 1이 색으로는 4가 되고, 그림 전체가 아니라 **가장자리만** 미끄러져
 * 눈으로는 안 잡힌다. 142칸을 그대로 싣는다 (`astc.test.ts`가 다시 잰다)
 */
const UNQUANT_WEIGHT: Uint8Array[] = [
  [0, 64],
  [0, 32, 64],
  [0, 21, 43, 64],
  [0, 16, 32, 48, 64],
  [0, 64, 12, 52, 25, 39],
  [0, 9, 18, 27, 37, 46, 55, 64],
  [0, 64, 7, 57, 14, 50, 21, 43, 28, 36],
  [0, 64, 17, 47, 5, 59, 23, 41, 11, 53, 28, 36],
  [0, 4, 8, 12, 17, 21, 25, 29, 35, 39, 43, 47, 52, 56, 60, 64],
  [0, 64, 16, 48, 3, 61, 19, 45, 6, 58, 23, 41, 9, 55, 26, 38, 13, 51, 29, 35],
  [0, 64, 8, 56, 16, 48, 24, 40, 2, 62, 11, 53, 19, 45, 27, 37, 5, 59, 13, 51, 22, 42, 30, 34],
  [
    0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30,
    34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64,
  ],
].map((t) => Uint8Array.from(t))

/** 조사 도구용: 블록의 어느 자리에서 값 n개를 읽는다 */
export const readIseAt = (src: Uint8Array, at: number, n: number, level: number): Uint8Array =>
  readIse(new Bits(src, at), n, level)

/** 단계 하나의 (비트, 3진수, 5진수). 조사 도구가 쓴다 */
export const iseInfo = (level: number): IseParams => ISE[level]!
/** 단계 하나의 역양자화 표. 조사 도구와 시험이 쓴다 */
export const unquantTable = (level: number): Uint8Array => UNQUANT[level]!
/** 가중치 단계 하나의 역양자화 표 */
export const weightTable = (level: number): Uint8Array => UNQUANT_WEIGHT[level]!

// ── 블록 모드 ────────────────────────────────────────────────────────────────

interface BlockMode {
  weightsX: number
  weightsY: number
  dualPlane: boolean
  /** 가중치 양자화 단계 (0..11) */
  quant: number
}

/** 규격 표 C.2.8. 못 읽는 자리는 null — 짐작으로 채우지 않는다 */
export function decodeBlockMode(mode: number): BlockMode | null {
  let base = (mode >> 4) & 1
  let high = (mode >> 9) & 1
  let dual = (mode >> 10) & 1
  const a = (mode >> 5) & 3
  let x: number
  let y: number
  if ((mode & 3) !== 0) {
    base |= (mode & 3) << 1
    let b = (mode >> 7) & 3
    switch ((mode >> 2) & 3) {
      case 0: x = b + 4; y = a + 2; break
      case 1: x = b + 8; y = a + 2; break
      case 2: x = a + 2; y = b + 8; break
      default:
        b &= 1
        if (mode & 0x100) { x = b + 2; y = a + 2 } else { x = a + 2; y = b + 6 }
    }
  } else {
    base |= ((mode >> 2) & 3) << 1
    if (((mode >> 2) & 3) === 0) return null
    const b = (mode >> 9) & 3
    switch ((mode >> 7) & 3) {
      case 0: x = 12; y = a + 2; break
      case 1: x = a + 2; y = 12; break
      case 2: x = a + 6; y = b + 6; dual = 0; high = 0; break
      default:
        if (((mode >> 5) & 3) === 0) { x = 6; y = 10 } else if (((mode >> 5) & 3) === 1) { x = 10; y = 6 } else return null
    }
  }
  const quant = base - 2 + high * 6
  if (quant < 0 || quant > 11) return null
  return { weightsX: x, weightsY: y, dualPlane: dual !== 0, quant }
}

// ── 나눔 무늬 ────────────────────────────────────────────────────────────────
//
// 부분이 둘 이상이면 어느 픽셀이 어느 부분인지를 **표가 아니라 해시로** 정한다.
// 1024가지 씨앗 × 부분 수마다 무늬가 다르고, 표로 실으면 몇 메가가 된다

function hash52(x: number): number {
  let v = x >>> 0
  v ^= v >>> 15
  v = (v - (v << 17)) >>> 0
  v = (v + (v << 7)) >>> 0
  v = (v + (v << 4)) >>> 0
  v ^= v >>> 5
  v = (v + (v << 16)) >>> 0
  v ^= v >>> 7
  v ^= v >>> 3
  v ^= v << 6
  v = v >>> 0
  v ^= v >>> 17
  return v >>> 0
}

export function partitionOf(
  seed: number, x: number, y: number, count: number, small: boolean,
): number {
  let px = x
  let py = y
  if (small) { px <<= 1; py <<= 1 }
  const rnum = hash52((seed + (count - 1) * 1024) >>> 0)
  // 씨앗 여덟 개를 네 비트씩 떼어 제곱한다. ⚠️ 규격에는 열둘이지만 뒤 넷은 z에만
  // 곱해지고 2D 텍스처는 z가 0이다 — 여기 두면 안 쓰는 값이 남는다
  const s: number[] = []
  for (let i = 0; i < 8; i++) { const v = (rnum >>> (i * 4)) & 0xf; s.push(v * v) }
  let sh1: number
  let sh2: number
  if (seed & 1) { sh1 = (seed & 2) ? 4 : 5; sh2 = count === 3 ? 6 : 5 } else { sh1 = count === 3 ? 6 : 5; sh2 = (seed & 2) ? 4 : 5 }
  s[0] >>= sh1; s[1] >>= sh2; s[2] >>= sh1; s[3] >>= sh2
  s[4] >>= sh1; s[5] >>= sh2; s[6] >>= sh1; s[7] >>= sh2
  const a = (s[0]! * px + s[1]! * py + (rnum >>> 14)) & 0x3f
  const b = (s[2]! * px + s[3]! * py + (rnum >>> 10)) & 0x3f
  const c = count < 3 ? 0 : (s[4]! * px + s[5]! * py + (rnum >>> 6)) & 0x3f
  const d = count < 4 ? 0 : (s[6]! * px + s[7]! * py + (rnum >>> 2)) & 0x3f
  if (a >= b && a >= c && a >= d) return 0
  if (b >= c && b >= d) return 1
  if (c >= d) return 2
  return 3
}

// ── 끝점 ─────────────────────────────────────────────────────────────────────

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)

/** 파랑 당김. r·g를 b 쪽으로 반씩 끌어 온다 */
function blueContract(e: number[]): void {
  e[0] = (e[0]! + e[2]!) >> 1
  e[1] = (e[1]! + e[2]!) >> 1
}

/**
 * 차이 쪽의 맨 위 비트를 바탕 쪽으로 옮기고, 남은 여섯 비트를 부호 있는 값으로 본다.
 *
 * ⚠️ **방향을 뒤집으면 안 된다.** 옮겨 가는 비트는 *차이*의 8번 비트고 받는 쪽이
 * *바탕*이다. 거꾸로 하면 바탕이 두 배로 밝아지고 차이가 엉뚱한 부호가 된다
 */
function bitTransfer(v: number[], base: number, delta: number): void {
  v[base] = (v[base]! >> 1) | (v[delta]! & 0x80)
  v[delta] = (v[delta]! >> 1) & 0x3f
  if (v[delta]! & 0x20) v[delta] = v[delta]! - 0x40
}

/** HDR 끝점 모드 — 우리가 안 푸는 것 */
const HDR_MODES = new Set([2, 3, 7, 11, 14, 15])

/**
 * 끝점 모드 하나를 두 색으로 편다.
 *
 * ⚠️ **파랑 당김이 있는 모드는 두 끝을 바꿔 치기도 한다.** 안 바꾸면 그늘과 빛이
 * 뒤집히고, 그 차이는 무늬가 아니라 명암이라 "왠지 이상하다"로만 보인다
 */
function endpointsOf(cem: number, v: number[], out0: number[], out1: number[]): void {
  switch (cem) {
    case 0:
      out0[0] = out0[1] = out0[2] = v[0]!; out0[3] = 255
      out1[0] = out1[1] = out1[2] = v[1]!; out1[3] = 255
      return
    case 1: {
      const l0 = (v[0]! >> 2) | (v[1]! & 0xc0)
      const l1 = Math.min(255, l0 + (v[1]! & 0x3f))
      out0[0] = out0[1] = out0[2] = l0; out0[3] = 255
      out1[0] = out1[1] = out1[2] = l1; out1[3] = 255
      return
    }
    case 4:
      out0[0] = out0[1] = out0[2] = v[0]!; out0[3] = v[2]!
      out1[0] = out1[1] = out1[2] = v[1]!; out1[3] = v[3]!
      return
    case 5: {
      const w = v.slice()
      bitTransfer(w, 0, 1)
      bitTransfer(w, 2, 3)
      out0[0] = out0[1] = out0[2] = clamp(w[0]!); out0[3] = clamp(w[2]!)
      out1[0] = out1[1] = out1[2] = clamp(w[0]! + w[1]!); out1[3] = clamp(w[2]! + w[3]!)
      return
    }
    case 6:
      out1[0] = v[0]!; out1[1] = v[1]!; out1[2] = v[2]!; out1[3] = 255
      out0[0] = (v[0]! * v[3]!) >> 8
      out0[1] = (v[1]! * v[3]!) >> 8
      out0[2] = (v[2]! * v[3]!) >> 8
      out0[3] = 255
      return
    case 8: case 12: {
      const s0 = v[0]! + v[2]! + v[4]!
      const s1 = v[1]! + v[3]! + v[5]!
      const a0 = cem === 12 ? v[6]! : 255
      const a1 = cem === 12 ? v[7]! : 255
      if (s1 >= s0) {
        out0[0] = v[0]!; out0[1] = v[2]!; out0[2] = v[4]!; out0[3] = a0
        out1[0] = v[1]!; out1[1] = v[3]!; out1[2] = v[5]!; out1[3] = a1
      } else {
        out0[0] = v[1]!; out0[1] = v[3]!; out0[2] = v[5]!; out0[3] = a1
        out1[0] = v[0]!; out1[1] = v[2]!; out1[2] = v[4]!; out1[3] = a0
        blueContract(out0)
        blueContract(out1)
      }
      return
    }
    case 9: case 13: {
      const w = v.slice()
      bitTransfer(w, 0, 1)
      bitTransfer(w, 2, 3)
      bitTransfer(w, 4, 5)
      let a0 = 255
      let a1 = 255
      if (cem === 13) {
        bitTransfer(w, 6, 7)
        a0 = w[6]!
        a1 = w[6]! + w[7]!
      }
      // ⚠️ **자르는 것은 맨 끝이다.** 파랑 당김을 자른 값에 걸면 범위를 넘은 쪽이
      // 먼저 눌려서 당긴 결과가 달라진다 — 200개 중 열 개쯤에서만 갈린다
      const e0 = [w[0]!, w[2]!, w[4]!, a0]
      const e1 = [w[0]! + w[1]!, w[2]! + w[3]!, w[4]! + w[5]!, a1]
      if ((w[1]! + w[3]! + w[5]!) >= 0) {
        out0.splice(0, 4, ...e0.map(clamp))
        out1.splice(0, 4, ...e1.map(clamp))
      } else {
        blueContract(e0)
        blueContract(e1)
        out0.splice(0, 4, ...e1.map(clamp))
        out1.splice(0, 4, ...e0.map(clamp))
      }
      return
    }
    case 10:
      out1[0] = v[0]!; out1[1] = v[1]!; out1[2] = v[2]!; out1[3] = v[5]!
      out0[0] = (v[0]! * v[3]!) >> 8
      out0[1] = (v[1]! * v[3]!) >> 8
      out0[2] = (v[2]! * v[3]!) >> 8
      out0[3] = v[4]!
      return
    default:
      throw new AstcError(`끝점 모드 ${String(cem)}은 아직 안 푼다`)
  }
}

/** 끝점 모드가 값을 몇 개 쓰는가 */
const cemValues = (cem: number): number => (((cem >> 2) + 1) * 2)

// ── 블록 하나 ────────────────────────────────────────────────────────────────

const ERROR_COLOR = 0xffff00ff  // 규격이 정한 오류색: 불투명 자홍

const rgba = (r: number, g: number, b: number, a: number): number =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0

/** 위쪽 가중치 자료는 비트를 뒤집어 적혀 있다 */
function reverseBits(src: Uint8Array, at: number): Uint8Array {
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    let b = src[at + 15 - i]!
    b = ((b & 0xf0) >> 4) | ((b & 0x0f) << 4)
    b = ((b & 0xcc) >> 2) | ((b & 0x33) << 2)
    b = ((b & 0xaa) >> 1) | ((b & 0x55) << 1)
    out[i] = b
  }
  return out
}

/**
 * 가장 큰 양자화 단계를 고른다 — 남은 비트에 값 n개가 들어가는 한도.
 *
 * ⚠️ **비트가 0인 단계(1·3)는 끝점에 못 쓴다.** 역양자화가 최하위 비트로 사다리를
 * 뒤집는데 그 비트가 없다. 가중치는 자기 표를 따로 들고 있어서 쓴다. 이 둘을
 * 빼지 않으면 실제 텍스처의 0.2%가 한 단계 위로 읽혀 색이 뭉개진다
 */
export function fitQuant(n: number, bits: number): number {
  for (let level = 20; level >= 0; level--) {
    if (ISE[level]!.bits === 0) continue
    if (iseBitCount(n, level) <= bits) return level
  }
  return -1
}

export interface AstcBlockInfo { hdr: boolean }

/**
 * 블록 하나를 4채널 색 `bw × bh`개로 편다.
 *
 * `out`은 블록 픽셀을 줄 단위로 담는다. HDR 끝점이 나오면 `info.hdr`를 세우고
 * 오류색으로 채운다 — **던지지 않는다**. 텍스처 한 장에 한 블록만 HDR이어도
 * 변환이 통째로 서면 안 되고, 대신 부른 쪽이 그 사실을 알아야 한다
 */
export function decodeAstcBlock(
  src: Uint8Array, at: number, bw: number, bh: number, out: Uint32Array, info?: AstcBlockInfo,
): void {
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength)
  const head = view.getUint16(at, true)

  // 한 색으로 찬 블록 (void extent)
  if ((head & 0x1ff) === 0x1fc) {
    if ((head >> 9) & 1) {  // HDR
      if (info) info.hdr = true
      out.fill(ERROR_COLOR)
      return
    }
    const r = view.getUint16(at + 8, true)
    const g = view.getUint16(at + 10, true)
    const b = view.getUint16(at + 12, true)
    const a = view.getUint16(at + 14, true)
    out.fill(rgba(r >> 8, g >> 8, b >> 8, a >> 8))
    return
  }

  const mode = decodeBlockMode(head & 0x7ff)
  if (!mode) { out.fill(ERROR_COLOR); return }
  const { weightsX: wx, weightsY: wy, dualPlane: dual, quant: wq } = mode
  if (wx > bw || wy > bh) { out.fill(ERROR_COLOR); return }
  const weightCount = wx * wy * (dual ? 2 : 1)
  if (weightCount > 64) { out.fill(ERROR_COLOR); return }
  const weightBits = iseBitCount(weightCount, wq)
  if (weightBits < 24 || weightBits > 96) { out.fill(ERROR_COLOR); return }

  const bits = new Bits(src.subarray(at, at + 16), 11)
  const partitions = bits.read(2) + 1
  if (partitions > 4) { out.fill(ERROR_COLOR); return }

  const cems = [0, 0, 0, 0]
  let extraCemBits = 0
  let seed = 0
  if (partitions === 1) {
    cems[0] = bits.read(4)
  } else {
    seed = bits.read(10)
    let encoded = bits.read(6)
    if ((encoded & 3) === 0) {
      cems.fill((encoded >> 2) & 0xf)
    } else {
      extraCemBits = 3 * partitions - 4
      const below = new Bits(src.subarray(at, at + 16), 128 - weightBits - extraCemBits)
      encoded |= below.read(extraCemBits) << 6
      const baseClass = (encoded & 3) - 1
      let bit = 2
      const cls: number[] = []
      for (let i = 0; i < partitions; i++) { cls.push((encoded >> bit) & 1); bit++ }
      for (let i = 0; i < partitions; i++) {
        cems[i] = ((baseClass + cls[i]!) << 2) | ((encoded >> bit) & 3)
        bit += 2
      }
    }
  }

  let valueCount = 0
  for (let i = 0; i < partitions; i++) {
    if (HDR_MODES.has(cems[i]!)) {
      if (info) info.hdr = true
      out.fill(ERROR_COLOR)
      return
    }
    valueCount += cemValues(cems[i]!)
  }
  if (valueCount > 18) { out.fill(ERROR_COLOR); return }

  const configBits = partitions === 1 ? 17 : 29
  const colorBits = 128 - weightBits - extraCemBits - configBits - (dual ? 2 : 0)
  if (colorBits < 1) { out.fill(ERROR_COLOR); return }
  const cq = fitQuant(valueCount, colorBits)
  if (cq < 0) { out.fill(ERROR_COLOR); return }

  const colorRaw = readIse(new Bits(src.subarray(at, at + 16), configBits), valueCount, cq)
  const unq = UNQUANT[cq]!
  const values: number[] = []
  for (let i = 0; i < valueCount; i++) values.push(unq[colorRaw[i]!]!)

  const e0: number[][] = []
  const e1: number[][] = []
  let take = 0
  for (let i = 0; i < partitions; i++) {
    const n = cemValues(cems[i]!)
    const a: number[] = [0, 0, 0, 255]
    const b: number[] = [0, 0, 0, 255]
    endpointsOf(cems[i]!, values.slice(take, take + n), a, b)
    e0.push(a)
    e1.push(b)
    take += n
  }

  let plane2 = -1
  if (dual) {
    const sel = new Bits(src.subarray(at, at + 16), 128 - weightBits - extraCemBits - 2)
    plane2 = sel.read(2)
  }

  // 가중치는 위에서부터 거꾸로 적혀 있다
  const rev = reverseBits(src, at)
  const wRaw = readIse(new Bits(rev, 0), weightCount, wq)
  const wUnq = UNQUANT_WEIGHT[wq]!
  const grid = new Uint8Array(weightCount)
  for (let i = 0; i < weightCount; i++) grid[i] = wUnq[wRaw[i]!]!

  // 격자를 블록 크기로 늘린다 (규격 C.2.18의 이중선형)
  const ds = Math.floor((1024 + bw / 2) / (bw - 1))
  const dt = Math.floor((1024 + bh / 2) / (bh - 1))
  const small = bw * bh < 31
  const planes = dual ? 2 : 1

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const gs = (ds * x * (wx - 1) + 32) >> 6
      const gt = (dt * y * (wy - 1) + 32) >> 6
      const js = gs >> 4
      const fs = gs & 0xf
      const jt = gt >> 4
      const ft = gt & 0xf
      const w11 = (fs * ft + 8) >> 4
      const w10 = ft - w11
      const w01 = fs - w11
      const w00 = 16 - fs - ft + w11
      const at00 = (jt * wx + js) * planes
      const right = js + 1 < wx ? planes : 0
      const down = jt + 1 < wy ? wx * planes : 0
      const p = partitions === 1 ? 0 : partitionOf(seed, x, y, partitions, small)
      const a = e0[p]!
      const b = e1[p]!
      const c: number[] = [0, 0, 0, 0]
      for (let plane = 0; plane < planes; plane++) {
        const g00 = grid[at00 + plane]!
        const g01 = grid[at00 + right + plane]!
        const g10 = grid[at00 + down + plane]!
        const g11 = grid[at00 + right + down + plane]!
        const w = (w00 * g00 + w01 * g01 + w10 * g10 + w11 * g11 + 8) >> 4
        for (let ch = 0; ch < 4; ch++) {
          const usesThis = dual ? ((ch === plane2) === (plane === 1)) : true
          if (!usesThis) continue
          const c0 = a[ch]! * 257
          const c1 = b[ch]! * 257
          c[ch] = (((c0 * (64 - w) + c1 * w + 32) >> 6) * 255 + 32768) >> 16
        }
      }
      out[y * bw + x] = rgba(c[0]!, c[1]!, c[2]!, c[3]!)
    }
  }
}

/** ASTC 텍스처 한 장을 RGBA8로 편다 */
export function decodeAstc(
  src: Uint8Array, width: number, height: number, bw: number, bh: number,
): { pixels: Uint8Array, hdrBlocks: number } {
  const cols = Math.ceil(width / bw)
  const rows = Math.ceil(height / bh)
  const need = cols * rows * 16
  if (src.byteLength < need) {
    throw new AstcError(`ASTC 자료가 모자란다 (${String(src.byteLength)} < ${String(need)})`)
  }
  const out = new Uint8Array(width * height * 4)
  const words = new Uint32Array(out.buffer)
  const block = new Uint32Array(bw * bh)
  const info: AstcBlockInfo = { hdr: false }
  let hdrBlocks = 0
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      info.hdr = false
      decodeAstcBlock(src, (by * cols + bx) * 16, bw, bh, block, info)
      if (info.hdr) hdrBlocks++
      for (let y = 0; y < bh; y++) {
        const py = by * bh + y
        if (py >= height) break
        for (let x = 0; x < bw; x++) {
          const px = bx * bw + x
          if (px >= width) break
          words[py * width + px] = block[y * bw + x]!
        }
      }
    }
  }
  return { pixels: out, hdrBlocks }
}
