// 편지지 그림 열둘 — 브라우저에서 (`applications/mail_viewer.c` · `/graphic/mail_gra.narc`)
//
// ⚠️ **`tools/extract/mailArt.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 편지 차례 · 0번 색 · 팔레트 줄 수)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import { chars, maybeLz77, palettes, screen, screenCell, TILE } from './ntrgfx'
import { encodePng } from './png'
import { check, type ConvertContext, type Produced } from './convertTypes'

const MEMBERS = 37
const MAILS = 12
const TILES = 12
const SCREENS = 24
const W = 256
const H = 192

export async function convertMailArt(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/graphic/mail_gra.narc')
  if (!narc) throw new Error('mail_gra.narc을 못 읽었다')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`mail_gra가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`mail_gra에 ${String(at)}번 칸이 없다`)
    return b
  }
  const rgba = new Uint8Array(W * H * MAILS * 4)
  for (let m = 0; m < MAILS; m++) {
    const pals = palettes(maybeLz77(take(m))).slice(0, 3)
    const tiles = chars(maybeLz77(take(TILES + m))).data
    const scr = screen(maybeLz77(take(SCREENS + m)))
    if (scr.width !== W / TILE || scr.height !== H / TILE) {
      throw new Error(`편지 ${String(m)}의 판이 ${String(scr.width)}×${String(scr.height)}칸이다 — 32×24칸이라야 한다`)
    }
    const backdrop = pals[0]![0]!
    for (let cy = 0; cy < H / TILE; cy++) {
      for (let cx = 0; cx < W / TILE; cx++) {
        const cell = screenCell(scr, cx, cy)
        const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
        const pal = pals[cell >> 12]
        if (!pal) throw new Error(`편지 ${String(m)}가 팔레트 ${String(cell >> 12)}행을 쓴다 — 세 줄뿐이다`)
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
            const byte = tiles[tile * 32 + sy * 4 + (sx >> 1)] ?? 0
            const idx = sx & 1 ? byte >> 4 : byte & 0xf
            const c = idx === 0 ? backdrop : pal[idx]!
            const at = ((m * H + cy * TILE + y) * W + cx * TILE + x) * 4
            rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
          }
        }
      }
      if (cy % 8 === 7) check(ctx)
    }
  }
  return new Map([['data/mailArt.png', await encodePng(rgba, W, H * MAILS)]])
}
