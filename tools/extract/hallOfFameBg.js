// 명예의 전당 배경 (PARITY §8.11 · `cutscenes/hall_of_fame.c` 690~703 · 509)
//
//   /graphic/dendou_demo.narc  3 타일(BG2 · BG3가 같이 쓴다) · 4 팔레트 세 줄(0x60)
//                              0 BG3 배치 — 한 마리씩 · 1 BG3 배치 — 파티와 주인공 · 2 BG2 배치
//
// 256×576 한 장으로 굽는다 — 위에서부터 BG3(판 0) · BG3(판 1) · BG2. BG3은 뒤판이라 0번 색 자리에 뒤판색을 깔고,
// BG2는 0번 색을 뚫는다. 원작은 밝은 창(`G2_SetWnd0Position`) 안에서 BG2만 빼므로(`GX_WND_PLANEMASK_ALL ^ BG2`)
// 창 안에는 BG3이, 밖에는 BG2가 그 위에 보인다.
//
// ⚠️ **`src/import/platinum/hallOfFameBg.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { TILE, TILE_BYTES, lz77, palettes, chars, screen, screenCell } = require('./ntrcell')

const W = 256
const H = 192
const MEMBERS = 5
const TILES = 3
const PALETTE = 4
const MAPS = [0, 1, 2]

function drawBg(rgba, oy, tiles, scr, pals, backdrop) {
  for (let cy = 0; cy < H / TILE; cy++) {
    for (let cx = 0; cx < W / TILE; cx++) {
      const cell = screenCell(scr, cx, cy)
      const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      const pal = pals[cell >> 12] ?? []
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
          const byte = tiles[tile * TILE_BYTES + sy * 4 + (sx >> 1)] ?? 0
          const idx = sx & 1 ? byte >> 4 : byte & 0xf
          const at = ((oy + cy * TILE + y) * W + cx * TILE + x) * 4
          const c = idx === 0 ? backdrop : pal[idx]
          if (!c) continue
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
        }
      }
    }
  }
}

function main() {
  const narc = openRom().narc('/graphic/dendou_demo.narc')
  if (narc.length !== MEMBERS) throw new Error(`dendou_demo가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const pals = palettes(narc[PALETTE])
  const tiles = chars(lz77(narc[TILES]))
  const rgba = new Uint8Array(W * H * MAPS.length * 4)
  MAPS.forEach((m, i) => {
    // BG3 두 판은 뒤판색을 깐다 · BG2는 뚫는다
    drawBg(rgba, i * H, tiles, screen(lz77(narc[m])), pals, i < 2 ? pals[0][0] : null)
  })
  fs.writeFileSync(path.join(ROOT, 'public/data/hallOfFameBg.png'), encodePng(rgba, W, H * MAPS.length))
  console.log(`명예의 전당 배경 — ${W}×${H * MAPS.length}`)
}

main()
