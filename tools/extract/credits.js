// 크레딧 배경 세 장 (DATA.md §2.26)
//
// 엔딩이 흐르는 동안 뒤에 서 있는 그림이다. 없으면 크레딧이 검은 판 위의
// 글자만 된다.
//
// graphic/ending.narc의 파일 셋이 배경 한 장이다 (`overlay099/ov99_021D1A54.c`):
//
//   팔레트 18+k   타일 9+k   배치 3+k     (위 화면)
//
// ⚠️ **위 화면 것만 쓴다.** 아래 화면(팔레트 21+k · 타일 12+k · 배치 6+k)에도
// 같은 하늘이 깔리는데, 그쪽은 **3D 장면이 그 위에 서는 판**이다
// (`gSystem.whichScreenIs3D = DS_SCREEN_SUB`). 두 장을 위아래로 이어 붙이면
// 하늘이 두 번 나오는 그림이 된다. 그 3D 장면 일곱은 아직 없다 (PARITY §8.12).
//
// ⚠️ **팔레트가 한 파일에 여럿이다.** 16색짜리 두세 벌이 들어 있고 어느 벌을
// 쓸지는 **배치 칸의 위 4비트**가 정한다 — 한 벌만 읽으면 그림 절반이 딴 색이 된다.
//
// ⚠️ **장마다 크기가 다르고 그래서 파일도 따로다.** 첫 장이 512×256이고 나머지
// 둘이 256×256인데, 화면(256×192)보다 큰 것은 **흐르라고** 그렇다 — 화면이 이
// 그림을 감아 돌려야 하므로(`background-repeat`) 한 장에 모아 두면 옆 장이
// 딸려 나온다.
//
// ⚠️ **아래쪽이 넓게 한 색인 것은 원작 그림 그대로다.** 하늘이 위 96픽셀이고
// 나머지는 단색인데, 원작은 그 위로 사람 스프라이트가 지나간다
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')

const TILE = 8
/** 장수. 일곱 장면이 이 셋을 돌려 쓴다 */
const COUNT = 3
/** 위 화면의 첫 파일 번호 — 팔레트·타일·배치 */
const TOP = { pal: 18, chr: 9, scr: 3 }

/** LZ77(0x10). 안 눌린 것은 그대로 돌려준다 */
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

/** NCLR. 16색 벌이 여럿이라 한 줄로 이어 담는다 — 벌 번호 × 16이 첫 색이다 */
function palette(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  const size = buf.readUInt32LE(0x20)
  const out = []
  for (let i = 0; i < size / 2; i++) out.push(color(buf.readUInt16LE(0x28 + i * 2)))
  return out
}

/** NCGR 4bpp 타일. `bpp` 칸 3이 4bpp다 */
function chars(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const bpp = buf.readUInt32LE(0x1c)
  if (bpp !== 3) throw new Error(`4bpp가 아니다 (bpp 칸 ${bpp})`)
  const size = buf.readUInt32LE(0x28)
  return { data: buf.subarray(0x30, 0x30 + size), tiles: size / 32 }
}

/** NSCR 배치. 한 칸이 u16 — 아래 10비트가 타일, 뒤집기 둘, 위 4비트가 팔레트 벌 */
function screen(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RCSN') throw new Error('NSCR이 아니다')
  const width = buf.readUInt16LE(0x18) / TILE, height = buf.readUInt16LE(0x1a) / TILE
  const cells = []
  for (let i = 0; i < width * height; i++) cells.push(buf.readUInt16LE(0x24 + i * 2))
  return { width, height, cells }
}

/** 배치 한 판을 통째로 rgba 버퍼의 (ox, oy)에 찍는다 */
function paint(rgba, stride, ox, oy, { pal, chr, scr }) {
  for (let cy = 0; cy < scr.height; cy++) {
    for (let cx = 0; cx < scr.width; cx++) {
      const cell = scr.cells[cy * scr.width + cx]
      const tile = cell & 0x3ff
      const hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      const bank = ((cell >> 12) & 0xf) * 16
      const tx = cx * TILE, ty = cy * TILE
      for (let i = 0; i < TILE * TILE; i++) {
        const byte = chr.data[tile * 32 + (i >> 1)]
        const idx = i & 1 ? byte >> 4 : byte & 0xf
        const px = i & 7, py = i >> 3
        const x = hflip ? TILE - 1 - px : px
        const y = vflip ? TILE - 1 - py : py
        const rgb = pal[bank + idx] ?? [0, 0, 0]
        const at = ((oy + ty + y) * stride + ox + tx + x) * 4
        rgba[at] = rgb[0]; rgba[at + 1] = rgb[1]; rgba[at + 2] = rgb[2]; rgba[at + 3] = 255
      }
    }
  }
}

function half(narc, base, k) {
  return {
    pal: palette(lz77(narc[base.pal + k])),
    chr: chars(lz77(narc[base.chr + k])),
    scr: screen(lz77(narc[base.scr + k])),
  }
}

function main() {
  const narc = openRom().narc('/graphic/ending.narc')

  const sheets = []
  for (let k = 0; k < COUNT; k++) sheets.push(half(narc, TOP, k))

  const sizes = sheets.map((s) => ({ w: s.scr.width * TILE, h: s.scr.height * TILE }))
  for (const [k, size] of sizes.entries()) {
    if (size.w < 256 || size.h < 192) {
      throw new Error(`${k}장째가 ${size.w}×${size.h}픽셀이다 — 화면보다 작다`)
    }
  }

  let bytes = 0
  for (const [k, sheet] of sheets.entries()) {
    const { w, h } = sizes[k]
    const rgba = new Uint8Array(w * h * 4)
    paint(rgba, w, 0, 0, sheet)
    const png = encodePng(rgba, w, h)
    fs.writeFileSync(path.join(ROOT, `public/data/credits${String(k)}.png`), png)
    bytes += png.length
  }

  const meta = writeJson('credits.json', { count: COUNT, scenes: sizes })
  console.log(
    `크레딧 배경 ${COUNT}장 → public/data/credits0..${String(COUNT - 1)}.png ` +
    `(${(bytes / 1024).toFixed(1)}KB) · ${meta.rel}`,
  )
  console.log(`  ${sizes.map((s) => `${s.w}×${s.h}`).join(' · ')}`)
}

if (require.main === module) main()
