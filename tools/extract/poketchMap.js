// 포켓치 지도 화면과 액정 팔레트 (DATA.md §2.28)
//
// 마킹맵과 나무열매탐색기가 같은 신오 지도 위에 점을 찍는다. 그 지도는 우리가
// 그린 것이 아니라 `graphic/poketch.narc` 안의 타일맵이다:
//
//   115  marking_map.NSCR      32×24칸
//   116  berry_searcher.NSCR   같은 지도 + 아래쪽에 열매 표시 3×2칸 (여섯 칸만 다르다)
//   117  map_bg_tiles.NCGR     27×4타일 = 108장, 4bpp
//     0  generic_bg_tiles.NCLR 액정 팔레트 열여섯 벌
//
// ⚠️ **액정은 네 단계다.** 팔레트 열여섯 칸 중 실제로 쓰는 것은 4·15·8·1
// 넷뿐이고 나머지는 흰색으로 채워져 있다. 밝은 쪽부터 4 → 15 → 8 → 1이며,
// 화면의 **바탕이 제일 밝은 4번**이다 (실측: 지도 한 장 49,152픽셀 중 4번이
// 42,180개 · 15번 2,712 · 8번 4,144 · 1번 116). 우리 색은 손으로 고른 두
// 단계였고 **명암이 뒤집혀 있었다** — 어두운 바탕에 밝은 글씨였는데 원작은
// 밝은 바탕에 어두운 글씨다.
//
// ⚠️ **한 색이 팔레트 두 벌을 쓴다** (`SLOTS_PER_POKETCH_THEME`이 u16 서른둘).
// 앞이 보통, 뒤가 백라이트다 — 우리는 백라이트를 안 켜므로 앞만 쓴다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')

const TILE = 8
/** `graphic/poketch.narc` 안 자리. `poketch.order`의 줄 번호 − 1이다 */
const MEMBER = { palette: 0, marking: 115, berry: 116, tiles: 117 }
const MAPS = ['marking', 'berry']
/** 액정 색 여덟 가지 (`NUM_POKETCH_THEMES`) */
const THEMES = 8
/** 한 색이 쓰는 팔레트 벌 수 — 보통과 백라이트 */
const PALETTES_PER_THEME = 2
/** 실제로 쓰는 칸. 밝은 쪽부터다 — 이 차례가 곧 액정의 명암 단계다 */
const SHADES = [4, 15, 8, 1]
const TILE_MASK = 0x3ff
const HFLIP = 0x400
const VFLIP = 0x800

/** LZ77(0x10) */
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

const rgb = (v) => {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}
const hex = (c) => `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`

/** NCLR — 팔레트 여러 벌. 0x20이 색 자료 크기다 */
function palettes(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  const count = Math.max(1, Math.floor(buf.readUInt32LE(0x20) / 32))
  return Array.from({ length: count }, (_, p) =>
    Array.from({ length: 16 }, (_, i) => rgb(buf.readUInt16LE(0x28 + (p * 16 + i) * 2))))
}

/** NCGR 4bpp */
function chars(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const size = buf.readUInt32LE(0x28)
  return buf.subarray(0x30, 0x30 + size)
}

/** NSCR. 한 칸이 u16이고 아래 10비트가 타일 번호다 */
function screen(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RCSN') throw new Error('NSCR이 아니다')
  const width = buf.readUInt16LE(0x18) / TILE, height = buf.readUInt16LE(0x1a) / TILE
  const cells = []
  for (let i = 0; i < width * height; i++) cells.push(buf.readUInt16LE(0x24 + i * 2))
  return { width, height, cells }
}

function drawTile(rgba, sheetW, ox, oy, data, tile, pal, hflip, vflip) {
  for (let i = 0; i < TILE * TILE; i++) {
    const byte = data[tile * 32 + (i >> 1)] ?? 0
    const idx = i & 1 ? byte >> 4 : byte & 0xf
    const px = i & 7, py = i >> 3
    const x = hflip ? TILE - 1 - px : px
    const y = vflip ? TILE - 1 - py : py
    const c = pal[idx]
    const at = ((oy + y) * sheetW + ox + x) * 4
    rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
  }
}

function main() {
  const narc = openRom().narc('/graphic/poketch.narc')
  const pal = palettes(narc[MEMBER.palette])
  if (pal.length < THEMES * PALETTES_PER_THEME) {
    throw new Error(`팔레트가 ${pal.length}벌이다 — 색 여덟에 열여섯이 있어야 한다`)
  }

  const tiles = chars(lz77(narc[MEMBER.tiles]))
  const screens = MAPS.map((name) => screen(lz77(narc[MEMBER[name]])))
  const cellsW = screens[0].width, cellsH = screens[0].height
  for (const [i, s] of screens.entries()) {
    if (s.width !== cellsW || s.height !== cellsH) throw new Error(`${MAPS[i]}가 ${s.width}×${s.height}칸이다`)
    const max = Math.max(...s.cells.map((c) => c & TILE_MASK))
    if (max >= tiles.length / 32) throw new Error(`${MAPS[i]}가 타일 ${max}번을 가리키는데 ${tiles.length / 32}장뿐이다`)
  }

  // 액정이 정말 네 단계인지 그림에서 확인한다 — 아니면 단계를 잘못 골랐다는 뜻이다
  const hist = new Array(16).fill(0)
  for (const s of screens) {
    for (const cell of s.cells) {
      const t = cell & TILE_MASK
      for (let i = 0; i < 64; i++) {
        const byte = tiles[t * 32 + (i >> 1)] ?? 0
        hist[i & 1 ? byte >> 4 : byte & 0xf]++
      }
    }
  }
  for (const [i, n] of hist.entries()) {
    if (n > 0 && !SHADES.includes(i)) throw new Error(`지도가 ${i}번 칸을 ${n}번 쓴다 — 네 단계가 아니다`)
  }

  const mapW = cellsW * TILE, mapH = cellsH * TILE
  const width = mapW * MAPS.length, height = mapH * THEMES
  const rgba = new Uint8Array(width * height * 4)
  for (let t = 0; t < THEMES; t++) {
    const theme = pal[t * PALETTES_PER_THEME]
    for (const [m, scr] of screens.entries()) {
      for (let c = 0; c < scr.cells.length; c++) {
        const cell = scr.cells[c]
        drawTile(
          rgba, width,
          m * mapW + (c % scr.width) * TILE, t * mapH + Math.floor(c / scr.width) * TILE,
          tiles, cell & TILE_MASK, theme,
          (cell & HFLIP) !== 0, (cell & VFLIP) !== 0,
        )
      }
    }
  }

  const png = encodePng(rgba, width, height)
  fs.writeFileSync(path.join(ROOT, 'public/data/poketchMap.png'), png)
  const meta = writeJson('poketchMap.json', {
    width: mapW, height: mapH, themes: THEMES, maps: MAPS,
    shades: Array.from({ length: THEMES }, (_, t) => SHADES.map((s) => hex(pal[t * PALETTES_PER_THEME][s]))),
  })

  console.log(
    `포켓치 지도 ${MAPS.length}장 × 색 ${THEMES} → public/data/poketchMap.png ` +
    `(${width}×${height}, ${(png.length / 1024).toFixed(1)}KB) · ${meta.rel}`,
  )
  console.log(`  한 장 ${mapW}×${mapH} · 명암 ${SHADES.map((s) => `${s}번 ${hist[s]}픽셀`).join(' · ')}`)
  console.log(`  색 0 = ${SHADES.map((s) => hex(pal[0][s])).join(' ')}`)
}

main()
