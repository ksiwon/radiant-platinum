// 운하시티 도서관의 텔레비전 뉴스 — 브라우저에서 (`library_tv/library_tv.c`)
//
// ⚠️ **`tools/extract/libraryTv.js`와 한 줄씩 같아야 한다.** 머리말(판 셋과 섞기)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import type { Rgb } from './nitrotex'
import { chars, maybeLz77, palettes, screen, screenCell, TILE } from './ntrgfx'
import { encodePng } from './png'
import { check, type ConvertContext, type Produced } from './convertTypes'

const W = 256
const H = 192
const SCAN_H = 256

function draw(
  rgba: Uint8Array, oy: number, rows: number, tiles: Uint8Array, scr: ReturnType<typeof screen>,
  bpp8: boolean, pal: readonly Rgb[], opaque: boolean,
): void {
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

export async function convertLibraryTv(ctx: ConvertContext): Promise<Produced> {
  const tvNarc = await ctx.fs.read('/demo/intro/intro_tv.narc')
  const libNarc = await ctx.fs.read('/graphic/library_tv.narc')
  if (!tvNarc || !libNarc) throw new Error('intro_tv · library_tv를 못 읽었다')
  if (narcCount(tvNarc) !== 10 || narcCount(libNarc) !== 5) {
    throw new Error(`intro_tv ${String(narcCount(tvNarc))}칸 · library_tv ${String(narcCount(libNarc))}칸 — 10 · 5라야 한다`)
  }
  const take = (narc: Uint8Array, at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`${String(at)}번 칸이 없다`)
    return maybeLz77(b)
  }
  const pal: Rgb[] = palettes(take(libNarc, 3)).flat()
  if (pal.length !== 256) throw new Error(`library_tv 팔레트가 ${String(pal.length)}색이다 — 256이라야 한다`)
  pal[0] = [0, 0, 0]
  const rgba = new Uint8Array(W * (H + SCAN_H + H) * 4)
  draw(rgba, 0, H, chars(take(libNarc, 2)).data, screen(take(libNarc, 4)), true, pal, true)
  draw(rgba, H, SCAN_H, chars(take(tvNarc, 2)).data, screen(take(tvNarc, 5)), false, pal, false)
  draw(rgba, H + SCAN_H, H, chars(take(tvNarc, 1)).data, screen(take(tvNarc, 4)), false, pal, false)
  check(ctx)
  return new Map([['data/libraryTv.png', await encodePng(rgba, W, H + SCAN_H + H)]])
}
