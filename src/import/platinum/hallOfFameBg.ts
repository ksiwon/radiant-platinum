// 명예의 전당 배경 — 브라우저에서 (PARITY §8.11)
//
// ⚠️ **`tools/extract/hallOfFameBg.js`와 한 줄씩 같아야 한다.** 머리말(판 셋의 짝과 창)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import type { Rgb } from './nitrotex'
import { chars, maybeLz77, palettes, screen, screenCell, TILE, TILE_BYTES } from './ntrgfx'
import { encodePng } from './png'
import { check, type ConvertContext, type Produced } from './convertTypes'

const W = 256
const H = 192
const MEMBERS = 5
const TILES = 3
const PALETTE = 4
const MAPS = [0, 1, 2] as const

function drawBg(
  rgba: Uint8Array, oy: number, tiles: Uint8Array, scr: ReturnType<typeof screen>,
  pals: readonly (readonly Rgb[])[], backdrop: Rgb | null,
): void {
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

export async function convertHallOfFameBg(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/graphic/dendou_demo.narc')
  if (!narc) throw new Error('dendou_demo.narc을 못 읽었다')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`dendou_demo가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`dendou_demo에 ${String(at)}번 칸이 없다`)
    return b
  }
  const pals = palettes(take(PALETTE))
  const tiles = chars(maybeLz77(take(TILES))).data
  const rgba = new Uint8Array(W * H * MAPS.length * 4)
  MAPS.forEach((m, i) => {
    // BG3 두 판은 뒤판색을 깐다 · BG2는 뚫는다
    drawBg(rgba, i * H, tiles, screen(maybeLz77(take(m))), pals, i < 2 ? pals[0]![0]! : null)
  })
  check(ctx)
  return new Map([['data/hallOfFameBg.png', await encodePng(rgba, W, H * MAPS.length)]])
}
