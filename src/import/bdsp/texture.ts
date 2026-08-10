// Unity Texture2D → RGBA8 (IMPORT.md §12)
//
// ⚠️ **픽셀이 오브젝트 안에 없다.** 실측하면 BDSP 텍스처의 거의 전부가
// `m_StreamData`로 빠져 있고, 진짜 바이트는 같은 번들 안의 `.resS` 노드에 있다
// (150장 중 149장). `image_data`만 보면 빈손이고, 그러면 "텍스처가 없는 모델"이
// 조용히 나온다.
//
// ⚠️ **밉맵을 같이 읽지 않는다.** 자료 앞쪽이 가장 큰 한 장이고 그 뒤로 작은
// 것들이 이어 붙어 있다. 전부 넘기면 디코더가 자료가 남는다고 하지 않고 **아래쪽
// 밉을 큰 그림의 일부로 읽어** 그림 아래가 지저분해진다.
import { decodeBc, type BcKind } from './bcn'
import { decodeAstc } from './astc'
import { className, type Bundle, type SerializedFile, type UnityObject } from './unityfs'
import type { UnityValue } from './typetree'

export class TextureError extends Error {
  constructor(message: string) { super(message); this.name = 'TextureError' }
}

/** Unity `TextureFormat` 번호 → 어떻게 푸는가 */
interface FormatSpec {
  kind: BcKind | 'astc' | 'alpha8' | 'rgba32' | 'rgb24' | 'argb32' | 'r8' | 'rg16'
  /** ASTC 블록 크기. 나머지는 0 */
  blockW: number
  blockH: number
  /** 픽셀 하나가 몇 바이트인가 (블록 압축이면 0) */
  pixelBytes: number
}

const FORMATS: Readonly<Record<number, FormatSpec>> = {
  1: { kind: 'alpha8', blockW: 0, blockH: 0, pixelBytes: 1 },
  3: { kind: 'rgb24', blockW: 0, blockH: 0, pixelBytes: 3 },
  4: { kind: 'rgba32', blockW: 0, blockH: 0, pixelBytes: 4 },
  5: { kind: 'argb32', blockW: 0, blockH: 0, pixelBytes: 4 },
  10: { kind: 'bc1', blockW: 4, blockH: 4, pixelBytes: 0 },
  12: { kind: 'bc3', blockW: 4, blockH: 4, pixelBytes: 0 },
  25: { kind: 'bc7', blockW: 4, blockH: 4, pixelBytes: 0 },
  26: { kind: 'bc4', blockW: 4, blockH: 4, pixelBytes: 0 },
  27: { kind: 'bc5', blockW: 4, blockH: 4, pixelBytes: 0 },
  48: { kind: 'astc', blockW: 4, blockH: 4, pixelBytes: 0 },
  49: { kind: 'astc', blockW: 5, blockH: 5, pixelBytes: 0 },
  50: { kind: 'astc', blockW: 6, blockH: 6, pixelBytes: 0 },
  51: { kind: 'astc', blockW: 8, blockH: 8, pixelBytes: 0 },
  52: { kind: 'astc', blockW: 10, blockH: 10, pixelBytes: 0 },
  53: { kind: 'astc', blockW: 12, blockH: 12, pixelBytes: 0 },
  54: { kind: 'astc', blockW: 4, blockH: 4, pixelBytes: 0 },
  55: { kind: 'astc', blockW: 5, blockH: 5, pixelBytes: 0 },
  56: { kind: 'astc', blockW: 6, blockH: 6, pixelBytes: 0 },
  57: { kind: 'astc', blockW: 8, blockH: 8, pixelBytes: 0 },
  58: { kind: 'astc', blockW: 10, blockH: 10, pixelBytes: 0 },
  59: { kind: 'astc', blockW: 12, blockH: 12, pixelBytes: 0 },
  62: { kind: 'r8', blockW: 0, blockH: 0, pixelBytes: 1 },
  63: { kind: 'rg16', blockW: 0, blockH: 0, pixelBytes: 2 },
}

export interface Texture {
  name: string
  width: number
  height: number
  /** RGBA8, 위에서 아래로 (PNG 차례) */
  pixels: Uint8Array
  /** Unity 반복 방식 그대로 (0 Repeat · 1 Clamp · 2·3 Mirror) */
  wrapU: number
  wrapV: number
  /** HDR 블록이 섞여 있었으면 몇 개 */
  hdrBlocks: number
}

/** 가장 큰 밉 한 장이 몇 바이트인가 */
function mipBytes(spec: FormatSpec, width: number, height: number): number {
  if (spec.pixelBytes) return width * height * spec.pixelBytes
  const bw = Math.ceil(width / spec.blockW)
  const bh = Math.ceil(height / spec.blockH)
  return bw * bh * (spec.kind === 'astc' ? 16 : spec.kind === 'bc1' || spec.kind === 'bc4' ? 8 : 16)
}

/**
 * 번들 안에서 `m_StreamData.path`가 가리키는 자료를 꺼낸다.
 *
 * ⚠️ 경로는 `archive:/CAB-…/CAB-….resS` 꼴이라 통째로는 디렉터리 이름과 안 맞는다.
 * 마지막 칸만 대소문자 없이 맞춘다
 */
export function resource(bundle: Bundle, path: string): Uint8Array | null {
  const want = path.split('/').pop()?.toLowerCase()
  if (!want) return null
  for (const node of bundle.nodes) {
    if (node.path.toLowerCase() !== want) continue
    return bundle.data.subarray(node.offset, node.offset + node.size)
  }
  return null
}

/** Unity 픽셀 자료 → RGBA8. 블록 압축은 디코더로, 나머지는 채널을 옮긴다 */
function toRgba(spec: FormatSpec, raw: Uint8Array, width: number, height: number): {
  pixels: Uint8Array, hdrBlocks: number,
} {
  if (spec.kind === 'astc') {
    const got = decodeAstc(raw, width, height, spec.blockW, spec.blockH)
    return { pixels: got.pixels, hdrBlocks: got.hdrBlocks }
  }
  if (spec.pixelBytes === 0) {
    return { pixels: decodeBc(spec.kind as BcKind, raw, width, height), hdrBlocks: 0 }
  }
  const out = new Uint8Array(width * height * 4)
  const n = width * height
  for (let i = 0; i < n; i++) {
    const at = i * spec.pixelBytes
    const to = i * 4
    switch (spec.kind) {
      case 'alpha8': out[to] = 255; out[to + 1] = 255; out[to + 2] = 255; out[to + 3] = raw[at]!; break
      case 'r8': out[to] = raw[at]!; out[to + 3] = 255; break
      case 'rg16': out[to] = raw[at]!; out[to + 1] = raw[at + 1]!; out[to + 3] = 255; break
      case 'rgb24': out[to] = raw[at]!; out[to + 1] = raw[at + 1]!; out[to + 2] = raw[at + 2]!; out[to + 3] = 255; break
      case 'rgba32': out.set(raw.subarray(at, at + 4), to); break
      case 'argb32':
        out[to] = raw[at + 1]!; out[to + 1] = raw[at + 2]!; out[to + 2] = raw[at + 3]!; out[to + 3] = raw[at]!
        break
      default: throw new TextureError(`모르는 픽셀 배치 ${spec.kind}`)
    }
  }
  return { pixels: out, hdrBlocks: 0 }
}

/**
 * 위아래를 뒤집는다.
 *
 * ⚠️ **유니티 텍스처는 아래에서 위로 담긴다** — 압축 형식도 그렇다. 한때 블록
 * 압축은 이미 위에서 아래라고 보고 안 뒤집었는데, 디코더끼리 대조할 때는
 * 양쪽 다 안 뒤집으니 안 걸렸다. 개발 추출기(UnityPy `.image`)는 형식과
 * 상관없이 뒤집으므로, 안 뒤집으면 구운 그림이 위아래로 갈린다
 */
function flipRows(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(pixels.length)
  const row = width * 4
  for (let y = 0; y < height; y++) {
    out.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row)
  }
  return out
}

/** Texture2D 하나를 RGBA8로 (위에서 아래로) */
export function readTexture(
  value: Record<string, UnityValue>, bundle: Bundle,
): Texture {
  const format = value.m_TextureFormat as number
  const spec = FORMATS[format]
  if (!spec) throw new TextureError(`모르는 텍스처 형식 ${String(format)}`)
  const width = value.m_Width as number
  const height = value.m_Height as number
  if (width <= 0 || height <= 0) throw new TextureError(`크기가 이상하다 ${String(width)}x${String(height)}`)

  let raw = value['image data'] as Uint8Array | undefined ?? value.m_ImageData as Uint8Array | undefined
  const stream = value.m_StreamData as Record<string, UnityValue> | undefined
  const path = stream?.path as string | undefined
  if ((!raw || raw.byteLength === 0) && path) {
    const res = resource(bundle, path)
    if (!res) throw new TextureError(`스트림 자료를 못 찾았다 (${path})`)
    const offset = Number(stream?.offset ?? 0)
    const size = Number(stream?.size ?? res.byteLength)
    raw = res.subarray(offset, offset + size)
  }
  if (!raw || raw.byteLength === 0) throw new TextureError(`${String(value.m_Name)}: 픽셀 자료가 없다`)

  // 밉이 여럿이면 앞의 한 장만 쓴다
  const need = mipBytes(spec, width, height)
  if (raw.byteLength < need) {
    throw new TextureError(
      `${String(value.m_Name)}: 자료가 모자란다 (${String(raw.byteLength)} < ${String(need)})`,
    )
  }
  const got = toRgba(spec, raw.subarray(0, need), width, height)

  const settings = value.m_TextureSettings as Record<string, UnityValue> | undefined
  return {
    name: (value.m_Name as string | undefined) ?? '',
    width,
    height,
    pixels: flipRows(got.pixels, width, height),
    hdrBlocks: got.hdrBlocks,
    wrapU: Number(settings?.m_WrapU ?? 0),
    wrapV: Number(settings?.m_WrapV ?? 0),
  }
}

/** 파일 안의 Texture2D 전부. PathID로 찾을 수 있게 준다 */
export function texturesOf(ser: SerializedFile, bundle: Bundle): Map<number, Texture> {
  const out = new Map<number, Texture>()
  for (const o of ser.objects) {
    if (className(o.classId) !== 'Texture2D') continue
    const v = ser.read(o)
    if (!v || typeof v !== 'object') continue
    out.set(o.pathId, readTexture(v as Record<string, UnityValue>, bundle))
  }
  return out
}

/** 텍스처 오브젝트만 골라 준다 (읽는 것은 쓰는 쪽이 정한다) */
export function textureObjects(ser: SerializedFile): UnityObject[] {
  return ser.objects.filter((o) => className(o.classId) === 'Texture2D')
}

// ── 크기 줄이기 ──────────────────────────────────────────────────────────────

/**
 * Lanczos-3 축소.
 *
 * ⚠️ **평균이나 최근접으로 줄이면 안 된다.** 인물 텍스처는 도트가 아니라 그림
 * 계열이고, 1024를 256으로 줄이는 자리라 최근접은 눈·입이 조각조각 난다.
 * 개발 추출기(`bdsp_bake_albedo.py`)가 PIL LANCZOS를 쓰는 것과 같은 필터다 —
 * 부동소수 반올림까지 같지는 않으므로 대조는 **픽셀 차이 한도**로 잰다
 */
export function resize(
  src: Uint8Array, width: number, height: number, toWidth: number, toHeight: number,
): Uint8Array<ArrayBuffer> {
  if (toWidth === width && toHeight === height) return src.slice()
  const lanczos = (x: number): number => {
    if (x === 0) return 1
    const a = Math.abs(x)
    if (a >= 3) return 0
    const p = Math.PI * a
    return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p)
  }
  /** 한 축을 줄이는 무게표. 늘릴 때는 창을 안 넓힌다 */
  const weights = (from: number, to: number): { at: number[], w: Float32Array }[] => {
    const scale = to / from
    const support = 3 / Math.min(1, scale)
    const out: { at: number[], w: Float32Array }[] = []
    for (let i = 0; i < to; i++) {
      const center = (i + 0.5) / scale
      const lo = Math.max(0, Math.floor(center - support))
      const hi = Math.min(from - 1, Math.ceil(center + support))
      const at: number[] = []
      const raw: number[] = []
      let sum = 0
      for (let s = lo; s <= hi; s++) {
        const w = lanczos((s + 0.5 - center) * Math.min(1, scale))
        if (w === 0) continue
        at.push(s)
        raw.push(w)
        sum += w
      }
      const w = new Float32Array(raw.length)
      for (let k = 0; k < raw.length; k++) w[k] = raw[k]! / (sum || 1)
      out.push({ at, w })
    }
    return out
  }

  const cols = weights(width, toWidth)
  const mid = new Float32Array(toWidth * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < toWidth; x++) {
      const { at, w } = cols[x]!
      for (let c = 0; c < 4; c++) {
        let v = 0
        for (let k = 0; k < at.length; k++) v += src[(y * width + at[k]!) * 4 + c]! * w[k]!
        mid[(y * toWidth + x) * 4 + c] = v
      }
    }
  }
  const rows = weights(height, toHeight)
  const out = new Uint8Array(toWidth * toHeight * 4)
  for (let y = 0; y < toHeight; y++) {
    const { at, w } = rows[y]!
    for (let x = 0; x < toWidth; x++) {
      for (let c = 0; c < 4; c++) {
        let v = 0
        for (let k = 0; k < at.length; k++) v += mid[(at[k]! * toWidth + x) * 4 + c]! * w[k]!
        out[(y * toWidth + x) * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
      }
    }
  }
  return out
}
