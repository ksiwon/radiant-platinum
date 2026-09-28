// 가리키는 손 (포획 강좌 · `battle/indicator.c`)
//
//   /graphic/ev_pokeselect.narc  10 NCGR(4bpp · 16칸) · 11 NCLR · 12 NCER(셀 하나 · 32×32 · 가운데가 원점) · 13 NANR(한 장)
//
// `Indicator_LoadResources`가 팔레트 한 줄만 싣는다(`… 11, FALSE, 1, …`). 셀이 하나라 32×32 한 장으로 굽는다.
//
// ⚠️ **`src/import/platinum/pointerHand.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { lz77, palettes, chars, cellBank, cellBox, drawCell } = require('./ntrcell')

const MEMBERS = 18
const CHARS = 10
const PALETTE = 11
const CELLS = 12

function main() {
  const narc = openRom().narc('/graphic/ev_pokeselect.narc')
  if (narc.length !== MEMBERS) throw new Error(`ev_pokeselect가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const pals = palettes(lz77(narc[PALETTE])).slice(0, 1)
  const tiles = chars(lz77(narc[CHARS]))
  const { cells } = cellBank(narc[CELLS])
  if (cells.length !== 1) throw new Error(`손 셀이 ${cells.length}개다 — 하나라야 한다`)
  const [, , w, h] = cellBox(cells[0])
  const rgba = new Uint8Array(w * h * 4)
  if (drawCell(rgba, w, 0, 0, cells[0], tiles, pals) === 0) throw new Error('손이 비었다')
  fs.writeFileSync(path.join(ROOT, 'public/data/pointerHand.png'), encodePng(rgba, w, h))
  console.log(`가리키는 손 — ${w}×${h}`)
}

main()
