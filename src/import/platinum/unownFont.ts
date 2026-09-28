// 안농 글꼴 — 브라우저에서 (PARITY §6.8 · `ScrCmd_MessageUnown`)
//
// ⚠️ **`tools/extract/unownFont.js`와 한 줄씩 같아야 한다.** 머리말(형식 · 색 · 글자 자리)은 그쪽에 있다
import { charmap } from './charmap'
import { narcEntry } from './nds'
import { color, type Rgb } from './nitrotex'
import { encodePng } from './png'
import { check, json, type ConvertContext, type Produced } from './convertTypes'

/** `pl_font.order`의 차례 */
const MEMBER_UNOWN = 3
const MEMBER_PALETTE = 6
const GLYPH = 16
const TILE_BYTES = 16
const INK = 1
const SHADOW = 2

/** 칸 하나를 편다. 행마다 윗바이트가 왼쪽 네 픽셀이고, 바이트 안에서는 윗 두 비트가 왼쪽이다 */
function tile(buf: Uint8Array, at: number, out: Uint8Array, ox: number, oy: number): void {
  for (let r = 0; r < 8; r++) {
    const halves = [buf[at + r * 2 + 1]!, buf[at + r * 2]!]
    for (let h = 0; h < 2; h++) {
      for (let p = 0; p < 4; p++) {
        out[(oy + r) * GLYPH + ox + h * 4 + p] = (halves[h]! >> (6 - p * 2)) & 3
      }
    }
  }
}

export async function convertUnownFont(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/graphic/pl_font.narc')
  if (!narc) throw new Error('pl_font.narc을 못 읽었다')
  const font = narcEntry(narc, MEMBER_UNOWN)
  const pal = narcEntry(narc, MEMBER_PALETTE)
  if (!font || !pal) throw new Error('글꼴 아카이브에 안농 글꼴이나 글 팔레트가 없다')
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength)
  const headerSize = view.getUint32(0, true)
  const widthsAt = view.getUint32(4, true)
  const numGlyphs = view.getUint32(8, true)
  if (font[14] !== 2 || font[15] !== 2) throw new Error(`안농 글꼴이 16×16이 아니다 (${String(font[14])}×${String(font[15])})`)
  if (String.fromCharCode(...pal.subarray(0, 4)) !== 'RLCN') throw new Error('글 팔레트가 NCLR이 아니다')
  const palView = new DataView(pal.buffer, pal.byteOffset, pal.byteLength)
  const ink: Rgb = color(palView.getUint16(0x28 + INK * 2, true))
  const shadow: Rgb = color(palView.getUint16(0x28 + SHADOW * 2, true))
  const { chars } = charmap()

  const glyphs: { g: number, char: string, width: number }[] = []
  for (let g = 0; g < numGlyphs; g++) {
    const width = font[widthsAt + g]!
    if (width === 0) continue
    const char = chars.get(g + 1)
    if (char === undefined || char === '' || char.length !== 1) continue
    glyphs.push({ g, char, width })
  }
  if (glyphs.length === 0) throw new Error('안농 글꼴에 글자가 하나도 없다')
  check(ctx)

  const width = glyphs.length * GLYPH
  const rgba = new Uint8Array(width * GLYPH * 4)
  const px = new Uint8Array(GLYPH * GLYPH)
  let solid = 0
  glyphs.forEach(({ g }, i) => {
    const at = headerSize + g * TILE_BYTES * 4
    tile(font, at, px, 0, 0)
    tile(font, at + TILE_BYTES, px, 8, 0)
    tile(font, at + TILE_BYTES * 2, px, 0, 8)
    tile(font, at + TILE_BYTES * 3, px, 8, 8)
    for (let y = 0; y < GLYPH; y++) {
      for (let x = 0; x < GLYPH; x++) {
        const v = px[y * GLYPH + x]
        if (v !== INK && v !== SHADOW) continue
        const c = v === INK ? ink : shadow
        const o = (y * width + i * GLYPH + x) * 4
        rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255
        solid++
      }
    }
  })
  if (solid === 0) throw new Error('안농 글꼴이 비었다 — 글리프를 잘못 읽었다')

  return new Map([
    ['data/unownFont.png', await encodePng(rgba, width, GLYPH)],
    ['data/unownFont.json', json({ size: GLYPH, glyphs: glyphs.map(({ char, width: w }) => [char, w]) })],
  ])
}
