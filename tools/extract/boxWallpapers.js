// 박스 벽지 (DATA.md §2.20)
//
// 보관 시스템의 배경이다. 박스마다 다른 그림이 깔리는 것이 원작에서 박스를
// 구분하는 가장 큰 신호라, 이걸 안 뽑으면 화면이 "회색 판 열여덟 개"가 된다.
//
// graphic/box.narc의 파일 세 개가 벽지 한 장이다 (`Unk_ov19_021E0178`):
//
//   28 + n*3  NCLR  16색. 압축 안 됨
//   29 + n*3  NCGR  LZ77. 21×20 타일 = 168×160 픽셀
//   30 + n*3  NSCR  LZ77. 같은 21×20 칸의 타일 배치
//
// 벽지는 32장이다. 앞 16장이 처음부터 있고(박스 18개가 이 16장을 돌려 쓴다)
// 뒤 16장은 원작에서 조건을 채워야 열린다.
//
// ⚠️ 위 21×4 타일은 **박스 이름이 찍히는 자리**다. 원작은 그림 위에 글자를
// 직접 그려 넣는다(`ov19_021D7C58`이 Window를 그 픽셀에 얹는다). 우리는 이름을
// HTML로 얹으므로 그림은 그대로 두고 글자만 그 자리에 올린다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')

const TILE = 8
/** 벽지 장수와 첫 파일 번호. 셋씩 묶여 있다 */
const COUNT = 32
const FIRST = 28
/** 아틀라스 가로 장수. 32장을 8×4로 놓는다 */
const COLS = 8

/** LZ77(0x10). NDS 그래픽이 거의 이 압축이다 */
function lz77(src) {
  if (src[0] !== 0x10) throw new Error(`LZ77이 아니다 (머리 0x${src[0].toString(16)})`)
  const size = src[1] | (src[2] << 8) | (src[3] << 16)
  const out = Buffer.alloc(size)
  let o = 0, p = 4
  while (o < size) {
    const flags = src[p++]
    for (let i = 0; i < 8 && o < size; i++) {
      if (flags & (0x80 >> i)) {
        const b1 = src[p++], b2 = src[p++]
        const len = (b1 >> 4) + 3
        let s = o - (((b1 & 0xf) << 8) | b2) - 1
        for (let j = 0; j < len; j++) out[o++] = out[s++]
      } else {
        out[o++] = src[p++]
      }
    }
  }
  return out
}

function color(v) {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

/** NCLR 16색. TTLP 절의 자료는 0x28부터다 */
function palette(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  const out = []
  for (let i = 0; i < 16; i++) out.push(color(buf.readUInt16LE(0x28 + i * 2)))
  return out
}

/** NCGR 4bpp 타일. RAHC 절이 타일 수를 들고 있다 */
function chars(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const tilesY = buf.readUInt16LE(0x18), tilesX = buf.readUInt16LE(0x1a)
  const size = buf.readUInt32LE(0x28)
  const data = buf.subarray(0x30, 0x30 + size)
  if (data.length !== tilesX * tilesY * 32) {
    throw new Error(`타일 ${tilesX}×${tilesY}인데 자료가 ${data.length}바이트다`)
  }
  return { tilesX, tilesY, data }
}

/** NSCR 배치. 한 칸이 u16이고 아래 10비트가 타일 번호다 */
function screen(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RCSN') throw new Error('NSCR이 아니다')
  const width = buf.readUInt16LE(0x18) / TILE, height = buf.readUInt16LE(0x1a) / TILE
  const cells = []
  for (let i = 0; i < width * height; i++) cells.push(buf.readUInt16LE(0x24 + i * 2))
  return { width, height, cells }
}

function main() {
  const narc = openRom().narc('/graphic/box.narc')

  const sheets = []
  for (let n = 0; n < COUNT; n++) {
    const pal = palette(narc[FIRST + n * 3])
    const chr = chars(lz77(narc[FIRST + n * 3 + 1]))
    const scr = screen(lz77(narc[FIRST + n * 3 + 2]))
    sheets.push({ pal, chr, scr })
  }

  const w = sheets[0].scr.width, h = sheets[0].scr.height
  for (const [n, s] of sheets.entries()) {
    if (s.scr.width !== w || s.scr.height !== h) {
      throw new Error(`벽지 ${n}장째가 ${s.scr.width}×${s.scr.height}칸이다 — 앞과 다르다`)
    }
  }

  const cellW = w * TILE, cellH = h * TILE
  const rows = Math.ceil(COUNT / COLS)
  const width = COLS * cellW, height = rows * cellH
  const rgba = new Uint8Array(width * height * 4)

  let flipped = 0
  for (const [n, { pal, chr, scr }] of sheets.entries()) {
    const ox = (n % COLS) * cellW, oy = Math.floor(n / COLS) * cellH
    for (let c = 0; c < scr.cells.length; c++) {
      const cell = scr.cells[c]
      const tile = cell & 0x3ff
      const hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      if (hflip || vflip) flipped++
      const tx = (c % scr.width) * TILE, ty = Math.floor(c / scr.width) * TILE
      for (let i = 0; i < TILE * TILE; i++) {
        const byte = chr.data[tile * 32 + (i >> 1)]
        const idx = i & 1 ? byte >> 4 : byte & 0xf
        const px = i & 7, py = i >> 3
        const x = hflip ? TILE - 1 - px : px
        const y = vflip ? TILE - 1 - py : py
        const [r, g, b] = pal[idx]
        const at = ((oy + ty + y) * width + ox + tx + x) * 4
        rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; rgba[at + 3] = 255
      }
    }
  }

  const png = encodePng(rgba, width, height)
  fs.writeFileSync(path.join(ROOT, 'public/data/boxWallpapers.png'), png)
  const meta = writeJson('boxWallpapers.json', {
    count: COUNT, cols: COLS, rows, width: cellW, height: cellH,
  })
  console.log(
    `박스 벽지 ${COUNT}장 → public/data/boxWallpapers.png ` +
    `(${width}×${height}, ${(png.length / 1024).toFixed(1)}KB) · ${meta.rel}`,
  )
  console.log(`  한 장 ${cellW}×${cellH} · 뒤집힌 칸 ${flipped}`)
}

main()
