// 운하시티 도서관 3층의 텔레비전 뉴스 (`library_tv/library_tv.c` · PARITY §8)
//
//   /demo/intro/intro_tv.narc  1 · 4  BG0 텔레비전 틀 (4bpp)     2 · 5  BG1 주사선 (4bpp · 타일 하나)
//   /graphic/library_tv.narc   2 · 4  BG3 뉴스 그림 (8bpp)       3      팔레트 256색 — 셋이 같이 쓴다
//
// `Graphics_LoadPalette(library_tv, 3, 0, 0, …)`가 256색을 통째로 싣고, BG0 · BG1의 16색 판은 그 안의 줄을 쓴다.
// 0번 색은 검정이다(`Bg_MaskPalette(BG_LAYER_MAIN_0, 0x0)`). 256×640 한 장으로 굽는다 — 위에서부터
// BG3(192줄 · 0번 자리는 검정) · BG1(256줄 · 0번은 뚫는다 — 화면이 세로로 흘린다) · BG0(192줄 · 0번은 뚫는다).
// BG1은 BG2 · BG3 위에 4:12로 섞이고(`G2_SetBlendAlpha(BG1, BG2 | BG3, 4, 12)`) BG0이 맨 위다.
//
// ⚠️ **`src/import/platinum/libraryTv.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { TILE, lz77, palettes, chars, screen, screenCell } = require('./ntrcell')

const W = 256
const H = 192
const SCAN_H = 256

function draw(rgba, oy, rows, tiles, scr, bpp8, pal, opaque) {
  const bytes = bpp8 ? 64 : 32
  for (let cy = 0; cy < rows / TILE; cy++) {
    for (let cx = 0; cx < W / TILE; cx++) {
      const cell = screenCell(scr, cx, cy)
      const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      const row = bpp8 ? 0 : cell >> 12
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
          const at = tile * bytes + (bpp8 ? sy * 8 + sx : sy * 4 + (sx >> 1))
          const byte = tiles[at] ?? 0
          const idx = bpp8 ? byte : sx & 1 ? byte >> 4 : byte & 0xf
          const o = ((oy + cy * TILE + y) * W + cx * TILE + x) * 4
          if (idx === 0) {
            if (!opaque) continue
            rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = 255
            continue
          }
          const c = pal[row * 16 + idx] ?? [0, 0, 0]
          rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255
        }
      }
    }
  }
}

function main() {
  const rom = openRom()
  const tv = rom.narc('/demo/intro/intro_tv.narc')
  const lib = rom.narc('/graphic/library_tv.narc')
  if (tv.length !== 10 || lib.length !== 5) throw new Error(`intro_tv ${tv.length}칸 · library_tv ${lib.length}칸 — 10 · 5라야 한다`)
  const pal = palettes(lz77(lib[3])).flat()
  if (pal.length !== 256) throw new Error(`library_tv 팔레트가 ${pal.length}색이다 — 256이라야 한다`)
  pal[0] = [0, 0, 0]
  const rgba = new Uint8Array(W * (H + SCAN_H + H) * 4)
  draw(rgba, 0, H, chars(lz77(lib[2])), screen(lz77(lib[4])), true, pal, true)
  draw(rgba, H, SCAN_H, chars(lz77(tv[2])), screen(lz77(tv[5])), false, pal, false)
  draw(rgba, H + SCAN_H, H, chars(lz77(tv[1])), screen(lz77(tv[4])), false, pal, false)
  fs.writeFileSync(path.join(ROOT, 'public/data/libraryTv.png'), encodePng(rgba, W, H + SCAN_H + H))
  console.log(`도서관 TV — ${W}×${H + SCAN_H + H}`)
}

main()
