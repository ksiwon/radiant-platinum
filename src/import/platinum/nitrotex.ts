// NDS 텍스처(TEX0/BTX0) 디코더 — 브라우저에서 (DATA.md §2.2)
//
// 맵 모델은 텍스처를 자기 안에 안 갖고 있다. 영역(area)마다 한 벌씩
// `area_map_tex/map_tex_set.narc`에 BTX0로 들어 있고, 모델의 재질이 **이름으로**
// 그것을 가리킨다.
//
// 형식이 일곱 가지다. 팔레트 색인 셋(2·4·8bpp)은 흔한 모양이지만 나머지 넷이
// 다르다 — A3I5·A5I3는 알파를 색인 안에 섞어 넣고, 4×4 압축은 블록마다 팔레트를
// 따로 고르며, direct는 팔레트가 없다. 하나만 빠뜨려도 그 텍스처만 조용히 깨진다.
import { readDict } from './nsbmd'

interface TexParams {
  repeatS: boolean
  repeatT: boolean
  flipS: boolean
  flipT: boolean
  width: number
  height: number
  format: number
  color0: boolean
}

/** `TEXIMAGE_PARAM` 상위 16비트가 그대로 들어 있다 */
export function texParams(param: number): TexParams {
  return {
    repeatS: (param & 1) !== 0,
    repeatT: (param & 2) !== 0,
    flipS: (param & 4) !== 0,
    flipT: (param & 8) !== 0,
    width: 8 << ((param >> 4) & 7),
    height: 8 << ((param >> 7) & 7),
    format: (param >> 10) & 7,
    color0: (param & 0x2000) !== 0,
  }
}

/** 형식별 픽셀당 비트 */
export const BITS = [0, 8, 2, 4, 8, 0, 8, 16]

/** 텍스처 하나가 차지하는 바이트. 4×4 압축(5)만 다르다 */
export function dataSize(p: TexParams): number {
  if (p.format === 5) return (p.width * p.height) / 16 * 4
  return (p.width * p.height * BITS[p.format]!) / 8
}

export type Rgb = [number, number, number]

/** BGR555 → [r,g,b]. 5비트를 8비트로 늘릴 때 위 3비트를 아래에 되붙인다 */
export function color(v: number): Rgb {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

export interface TexEntry extends TexParams { name: string, offset: number, bytes: number }
interface PalEntry { name: string, offset: number }

export interface Tex0 {
  textures: TexEntry[]
  palettes: PalEntry[]
  data: DataView
  cmp: DataView
  cmpInfo: DataView
  pal: DataView
}

const sub = (buf: Uint8Array, from: number, length: number): DataView => {
  const to = Math.min(from + Math.max(0, length), buf.byteLength)
  const start = Math.min(from, buf.byteLength)
  return new DataView(buf.buffer, buf.byteOffset + start, Math.max(0, to - start))
}

/** BTX0 또는 NSBMD 안의 TEX0 블록을 읽는다 */
export function parseTex0(buf: Uint8Array, at: number): Tex0 {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (String.fromCharCode(buf[at]!, buf[at + 1]!, buf[at + 2]!, buf[at + 3]!) !== 'TEX0') {
    throw new Error('TEX0가 아니다')
  }
  const texDataSize = view.getUint16(at + 0x0c, true) << 3
  const texInfoOff = view.getUint16(at + 0x0e, true)
  const texDataOff = view.getUint32(at + 0x14, true)
  const cmpDataSize = view.getUint16(at + 0x1c, true) << 3
  const cmpDataOff = view.getUint32(at + 0x24, true)
  const cmpInfoDataOff = view.getUint32(at + 0x28, true)
  const palDataSize = view.getUint32(at + 0x30, true) << 3
  const palInfoOff = view.getUint32(at + 0x34, true)
  const palDataOff = view.getUint32(at + 0x38, true)

  const textures = readDict(buf, view, at + texInfoOff).map((e) => {
    const offset = view.getUint16(e.at, true) << 3
    const p = texParams(view.getUint16(e.at + 2, true))
    return { name: e.name, offset, ...p, bytes: dataSize(p) }
  })
  const palettes = readDict(buf, view, at + palInfoOff).map((e) => ({
    name: e.name,
    // 팔레트 오프셋도 <<3이다. 4색 팔레트만 <<2인 판이 있어 조심해야 한다
    offset: view.getUint16(e.at, true) << 3,
  }))

  return {
    textures,
    palettes,
    data: sub(buf, at + texDataOff, texDataSize),
    cmp: sub(buf, at + cmpDataOff, cmpDataSize),
    cmpInfo: sub(buf, at + cmpInfoDataOff, cmpDataSize / 2),
    pal: sub(buf, at + palDataOff, palDataSize),
  }
}

/**
 * 4×4 압축.
 *
 * 블록 4×4가 32비트 색인 하나 + 16비트 팔레트 지정 하나로 줄어든다. 지정의
 * 상위 2비트가 **모드**인데, 모드마다 셋째·넷째 색을 앞 두 색에서 섞어 만든다 —
 * 그 보간을 빠뜨리면 블록 경계가 계단처럼 보인다
 */
function decode4x4(tex0: Tex0, tex: TexEntry, palOffset: number, out: Uint8Array): void {
  const { width, height } = tex
  const blocksX = width / 4
  const blocks = (width * height) / 16
  const mix = (a: Rgb, b: Rgb, wa: number, wb: number): Rgb => [
    Math.round((a[0] * wa + b[0] * wb) / (wa + wb)),
    Math.round((a[1] * wa + b[1] * wb) / (wa + wb)),
    Math.round((a[2] * wa + b[2] * wb) / (wa + wb)),
  ]
  for (let n = 0; n < blocks; n++) {
    const texel = tex0.cmp.getUint32(tex.offset + n * 4, true)
    const info = tex0.cmpInfo.getUint16(tex.offset / 2 + n * 2, true)
    const mode = info >> 14
    const at = palOffset + (info & 0x3fff) * 4
    const c: Rgb[] = [0, 1, 2, 3].map((i) => color(tex0.pal.getUint16(at + i * 2, true)))
    const alpha = [255, 255, 255, 255]
    if (mode === 0) alpha[3] = 0
    else if (mode === 1) { c[2] = mix(c[0]!, c[1]!, 1, 1); c[3] = [0, 0, 0]; alpha[3] = 0 }
    else if (mode === 3) { c[2] = mix(c[0]!, c[1]!, 5, 3); c[3] = mix(c[0]!, c[1]!, 3, 5) }
    for (let i = 0; i < 16; i++) {
      const idx = (texel >>> (i * 2)) & 3
      const x = (n % blocksX) * 4 + (i % 4)
      const y = Math.floor(n / blocksX) * 4 + Math.floor(i / 4)
      const o = (y * width + x) * 4
      const cc = c[idx]!
      out[o] = cc[0]; out[o + 1] = cc[1]; out[o + 2] = cc[2]; out[o + 3] = alpha[idx]!
    }
  }
}

/** 텍스처 하나를 RGBA로 편다 */
export function decode(tex0: Tex0, tex: TexEntry, palOffset: number): Uint8Array {
  const { width, height, format, color0, offset: base } = tex
  const out = new Uint8Array(width * height * 4)
  const src = format === 5 ? tex0.cmp : tex0.data
  const put = (i: number, rgb: Rgb, a: number): void => {
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = a
  }
  const pal = (i: number): Rgb => color(tex0.pal.getUint16(palOffset + i * 2, true))

  switch (format) {
    case 1: // A3I5 — 하위 5비트 색인, 상위 3비트 알파
      for (let i = 0; i < width * height; i++) {
        const b = src.getUint8(base + i)
        put(i, pal(b & 0x1f), Math.round(((b >> 5) & 7) * 255 / 7))
      }
      break
    case 2: case 3: case 4: { // 팔레트 색인 2·4·8bpp
      const bits = BITS[format]!
      const perByte = 8 / bits
      const mask = (1 << bits) - 1
      for (let i = 0; i < width * height; i++) {
        const b = src.getUint8(base + Math.floor(i / perByte))
        const idx = (b >> ((i % perByte) * bits)) & mask
        put(i, idx === 0 && color0 ? [0, 0, 0] : pal(idx), idx === 0 && color0 ? 0 : 255)
      }
      break
    }
    case 5: decode4x4(tex0, tex, palOffset, out); break
    case 6: // A5I3 — 하위 3비트 색인, 상위 5비트 알파
      for (let i = 0; i < width * height; i++) {
        const b = src.getUint8(base + i)
        put(i, pal(b & 7), Math.round(((b >> 3) & 0x1f) * 255 / 31))
      }
      break
    case 7: // direct — 픽셀마다 BGR555 + 알파 비트
      for (let i = 0; i < width * height; i++) {
        const v = src.getUint16(base + i * 2, true)
        put(i, color(v), v & 0x8000 ? 255 : 0)
      }
      break
    default:
      throw new Error(`형식 ${String(format)}은 모른다`)
  }
  return out
}
