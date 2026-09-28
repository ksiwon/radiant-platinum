// 안농 글꼴 (PARITY §6.8 · `ScrCmd_MessageUnown`)
//
// 신수유적의 벽글 셋은 글 자체는 보통 글자다(「TOP RIGHT」 · 「?!」 · 일본판은 전각 로마자) —
// 원작은 그것을 **안농 글꼴**(`FONT_UNOWN`)로 찍어 안농 모양이 되게 한다. 우리 대사창은 글꼴 파일로 그리므로
// 그 글꼴을 그림으로 굽는다:
//
//   /graphic/pl_font.narc 3번 `font_unown.NFGR` — 머리 16바이트 · 글리프 509개(16×16 · 2비트) · 너비 표
//
// 글리프 자리는 **글자 코드 − 1**이다 (`FontManager_TryLoadGlyph`). 너비가 0인 자리는 글꼴에 없는 글자라 버리고,
// 남는 것을 글자표로 풀어 **글자 → 그림 칸**으로 적는다 — 대사창이 받는 것이 이미 풀린 글이기 때문이다.
//
// 색은 원작 글 팔레트(`font.NCLR`, 7번)의 1(글자) · 2(그림자)다. 0은 투명, 3은 창 바탕이라 안 칠한다
// (`Text_GenerateFontHalfRowLookupTable`: 0 투명 · 1 글자 · 2 그림자 · 3 바탕).
//
// ⚠️ **`src/import/platinum/unownFont.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { loadCharmap } = require('./message')

const CHARMAP = path.join(ROOT, 'tools/spike/charmap.txt')
/** `pl_font.order`의 차례 */
const MEMBER_UNOWN = 3
const MEMBER_PALETTE = 6
const GLYPH = 16
/** 8×8 칸 하나 = 2비트 × 64 = 16바이트. 16×16 글리프는 칸 넷(왼위 · 오른위 · 왼아래 · 오른아래) */
const TILE_BYTES = 16
const INK = 1
const SHADOW = 2

function color(v) {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

/**
 * 칸 하나를 편다. 행마다 u16 하나 — **윗바이트가 왼쪽 네 픽셀**이고, 바이트 안에서는 **윗 두 비트가 왼쪽**이다
 * (`Text_DecompressGlyph`가 `src16[r] >> 8`을 먼저 편다)
 */
function tile(buf, at, out, ox, oy) {
  for (let r = 0; r < 8; r++) {
    const halves = [buf[at + r * 2 + 1], buf[at + r * 2]]
    for (let h = 0; h < 2; h++) {
      for (let p = 0; p < 4; p++) {
        out[(oy + r) * GLYPH + ox + h * 4 + p] = (halves[h] >> (6 - p * 2)) & 3
      }
    }
  }
}

function main() {
  const narc = openRom().narc('/graphic/pl_font.narc')
  const font = narc[MEMBER_UNOWN]
  const numGlyphs = font.readUInt32LE(8)
  const widthsAt = font.readUInt32LE(4)
  const headerSize = font.readUInt32LE(0)
  if (font[14] !== 2 || font[15] !== 2) throw new Error(`안농 글꼴이 16×16이 아니다 (${font[14]}×${font[15]})`)
  const pal = narc[MEMBER_PALETTE]
  if (pal.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('글 팔레트가 NCLR이 아니다')
  const ink = color(pal.readUInt16LE(0x28 + INK * 2))
  const shadow = color(pal.readUInt16LE(0x28 + SHADOW * 2))
  const { chars } = loadCharmap(CHARMAP)

  const glyphs = []
  for (let g = 0; g < numGlyphs; g++) {
    const width = font[widthsAt + g]
    if (width === 0) continue
    const char = chars.get(g + 1)
    if (char === undefined || char === '' || char.length !== 1) continue
    glyphs.push({ g, char, width })
  }
  if (glyphs.length === 0) throw new Error('안농 글꼴에 글자가 하나도 없다')

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

  fs.writeFileSync(path.join(ROOT, 'public/data/unownFont.png'), encodePng(rgba, width, GLYPH))
  writeJson('unownFont.json', { size: GLYPH, glyphs: glyphs.map(({ char, width: w }) => [char, w]) })
  console.log(`안농 글꼴 — 글자 ${glyphs.length}개 · ${width}×${GLYPH}`)
}

main()
