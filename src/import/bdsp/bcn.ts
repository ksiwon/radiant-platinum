// BC (DXT) 블록 압축 풀기 — 브라우저에서 (IMPORT.md §12)
//
// BDSP 텍스처가 실제로 쓰는 것만 넣는다: BC1(DXT1) · BC3(DXT5) · BC4 · BC5 · BC7.
// 나머지 ASTC는 `astc.ts`에 있다.
//
// ⚠️ **오라클은 `texture2ddecoder`다** (UnityPy가 부르는 그것). 픽셀 하나라도
// 다르면 우리가 틀린 것으로 본다 — `texture.test.ts`가 진짜 번들로 대조한다.
// 특히 BC1의 c0 ≤ c1 갈래는 "3색 + 투명"이고, BC3 안에 든 색 블록은 **언제나**
// 4색이다. 이 둘을 같은 함수로 처리하면 알파가 있는 텍스처가 조용히 뚫린다.

export class BlockError extends Error {
  constructor(message: string) { super(message); this.name = 'BlockError' }
}

/** RGBA8 한 픽셀을 u32(리틀엔디언 ABGR)로. `Uint32Array`에 그대로 넣는다 */
const rgba = (r: number, g: number, b: number, a: number): number =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0

/** 565 → 888. 상위 비트를 아래로 되풀이해 채운다(0x1f → 0xff가 되게) */
function color565(c: number): [number, number, number] {
  const r = (c >> 11) & 0x1f
  const g = (c >> 5) & 0x3f
  const b = c & 0x1f
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]
}

/**
 * BC1 색 블록 4색을 푼다.
 *
 * `threeColor`가 참이면 c0 ≤ c1일 때 3색 + 검정으로 푼다 (BC1 단독).
 *
 * ⚠️ **넷째 색은 검정이지 투명이 아니다.** 하드웨어 BC1_UNORM은 거기서 알파 0을
 * 주지만 Unity의 `DXT1`은 알파 없는 형식이고(알파가 있으면 `DXT5`를 쓴다) UnityPy가
 * 부르는 디코더도 255를 준다. 여기서 0을 주면 게임에 구멍이 뚫린다.
 *
 * ⚠️ BC3 안에 든 색 블록은 규격상 **언제나 4색**이다 — 알파를 따로 들고 있어
 * 3색 갈래가 필요 없다. 이 자리를 BC1과 한 갈래로 묶으면 c0 ≤ c1인 DXT5 블록이
 * 검정이 된다 (`bcn.test.ts`의 "규격이 갈리는 자리" 참조)
 */
function bc1Colors(c0: number, c1: number, threeColor: boolean, out: Uint32Array): void {
  const [r0, g0, b0] = color565(c0)
  const [r1, g1, b1] = color565(c1)
  out[0] = rgba(r0, g0, b0, 255)
  out[1] = rgba(r1, g1, b1, 255)
  if (threeColor && c0 <= c1) {
    out[2] = rgba((r0 + r1) >> 1, (g0 + g1) >> 1, (b0 + b1) >> 1, 255)
    out[3] = rgba(0, 0, 0, 255)
    return
  }
  out[2] = rgba(
    (r0 * 2 + r1) / 3 | 0, (g0 * 2 + g1) / 3 | 0, (b0 * 2 + b1) / 3 | 0, 255,
  )
  out[3] = rgba(
    (r0 + r1 * 2) / 3 | 0, (g0 + g1 * 2) / 3 | 0, (b0 + b1 * 2) / 3 | 0, 255,
  )
}

/** BC4 채널 블록 8B → 4×4 값 16개 */
function bc4Block(src: Uint8Array, at: number, out: Uint8Array): void {
  const a0 = src[at]!
  const a1 = src[at + 1]!
  const table = new Uint8Array(8)
  table[0] = a0
  table[1] = a1
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) table[i + 1] = ((7 - i) * a0 + i * a1) / 7
  } else {
    for (let i = 1; i < 5; i++) table[i + 1] = ((5 - i) * a0 + i * a1) / 5
    table[6] = 0
    table[7] = 255
  }
  // 3비트 색인 16개가 6바이트에 들어 있다. 48비트라 32비트로 못 담는다
  let lo = src[at + 2]! | (src[at + 3]! << 8) | (src[at + 4]! << 16)
  let hi = src[at + 5]! | (src[at + 6]! << 8) | (src[at + 7]! << 16)
  for (let i = 0; i < 8; i++) { out[i] = table[lo & 7]!; lo >>>= 3 }
  for (let i = 0; i < 8; i++) { out[i + 8] = table[hi & 7]!; hi >>>= 3 }
}

type BlockWriter = (src: Uint8Array, at: number, block: Uint32Array) => void

const bc1: BlockWriter = (src, at, block) => {
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength)
  const colors = new Uint32Array(4)
  bc1Colors(view.getUint16(at, true), view.getUint16(at + 2, true), true, colors)
  for (let i = 0; i < 4; i++) {
    const bits = src[at + 4 + i]!
    for (let k = 0; k < 4; k++) block[i * 4 + k] = colors[(bits >> (k * 2)) & 3]!
  }
}

const bc3: BlockWriter = (src, at, block) => {
  const alpha = new Uint8Array(16)
  bc4Block(src, at, alpha)
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength)
  const colors = new Uint32Array(4)
  bc1Colors(view.getUint16(at + 8, true), view.getUint16(at + 10, true), false, colors)
  for (let i = 0; i < 4; i++) {
    const bits = src[at + 12 + i]!
    for (let k = 0; k < 4; k++) {
      const c = colors[(bits >> (k * 2)) & 3]!
      block[i * 4 + k] = ((c & 0x00ffffff) | (alpha[i * 4 + k]! << 24)) >>> 0
    }
  }
}

const bc4: BlockWriter = (src, at, block) => {
  const red = new Uint8Array(16)
  bc4Block(src, at, red)
  // 한 채널짜리다. 빨강에만 넣는다 — 회색으로 펴면 이 텍스처를 곱하는 자리가 세 배 밝아진다
  for (let i = 0; i < 16; i++) block[i] = rgba(red[i]!, 0, 0, 255)
}

const bc5: BlockWriter = (src, at, block) => {
  const red = new Uint8Array(16)
  const green = new Uint8Array(16)
  bc4Block(src, at, red)
  bc4Block(src, at + 8, green)
  for (let i = 0; i < 16; i++) block[i] = rgba(red[i]!, green[i]!, 0, 255)
}

// ── BC7 ──────────────────────────────────────────────────────────────────────
//
// 모드 여덟 개. 각 모드가 (부분 수, 색 비트, 알파 비트, 회전, 색인 비트, P비트
// 방식)을 다르게 쓴다. 표로 두고 한 길로 읽는다 — 모드마다 함수를 두면 같은
// 버그를 여덟 번 고치게 된다.

interface Bc7Mode {
  subsets: number
  partitionBits: number
  rotationBits: number
  indexSelectionBits: number
  colorBits: number
  alphaBits: number
  /** 0 = 없음, 1 = 부분마다 하나, 2 = 끝점마다 하나 */
  pBits: 0 | 1 | 2
  indexBits: number
  index2Bits: number
}

const BC7_MODES: readonly Bc7Mode[] = [
  { subsets: 3, partitionBits: 4, rotationBits: 0, indexSelectionBits: 0, colorBits: 4, alphaBits: 0, pBits: 2, indexBits: 3, index2Bits: 0 },
  { subsets: 2, partitionBits: 6, rotationBits: 0, indexSelectionBits: 0, colorBits: 6, alphaBits: 0, pBits: 1, indexBits: 3, index2Bits: 0 },
  { subsets: 3, partitionBits: 6, rotationBits: 0, indexSelectionBits: 0, colorBits: 5, alphaBits: 0, pBits: 0, indexBits: 2, index2Bits: 0 },
  { subsets: 2, partitionBits: 6, rotationBits: 0, indexSelectionBits: 0, colorBits: 7, alphaBits: 0, pBits: 2, indexBits: 2, index2Bits: 0 },
  { subsets: 1, partitionBits: 0, rotationBits: 2, indexSelectionBits: 1, colorBits: 5, alphaBits: 6, pBits: 0, indexBits: 2, index2Bits: 3 },
  { subsets: 1, partitionBits: 0, rotationBits: 2, indexSelectionBits: 0, colorBits: 7, alphaBits: 8, pBits: 0, indexBits: 2, index2Bits: 2 },
  { subsets: 1, partitionBits: 0, rotationBits: 0, indexSelectionBits: 0, colorBits: 7, alphaBits: 7, pBits: 2, indexBits: 4, index2Bits: 0 },
  { subsets: 2, partitionBits: 6, rotationBits: 0, indexSelectionBits: 0, colorBits: 5, alphaBits: 5, pBits: 2, indexBits: 2, index2Bits: 0 },
]

/** 2부분 나눔 표 64개 (BC7 규격 그대로) */
const PARTITION2 = [
  0x50505050, 0x40404040, 0x54545454, 0x54505040, 0x50404000, 0x55545450, 0x55545040, 0x54504000,
  0x50400000, 0x55555450, 0x55544000, 0x54400000, 0x55555440, 0x55550000, 0x55555500, 0x55000000,
  0x55150100, 0x00004054, 0x15010000, 0x00405054, 0x00004050, 0x15050100, 0x05010000, 0x40505054,
  0x00404050, 0x05010100, 0x14141414, 0x05141450, 0x01155440, 0x00555500, 0x15014054, 0x05414150,
  0x44444444, 0x55005500, 0x11441144, 0x05055050, 0x05500550, 0x11114444, 0x41144114, 0x44111144,
  0x15055054, 0x01055040, 0x05041050, 0x05455150, 0x14414114, 0x50050550, 0x41411414, 0x00141400,
  0x00041504, 0x00105410, 0x10541000, 0x04150400, 0x50410514, 0x41051450, 0x05415014, 0x14054150,
  0x41050514, 0x41505014, 0x40011554, 0x54150140, 0x50505500, 0x00555050, 0x15151010, 0x54540404,
]

/** 3부분 나눔 표 64개 */
const PARTITION3 = [
  0xaa685050, 0x6a5a5040, 0x5a5a4200, 0x5450a0a8, 0xa5a50000, 0xa0a05050, 0x5555a0a0, 0x5a5a5050,
  0xaa550000, 0xaa555500, 0xaaaa5500, 0x90909090, 0x94949494, 0xa4a4a4a4, 0xa9a59450, 0x2a0a4250,
  0xa5945040, 0x0a425054, 0xa5a5a500, 0x55a0a0a0, 0xa8a85454, 0x6a6a4040, 0xa4a45000, 0x1a1a0500,
  0x0050a4a4, 0xaaa59090, 0x14696914, 0x69691400, 0xa08585a0, 0xaa821414, 0x50a4a450, 0x6a5a0200,
  0xa9a58000, 0x5090a0a8, 0xa8a09050, 0x24242424, 0x00aa5500, 0x24924924, 0x24499224, 0x50a50a50,
  0x500aa550, 0xaaaa4444, 0x66660000, 0xa5a0a5a0, 0x50a050a0, 0x69286928, 0x44aaaa44, 0x66666600,
  0xaa444444, 0x54a854a8, 0x95809580, 0x96969600, 0xa85454a8, 0x80959580, 0xaa141414, 0x96960000,
  0xaaaa1414, 0xa05050a0, 0xa0a5a5a0, 0x96000000, 0x40804080, 0xa9a8a9a8, 0xaaaaaa44, 0x2a4a5254,
]

/** 두 부분일 때 두 번째 끝점 색인이 고정인 자리 */
const ANCHOR2 = [
  15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
  15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2,
  15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6,
  6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15,
]
const ANCHOR3A = [
  3, 3, 15, 15, 8, 3, 15, 15, 8, 8, 6, 6, 6, 5, 3, 3,
  3, 3, 8, 15, 3, 3, 6, 10, 5, 8, 8, 6, 8, 5, 15, 15,
  8, 15, 3, 5, 6, 10, 8, 15, 15, 3, 15, 5, 15, 15, 15, 15,
  3, 15, 5, 5, 5, 8, 5, 10, 5, 10, 8, 13, 15, 12, 3, 3,
]
const ANCHOR3B = [
  15, 8, 8, 3, 15, 15, 3, 8, 15, 15, 15, 15, 15, 15, 15, 8,
  15, 8, 15, 3, 15, 8, 15, 8, 3, 15, 6, 10, 15, 15, 10, 8,
  15, 3, 15, 10, 10, 8, 9, 10, 6, 15, 8, 15, 3, 6, 6, 8,
  15, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 3, 15, 15, 8,
]

const WEIGHT2 = [0, 21, 43, 64]
const WEIGHT3 = [0, 9, 18, 27, 37, 46, 55, 64]
const WEIGHT4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64]
const WEIGHTS: Readonly<Record<number, readonly number[]>> = { 2: WEIGHT2, 3: WEIGHT3, 4: WEIGHT4 }

const partitionOf = (subsets: number, partition: number, pixel: number): number => {
  if (subsets === 1) return 0
  const table = subsets === 2 ? PARTITION2 : PARTITION3
  return (table[partition]! >> (pixel * 2)) & 3
}

const interpolate = (a: number, b: number, weight: number): number =>
  ((64 - weight) * a + weight * b + 32) >> 6

/** 블록 128비트에서 아래부터 비트를 뽑는 읽개 */
class BitReader {
  private at = 0
  private readonly src: Uint8Array
  private readonly base: number
  constructor(src: Uint8Array, base: number) { this.src = src; this.base = base }
  read(n: number): number {
    let out = 0
    for (let i = 0; i < n; i++) {
      const bit = (this.src[this.base + (this.at >> 3)]! >> (this.at & 7)) & 1
      out |= bit << i
      this.at++
    }
    return out
  }
}

const bc7: BlockWriter = (src, at, block) => {
  // 모드는 첫 1비트 자리로 정해진다 — 0이 이어지는 개수가 모드 번호다
  let mode = -1
  for (let i = 0; i < 8; i++) {
    if ((src[at]! >> i) & 1) { mode = i; break }
  }
  if (mode < 0) {
    // 낮은 8비트가 다 0이면 모드가 없다. 규격이 "전부 0"으로 정해 둔 자리다
    block.fill(0)
    return
  }
  const m = BC7_MODES[mode]!
  const r = new BitReader(src, at)
  r.read(mode + 1)

  const partition = m.partitionBits ? r.read(m.partitionBits) : 0
  const rotation = m.rotationBits ? r.read(m.rotationBits) : 0
  const indexSelection = m.indexSelectionBits ? r.read(m.indexSelectionBits) : 0

  const n = m.subsets * 2
  const red = new Array<number>(n)
  const green = new Array<number>(n)
  const blue = new Array<number>(n)
  const alpha = new Array<number>(n).fill(255)
  for (let i = 0; i < n; i++) red[i] = r.read(m.colorBits)
  for (let i = 0; i < n; i++) green[i] = r.read(m.colorBits)
  for (let i = 0; i < n; i++) blue[i] = r.read(m.colorBits)
  if (m.alphaBits) for (let i = 0; i < n; i++) alpha[i] = r.read(m.alphaBits)

  // P비트는 색 아래에 한 비트를 더 붙인다 — 붙인 뒤에 8비트로 늘려야 한다
  const pbit = new Array<number>(n).fill(-1)
  if (m.pBits === 1) {
    for (let s = 0; s < m.subsets; s++) {
      const bit = r.read(1)
      pbit[s * 2] = bit
      pbit[s * 2 + 1] = bit
    }
  } else if (m.pBits === 2) {
    for (let i = 0; i < n; i++) pbit[i] = r.read(1)
  }

  const colorBits = m.colorBits + (m.pBits ? 1 : 0)
  const alphaBits = m.alphaBits + (m.pBits && m.alphaBits ? 1 : 0)
  const expand = (v: number, bits: number): number => {
    if (bits >= 8) return v
    const x = v << (8 - bits)
    return (x | (x >> bits)) & 0xff
  }
  for (let i = 0; i < n; i++) {
    if (pbit[i]! >= 0) {
      red[i] = (red[i]! << 1) | pbit[i]!
      green[i] = (green[i]! << 1) | pbit[i]!
      blue[i] = (blue[i]! << 1) | pbit[i]!
      if (m.alphaBits) alpha[i] = (alpha[i]! << 1) | pbit[i]!
    }
    red[i] = expand(red[i]!, colorBits)
    green[i] = expand(green[i]!, colorBits)
    blue[i] = expand(blue[i]!, colorBits)
    alpha[i] = m.alphaBits ? expand(alpha[i]!, alphaBits) : 255
  }

  // 색인. 부분의 첫 픽셀(앵커)은 최상위 비트가 0이라고 정해져 있어 한 비트 짧다
  const anchors = [0, 0, 0]
  if (m.subsets === 2) anchors[1] = ANCHOR2[partition]!
  else if (m.subsets === 3) { anchors[1] = ANCHOR3A[partition]!; anchors[2] = ANCHOR3B[partition]! }
  const isAnchor = (p: number): boolean => {
    for (let s = 0; s < m.subsets; s++) if (anchors[s] === p) return true
    return false
  }

  const index = new Uint8Array(16)
  for (let p = 0; p < 16; p++) {
    index[p] = r.read(m.indexBits - (isAnchor(p) ? 1 : 0))
  }
  const index2 = new Uint8Array(16)
  if (m.index2Bits) {
    for (let p = 0; p < 16; p++) index2[p] = r.read(m.index2Bits - (p === 0 ? 1 : 0))
  }

  const w1 = WEIGHTS[m.indexBits]!
  const w2 = m.index2Bits ? WEIGHTS[m.index2Bits]! : w1
  for (let p = 0; p < 16; p++) {
    const s = partitionOf(m.subsets, partition, p)
    // 모드 4는 `indexSelection`이 색과 알파가 어느 색인을 쓰는지를 바꾼다
    const colorWeight = indexSelection ? w2[index2[p]!]! : w1[index[p]!]!
    const alphaWeight = m.index2Bits
      ? (indexSelection ? w1[index[p]!]! : w2[index2[p]!]!)
      : w1[index[p]!]!
    let cr = interpolate(red[s * 2]!, red[s * 2 + 1]!, colorWeight)
    let cg = interpolate(green[s * 2]!, green[s * 2 + 1]!, colorWeight)
    let cb = interpolate(blue[s * 2]!, blue[s * 2 + 1]!, colorWeight)
    let ca = m.alphaBits
      ? interpolate(alpha[s * 2]!, alpha[s * 2 + 1]!, alphaWeight)
      : 255
    // 회전은 알파를 색 한 채널과 맞바꾼다 (모드 4·5)
    if (rotation === 1) { const t = cr; cr = ca; ca = t }
    else if (rotation === 2) { const t = cg; cg = ca; ca = t }
    else if (rotation === 3) { const t = cb; cb = ca; ca = t }
    block[p] = rgba(cr, cg, cb, ca)
  }
}

const BLOCK: Readonly<Record<string, { bytes: number, write: BlockWriter }>> = {
  bc1: { bytes: 8, write: bc1 },
  bc3: { bytes: 16, write: bc3 },
  bc4: { bytes: 8, write: bc4 },
  bc5: { bytes: 16, write: bc5 },
  bc7: { bytes: 16, write: bc7 },
}

export type BcKind = 'bc1' | 'bc3' | 'bc4' | 'bc5' | 'bc7'

/**
 * BC 텍스처를 RGBA8로 편다.
 *
 * ⚠️ **가장자리 블록을 통째로 쓰지 않는다.** 4의 배수가 아닌 크기는 블록이
 * 밖으로 삐져나오고, 그 픽셀을 쓰면 다음 줄을 덮는다
 */
export function decodeBc(
  kind: BcKind, src: Uint8Array, width: number, height: number,
): Uint8Array {
  const spec = BLOCK[kind]
  if (!spec) throw new BlockError(`모르는 BC 종류 ${kind}`)
  const bw = Math.ceil(width / 4)
  const bh = Math.ceil(height / 4)
  const need = bw * bh * spec.bytes
  if (src.byteLength < need) {
    throw new BlockError(`${kind} 자료가 모자란다 (${String(src.byteLength)} < ${String(need)})`)
  }
  const out = new Uint8Array(width * height * 4)
  const words = new Uint32Array(out.buffer)
  const block = new Uint32Array(16)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      spec.write(src, (by * bw + bx) * spec.bytes, block)
      for (let y = 0; y < 4; y++) {
        const py = by * 4 + y
        if (py >= height) break
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x
          if (px >= width) break
          words[py * width + px] = block[y * 4 + x]!
        }
      }
    }
  }
  return out
}
