// NDS 2D 그래픽 자원 (NCLR·NCGR·NSCR)과 LZ77 — 브라우저에서 (DATA.md §2.20 · §2.21)
//
// 3D 텍스처(TEX0)는 `nitrotex.ts`가 읽는다. 이쪽은 **화면에 그대로 깔리는 판**이다:
// 박스 벽지와 간판 그림이 여기 형식이고, 둘 다 팔레트 + 타일 + (배치) 세 벌로 온다.
import { color, type Rgb } from './nitrotex'

/** 4bpp 타일 하나는 8×8 = 32바이트 */
export const TILE = 8
export const TILE_BYTES = 32
/** 팔레트 한 벌 */
export const COLORS = 16
const PAL_BYTES = COLORS * 2

const magic = (b: Uint8Array): string =>
  String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!)

/**
 * LZ77(0x10). NDS 그래픽이 거의 이 압축이다.
 *
 * 플래그 바이트 하나가 뒤 여덟 조각이 그대로인지 되풀이인지 말한다. 되풀이는
 * `[길이 4비트 + 3][거리 12비트 + 1]`이고 **이미 편 자리에서 겹쳐 읽는다** —
 * 그래서 한 바이트씩 옮겨야 한다(블록 복사로 바꾸면 겹치는 경우가 깨진다)
 */
export function lz77(src: Uint8Array): Uint8Array {
  if (src[0] !== 0x10) throw new Error(`LZ77이 아니다 (머리 0x${(src[0] ?? 0).toString(16)})`)
  const size = src[1]! | (src[2]! << 8) | (src[3]! << 16)
  const out = new Uint8Array(size)
  let o = 0, p = 4
  while (o < size) {
    const flags = src[p++]!
    for (let i = 0; i < 8 && o < size; i++) {
      if (flags & (0x80 >> i)) {
        const b1 = src[p++]!, b2 = src[p++]!
        const len = (b1 >> 4) + 3
        let s = o - (((b1 & 0xf) << 8) | b2) - 1
        if (s < 0) throw new Error('LZ77 거리가 시작보다 앞이다')
        for (let j = 0; j < len; j++) out[o++] = out[s++]!
      } else {
        out[o++] = src[p++]!
      }
    }
  }
  return out
}

/**
 * NCLR — 팔레트가 **여러 벌 이어져 있을 수 있다.**
 *
 * TTLP 절의 0x20이 색 자료 크기라 그것으로 벌 수가 나온다. 간판은 종류 번호가
 * 곧 팔레트 번호라 이 갈래가 필요하다 (`Bg_LoadPalette(… + type * PALETTE_SIZE …)`)
 */
export function palettes(buf: Uint8Array): Rgb[][] {
  if (magic(buf) !== 'RLCN') throw new Error('NCLR이 아니다')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const count = Math.max(1, Math.floor(view.getUint32(0x20, true) / PAL_BYTES))
  return Array.from({ length: count }, (_, p) =>
    Array.from({ length: COLORS }, (_, i) => color(view.getUint16(0x28 + (p * COLORS + i) * 2, true))))
}

export interface Chars { tilesX: number, tilesY: number, data: Uint8Array }

/** NCGR 4bpp 타일. RAHC 절이 타일 수와 자료 크기를 들고 있다 */
export function chars(buf: Uint8Array): Chars {
  if (magic(buf) !== 'RGCN') throw new Error('NCGR이 아니다')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tilesY = view.getUint16(0x18, true), tilesX = view.getUint16(0x1a, true)
  const size = view.getUint32(0x28, true)
  return { tilesX, tilesY, data: buf.subarray(0x30, 0x30 + size) }
}

export interface Screen { width: number, height: number, cells: number[] }

/** NSCR 배치. 한 칸이 u16이고 아래 10비트가 타일 번호, 그 위 두 비트가 뒤집기다 */
export function screen(buf: Uint8Array): Screen {
  if (magic(buf) !== 'RCSN') throw new Error('NSCR이 아니다')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const width = view.getUint16(0x18, true) / TILE, height = view.getUint16(0x1a, true) / TILE
  const cells: number[] = []
  for (let i = 0; i < width * height; i++) cells.push(view.getUint16(0x24 + i * 2, true))
  return { width, height, cells }
}

/**
 * 타일 하나를 찍는다.
 *
 * 한 바이트가 픽셀 둘이고 **아래 니블이 왼쪽**이다. `alphaZero`면 0번 색을
 * 뚫는다 — 스프라이트는 그것이 규칙이고, 배경으로 깔리는 판은 안 뚫는다
 */
export function drawTile(
  rgba: Uint8Array, sheetW: number, ox: number, oy: number,
  data: Uint8Array, tile: number, pal: readonly Rgb[],
  { hflip = false, vflip = false, alphaZero = false } = {},
): void {
  for (let i = 0; i < TILE * TILE; i++) {
    const byte = data[tile * TILE_BYTES + (i >> 1)] ?? 0
    const idx = i & 1 ? byte >> 4 : byte & 0xf
    const px = i & 7, py = i >> 3
    const x = hflip ? TILE - 1 - px : px
    const y = vflip ? TILE - 1 - py : py
    const c = pal[idx] ?? [0, 0, 0]
    const at = ((oy + y) * sheetW + ox + x) * 4
    rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]
    rgba[at + 3] = idx === 0 && alphaZero ? 0 : 255
  }
}
