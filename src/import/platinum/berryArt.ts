// 나무열매 그림 예순넷 — 브라우저에서 (`applications/berry_tag.c` · `/graphic/ntag_gra.narc`)
//
// ⚠️ **`tools/extract/berryArt.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 타일 차례 · 투명색)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import { chars, maybeLz77, palettes } from './ntrgfx'
import { encodePng } from './png'
import { check, type ConvertContext, type Produced } from './convertTypes'

const MEMBERS = 134
const BERRIES = 64
const TILES = 6
const PALETTES = 70
const S = 64
const ACROSS = 8
const T = 8

export async function convertBerryArt(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/graphic/ntag_gra.narc')
  if (!narc) throw new Error('ntag_gra.narc을 못 읽었다')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`ntag_gra가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`ntag_gra에 ${String(at)}번 칸이 없다`)
    return b
  }
  const w = S * ACROSS
  const rgba = new Uint8Array(w * w * 4)
  for (let b = 0; b < BERRIES; b++) {
    const tiles = chars(maybeLz77(take(TILES + b))).data
    if (tiles.length < (S / T) * (S / T) * 32) throw new Error(`열매 ${String(b)}의 타일이 모자란다 (${String(tiles.length)}바이트)`)
    const pal = palettes(maybeLz77(take(PALETTES + b)))[0]!
    let solid = 0
    for (let i = 0; i < (S / T) * (S / T); i++) {
      const tx = (i % (S / T)) * T, ty = Math.floor(i / (S / T)) * T
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const byte = tiles[i * 32 + y * 4 + (x >> 1)]!
          const idx = x & 1 ? byte >> 4 : byte & 0xf
          if (idx === 0) continue
          const c = pal[idx]!
          const at = ((Math.floor(b / ACROSS) * S + ty + y) * w + (b % ACROSS) * S + tx + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
          solid++
        }
      }
    }
    if (solid === 0) throw new Error(`열매 ${String(b)}가 비었다`)
    if (b % 16 === 15) check(ctx)
  }
  return new Map([['data/berryArt.png', await encodePng(rgba, w, w)]])
}
