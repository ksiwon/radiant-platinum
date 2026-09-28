// 게임코너 슬롯머신의 그림 — 브라우저에서 (PARITY §7.6 · DATA.md §2.34)
//
// `/data/slot.narc` 77칸에서 둘을 굽는다:
//
//   data/slotBg.png       배경 판 셋을 **색 번호 판**으로 — 256×576, 위에서부터 BG1(기계 틀) · BG2(릴 창 그늘) ·
//                         BG3(아래 화면 달밤). 빨강 = 팔레트 안 색 번호, 초록 = 팔레트 줄, 알파 0 = 뚫림
//   data/slotSprites.*    스프라이트 묶음마다 셀 그림과 애니 — 릴 기호 · 숫자판 · 삐삐 · 예고 · 등불
//                         json에는 팔레트(BGR555 그대로)도 같이 싣는다
//
// ⚠️ **왜 색이 아니라 번호인가.** 원작은 등불을 **팔레트 줄을 섞어** 켠다 — 이긴 줄은 BG1의 줄 2·3·12·4·11을
// 74 · 75 · 76번 팔레트 쪽으로, 멈춤 단추는 칸의 팔레트 번호를 5 → 6으로 바꾼다(`ov101_021D4F18` · `_58F4`).
// 아래 화면의 달밤도 줄 1이 팔레트 5 · 6 · 7 사이를 오간다. 색으로 구워 두면 그 어느 것도 못 한다.
//
// 묶음 번호(NCGR · NCLR · NCER · NANR)는 앱이 싣는 차례다 (`ov101_021D15BC`와 연출 쪽 `ov101_021D59AC.c`).
//
// ⚠️ **`tools/extract/slots.js`와 한 줄씩 같아야 한다.**
import { narcCount, narcEntry } from './nds'
import { chars, palettes, screen, screenCell, TILE, TILE_BYTES } from './ntrgfx'
import { cellAnims, cellBank, cellBox, drawCell } from './ntrcell'
import { encodePng } from './png'
import { check, json, type ConvertContext, type Produced } from './convertTypes'

const SLOT_NARC = '/data/slot.narc'
const MEMBERS = 77
const SCREEN_W = 256
const SCREEN_H = 192
const BG_PALETTE = 3
/** 팔레트 한 줄만 쓰는 것들 — 아래 화면 줄 1의 셋과 이긴 줄의 켬 셋 */
const ONE_ROW_PALETTES = { m5: 5, m6: 6, m7: 7, l74: 74, l75: 75, l76: 76 } as const

/** 묶음 — [이름, NCGR, NCLR, NCER, NANR] */
const SLOT_SETS: readonly (readonly [string, number, number, number, number])[] = [
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

/** 아틀라스 폭. 셀을 선반에 쌓는다 */
const ATLAS_W = 512

/** 판 하나를 색 번호 판의 `oy`줄부터 찍는다 */
function indexBg(rgba: Uint8Array, oy: number, tiles: Uint8Array, scr: ReturnType<typeof screen>): void {
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

/** NCLR의 한 줄 이상을 BGR555 그대로 */
function raw555(buf: Uint8Array, rows: number): number[][] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const count = Math.min(rows, Math.max(1, Math.floor(v.getUint32(0x20, true) / 32)))
  return Array.from({ length: count }, (_, r) =>
    Array.from({ length: 16 }, (_, i) => v.getUint16(0x28 + (r * 16 + i) * 2, true)))
}

export async function convertSlots(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read(SLOT_NARC)
  if (!narc) throw new Error('slot.narc을 못 읽었다')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`슬롯 아카이브가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`슬롯 아카이브에 ${String(at)}번 칸이 없다`)
    return b
  }

  const bg = new Uint8Array(SCREEN_W * SCREEN_H * 3 * 4)
  indexBg(bg, 0, chars(take(0)).data, screen(take(1)))
  indexBg(bg, SCREEN_H, chars(take(8)).data, screen(take(9)))
  indexBg(bg, SCREEN_H * 2, chars(take(2)).data, screen(take(4)))
  check(ctx)

  const pal = {
    bg: raw555(take(BG_PALETTE), 16),
    ...Object.fromEntries(Object.entries(ONE_ROW_PALETTES).map(([k, m]) => [k, raw555(take(m), 1)[0]!])),
  }

  // ── 스프라이트 — 셀마다 경계 상자만 한 칸을 선반에 쌓는다 ─────────────────
  interface Placed { set: number, cell: number, w: number, h: number, x: number, y: number }
  const banks = SLOT_SETS.map(([, g, p, c, a]) => ({
    tiles: chars(take(g)).data, pals: palettes(take(p)), bank: cellBank(take(c)), anims: cellAnims(take(a)),
  }))
  const placed: Placed[] = []
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
    const b = banks[p.set]!
    drawCell(atlas, ATLAS_W, p.x, p.y, b.bank.cells[p.cell]!, b.tiles, b.pals)
  }
  check(ctx)
  const sets: Record<string, unknown> = {}
  SLOT_SETS.forEach(([name], set) => {
    const b = banks[set]!
    sets[name] = {
      cells: placed.filter((p) => p.set === set).map((p) => {
        const [ox, oy] = cellBox(b.bank.cells[p.cell]!)
        return [p.x, p.y, p.w, p.h, ox, oy]
      }),
      anims: b.anims.map((a) => ({ loop: a.loop, mode: a.mode, frames: a.frames })),
    }
  })

  return new Map([
    ['data/slotBg.png', await encodePng(bg, SCREEN_W, SCREEN_H * 3)],
    ['data/slotSprites.png', await encodePng(atlas, ATLAS_W, atlasH)],
    ['data/slotSprites.json', json({ width: ATLAS_W, height: atlasH, palettes: pal, sets })],
  ])
}
