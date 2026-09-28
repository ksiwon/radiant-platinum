// 게임코너 슬롯머신의 그림 (PARITY §7.6 · DATA.md §2.34)
//
// ⚠️ **`src/import/platinum/slots.ts`와 한 줄씩 같아야 한다.** 머리말은 그쪽에 있다
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { TILE, TILE_BYTES, palettes, chars, screen, screenCell, cellBank, cellAnims, cellBox, drawCell } = require('./ntrcell')

const MEMBERS = 77
const SCREEN_W = 256
const SCREEN_H = 192
const BG_PALETTE = 3
const ONE_ROW_PALETTES = { m5: 5, m6: 6, m7: 7, l74: 74, l75: 75, l76: 76 }
const SLOT_SETS = [
  ['reels', 11, 10, 12, 13],
  ['mainDigits', 21, 20, 22, 23],
  ['sub6', 68, 67, 69, 70],
  // ⚠️ 7 · 8은 팔레트 **67**을, 9는 63을 쓴다 — 같은 번호의 NCLR이 옆에 있어도 앱이 싣는 짝은 이쪽이다 (`ov101_021D15BC`)
  ['sub7', 71, 67, 72, 73],
  ['subDigits8', 64, 67, 65, 66],
  ['subDigits9', 60, 63, 61, 62],
  ['over14', 14, 10, 15, 16],
  ['over17', 17, 10, 18, 19],
  ['notice24', 24, 27, 25, 26],
  ['notice28', 28, 31, 29, 30],
  ['notice32', 32, 35, 33, 34],
  ['notice36', 36, 39, 37, 38],
  ['notice40', 40, 43, 41, 42],
  ['anim44', 44, 47, 45, 46],
  // 삐삐 셋 — 연출 갈래 0 · 1 · 2 (`ov101_021D59AC.c`의 표). 셋째는 첫째 그림에 팔레트 55를 입힌 것이다
  ['clefairy0', 48, 51, 49, 50],
  ['clefairy1', 52, 51, 53, 54],
  ['clefairy2', 48, 55, 49, 50],
  ['anim56', 56, 59, 57, 58],
]
const ATLAS_W = 512

function indexBg(rgba, oy, tiles, scr) {
  for (let cy = 0; cy < SCREEN_H / TILE; cy++) {
    for (let cx = 0; cx < SCREEN_W / TILE; cx++) {
      const cell = screenCell(scr, cx, cy)
      const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      const row = cell >> 12
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
          const byte = tiles[tile * TILE_BYTES + sy * 4 + (sx >> 1)] ?? 0
          const idx = sx & 1 ? byte >> 4 : byte & 0xf
          if (idx === 0) continue
          const at = ((oy + cy * TILE + y) * SCREEN_W + cx * TILE + x) * 4
          rgba[at] = idx; rgba[at + 1] = row; rgba[at + 2] = 0; rgba[at + 3] = 255
        }
      }
    }
  }
}

function raw555(buf, rows) {
  const count = Math.min(rows, Math.max(1, Math.floor(buf.readUInt32LE(0x20) / 32)))
  return Array.from({ length: count }, (_, r) =>
    Array.from({ length: 16 }, (_, i) => buf.readUInt16LE(0x28 + (r * 16 + i) * 2)))
}

function main() {
  const narc = openRom().narc('/data/slot.narc')
  if (narc.length !== MEMBERS) throw new Error(`슬롯 아카이브가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)

  const bg = new Uint8Array(SCREEN_W * SCREEN_H * 3 * 4)
  indexBg(bg, 0, chars(narc[0]), screen(narc[1]))
  indexBg(bg, SCREEN_H, chars(narc[8]), screen(narc[9]))
  indexBg(bg, SCREEN_H * 2, chars(narc[2]), screen(narc[4]))

  const pal = {
    bg: raw555(narc[BG_PALETTE], 16),
    ...Object.fromEntries(Object.entries(ONE_ROW_PALETTES).map(([k, m]) => [k, raw555(narc[m], 1)[0]])),
  }

  const banks = SLOT_SETS.map(([, g, p, c, a]) => ({
    tiles: chars(narc[g]), pals: palettes(narc[p]), bank: cellBank(narc[c]), anims: cellAnims(narc[a]),
  }))
  const placed = []
  let x = 0, y = 0, row = 0
  banks.forEach((b, set) => {
    b.bank.cells.forEach((oams, cell) => {
      const [, , w, h] = cellBox(oams)
      if (x + w > ATLAS_W) { x = 0; y += row; row = 0 }
      placed.push({ set, cell, w, h, x, y })
      x += w
      row = Math.max(row, h)
    })
  })
  const atlasH = y + row
  const atlas = new Uint8Array(ATLAS_W * atlasH * 4)
  for (const p of placed) {
    const b = banks[p.set]
    drawCell(atlas, ATLAS_W, p.x, p.y, b.bank.cells[p.cell], b.tiles, b.pals)
  }
  const sets = {}
  SLOT_SETS.forEach(([name], set) => {
    const b = banks[set]
    sets[name] = {
      cells: placed.filter((p) => p.set === set).map((p) => {
        const [ox, oy] = cellBox(b.bank.cells[p.cell])
        return [p.x, p.y, p.w, p.h, ox, oy]
      }),
      anims: b.anims.map((a) => ({ loop: a.loop, mode: a.mode, frames: a.frames })),
    }
  })

  fs.writeFileSync(path.join(ROOT, 'public/data/slotBg.png'), encodePng(bg, SCREEN_W, SCREEN_H * 3))
  fs.writeFileSync(path.join(ROOT, 'public/data/slotSprites.png'), encodePng(atlas, ATLAS_W, atlasH))
  writeJson('slotSprites.json', { width: ATLAS_W, height: atlasH, palettes: pal, sets })
  for (const stale of ['slotMain.png', 'slotSub.png']) {
    const f = path.join(ROOT, 'public/data', stale)
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }
  console.log(`슬롯 — 배경 번호 판 셋 · 스프라이트 ${placed.length}칸 (${ATLAS_W}×${atlasH})`)
}

main()
