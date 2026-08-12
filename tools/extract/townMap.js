// 타운맵 — 신오 지도 한 장 (DATA.md · PARITY §5)
//
// 공중날기 화면이 목록이 아니라 **지도** 위에서 일어나는 것이 원작이다. 지도를
// 안 뽑으면 그 화면을 지어내야 하고, 지어낸 신오는 신오가 아니다.
//
// `graphic/tmap_gra.narc`의 멤버 차례는 `res/graphics/town_map/…order`에 있다
// (0부터 센다):
//
//    0  top_screen_map.NCLR            256색 — 16색 팔레트 여러 벌
//   19  top_screen_map_tiles.NCGR      LZ77. 위 화면이 쓰는 타일 전부
//   22  top_screen_region_bg_tilemap.NSCR   32×24칸 — **뒤 판** (BG_LAYER_MAIN_3)
//   24  top_screen_region_map_tilemap.NSCR  32×24칸 — **앞 판** (BG_LAYER_MAIN_2)
//
// ⚠️ **두 판을 겹쳐야 지도가 된다.** 뒤 판이 바다와 테두리고 앞 판이 육지다 —
// 하나만 그리면 신오가 바다에 잠기거나 허공에 뜬다. NDS는 층 번호가 클수록
// 뒤라서 3을 먼저 깔고 2를 얹는다.
//
// ⚠️ 앞 판의 **색 0은 비침**이다. 그냥 칠하면 육지 판이 바다를 통째로 덮는다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { parseMatrix } = require('./maps')
const { extractHeaders } = require('./headers')

const TILE = 8
/** `res/graphics/town_map/town_map_graphics.order`의 줄 번호 − 1 */
const MEMBER = { palette: 0, tiles: 19, bgMap: 22, landMap: 24 }
/** 위 화면 한 장 (`HW_LCD_WIDTH` × `HW_LCD_HEIGHT`) */
const COLS = 32
const ROWS = 24

/** LZ77(0x10). 압축이 안 된 멤버도 있어서 머리를 보고 넘긴다 */
function lz77(src) {
  if (src[0] !== 0x10) return src
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

/**
 * NCLR. 몇 벌인지는 자료 길이가 말한다 — 16색 한 벌이 32바이트다.
 *
 * ⚠️ 한 벌만 읽으면 안 된다. NSCR 한 칸의 위 4비트가 **몇 번째 벌인지**라,
 * 한 벌로 그리면 육지·바다·글씨가 전부 같은 색조로 뭉친다
 */
function palettes(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  const bytes = buf.readUInt32LE(0x20)
  const count = Math.floor(bytes / 32)
  const out = []
  for (let p = 0; p < count; p++) {
    const one = []
    for (let i = 0; i < 16; i++) one.push(color(buf.readUInt16LE(0x28 + p * 32 + i * 2)))
    out.push(one)
  }
  return out
}

/** NCGR 4bpp 타일 */
function chars(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const size = buf.readUInt32LE(0x28)
  return buf.subarray(0x30, 0x30 + size)
}

/** NSCR 배치. 한 칸이 u16 — 아래 10비트 타일 · 0x400 좌우 · 0x800 상하 · 위 4비트 팔레트 */
function screen(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RCSN') throw new Error('NSCR이 아니다')
  const width = buf.readUInt16LE(0x18) / TILE
  const height = buf.readUInt16LE(0x1a) / TILE
  const cells = []
  for (let i = 0; i < width * height; i++) cells.push(buf.readUInt16LE(0x24 + i * 2))
  return { width, height, cells }
}

/**
 * 판 하나를 픽셀에 얹는다.
 *
 * `opaque`가 거짓이면 색 0을 **안 칠한다** — 앞 판이 그렇다
 */
function draw(rgba, width, scr, tiles, pals, opaque) {
  let painted = 0
  for (let c = 0; c < scr.cells.length; c++) {
    const cell = scr.cells[c]
    const tile = cell & 0x3ff
    const hflip = (cell & 0x400) !== 0
    const vflip = (cell & 0x800) !== 0
    const pal = pals[(cell >> 12) & 0xf] ?? pals[0]
    const tx = (c % scr.width) * TILE
    const ty = Math.floor(c / scr.width) * TILE
    for (let i = 0; i < TILE * TILE; i++) {
      const byte = tiles[tile * 32 + (i >> 1)] ?? 0
      const idx = i & 1 ? byte >> 4 : byte & 0xf
      if (idx === 0 && !opaque) continue
      const px = i & 7, py = i >> 3
      const x = hflip ? TILE - 1 - px : px
      const y = vflip ? TILE - 1 - py : py
      const [r, g, b] = pal[idx]
      const at = ((ty + y) * width + tx + x) * 4
      rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; rgba[at + 3] = 255
      painted++
    }
  }
  return painted
}

/**
 * `data/tmap_block.dat` — 격자 칸 하나가 어느 곳인지 (`TownMap_ReadBlocks`).
 *
 * 머리에 `int` 하나로 개수가 있고 그다음 `TownMapBlock` 배열이다. 구조체는
 * u16 열둘(24바이트)이고 마지막 `index`는 파일이 아니라 코드가 채운다.
 *
 * ⚠️ 이게 없으면 커서 아래에 **이름을 못 띄운다.** 지도 그림만으로는 그 칸이
 * 어느 도로인지 알 수 없다 — 원작도 이 표를 보고 이름을 찾는다
 */
function blocks(buf) {
  const count = buf.readInt32LE(0)
  const out = []
  for (let i = 0; i < count; i++) {
    const at = 4 + i * 24
    out.push({
      x: buf.readUInt16LE(at),
      z: buf.readUInt16LE(at + 2),
      /** 이 칸의 이름 (`TEXT_BANK_TOWN_MAP`) */
      area: buf.readUInt16LE(at + 8),
      /** 그 안의 이름난 자리 — 없으면 0 */
      landmark: buf.readUInt16LE(at + 10),
      /** 0이 아니면 그 깃발을 세워야 보인다 (`hiddenLocationFlags`) */
      hidden: buf.readUInt16LE(at + 20),
    })
  }
  return out
}

/**
 * 격자 칸 → 지역명 번호.
 *
 * ⚠️ **칸의 `areaDescString`은 이름이 아니라 설명이다.** ("어린잎의 숨결이…")
 * 이름은 원작도 따로 읽는다 — 행렬 0의 그 칸에 놓인 맵의 `label`이고, 그것이
 * `TEXT_BANK_LOCATION_NAMES`를 가리킨다. 여기서 미리 이어 두면 화면이 행렬을
 * 통째로 받지 않아도 된다
 */
function labelsOfGrid(rom) {
  const matrix = parseMatrix(rom.narc('/fielddata/mapmatrix/map_matrix.narc')[0])
  const { maps } = extractHeaders(rom)
  return (x, z) => {
    const at = matrix.headers ? matrix.headers[z * matrix.width + x] : undefined
    if (at === undefined) return { map: -1, label: 0 }
    return { map: at, label: maps[at]?.label ?? 0 }
  }
}

function main() {
  const rom = openRom()
  const narc = rom.narc('/graphic/tmap_gra.narc')
  const labelAt = labelsOfGrid(rom)
  const cells = blocks(rom.read('/data/tmap_block.dat')).map((c) => ({
    ...c, ...labelAt(c.x, c.z),
  }))
  const pals = palettes(lz77(narc[MEMBER.palette]))
  const tiles = chars(lz77(narc[MEMBER.tiles]))
  const bg = screen(lz77(narc[MEMBER.bgMap]))
  const land = screen(lz77(narc[MEMBER.landMap]))

  for (const [name, s] of [['뒤 판', bg], ['앞 판', land]]) {
    if (s.width < COLS || s.height < ROWS) {
      throw new Error(`${name}이 ${s.width}×${s.height}칸이다 — 화면 ${COLS}×${ROWS}보다 작다`)
    }
  }

  const width = COLS * TILE, height = ROWS * TILE
  const rgba = new Uint8Array(width * height * 4)
  // ⚠️ 차례가 자료다. 뒤 판(층 3) → 앞 판(층 2)
  const under = draw(rgba, width, bg, tiles, pals, true)
  const over = draw(rgba, width, land, tiles, pals, false)

  const png = encodePng(rgba, width, height)
  fs.writeFileSync(path.join(ROOT, 'public/data/townMap.png'), png)
  const meta = writeJson('townMap.json', {
    width, height,
    /** `TOWN_MAP_GRID_SPACING`과 그 원점 (`applications/town_map/defs.h`) */
    grid: 7, originX: 25, originY: -34,
    palettes: pals.length,
    cells,
  })
  const named = cells.filter((c) => c.label !== 0).length
  console.log(
    `타운맵 ${width}×${height} · 팔레트 ${pals.length}벌 · ` +
    `뒤 ${under}px + 앞 ${over}px → public/data/townMap.png ` +
    `(${(png.length / 1024).toFixed(1)}KB)`,
  )
  console.log(`  격자 칸 ${cells.length}개 (지역명이 붙은 칸 ${named}) · ${meta.rel}`)
}

if (require.main === module) main()
