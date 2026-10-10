// 타운맵의 주인공 머리 표식 — 브라우저에서 (`applications/town_map/graphics.c` · `/graphic/tmap_gra.narc`)
//
// ⚠️ **`tools/extract/townMapPlayer.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 셀 · 팔레트 줄)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import { cellBank, drawCell } from './ntrcell'
import { chars, maybeLz77, palettes } from './ntrgfx'
import { encodePng } from './png'
import { check, type ConvertContext, type Produced } from './convertTypes'

const MEMBERS = 30
const PALETTE = 2
const TILES = 10
const CELLS = 11
const S = 16
/** 칸 번호 = 성별. `[셀, 팔레트 줄]` */
const GENDERS = [[0, 1], [1, 0]] as const

export async function convertTownMapPlayer(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/graphic/tmap_gra.narc')
  if (!narc) throw new Error('tmap_gra.narc을 못 읽었다')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`tmap_gra가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`tmap_gra에 ${String(at)}번 칸이 없다`)
    return b
  }
  const pal = palettes(maybeLz77(take(PALETTE)))
  const tiles = chars(maybeLz77(take(TILES))).data
  const { cells } = cellBank(take(CELLS))
  if (cells.length !== 2) throw new Error(`주인공 셀이 ${String(cells.length)}개다 — 둘이라야 한다`)
  const rgba = new Uint8Array(S * GENDERS.length * S * 4)
  GENDERS.forEach(([cell, row], g) => {
    const oams = cells[cell]!
    if (oams.length !== 1 || oams[0]!.w !== S || oams[0]!.h !== S || oams[0]!.pal !== row) {
      throw new Error(`주인공 셀 ${String(cell)}이 16×16 · 팔레트 ${String(row)}행 하나가 아니다`)
    }
    const one = new Uint8Array(S * S * 4)
    if (drawCell(one, S, 0, 0, oams, tiles, [pal[row]!.slice(), pal[row]!.slice()]) === 0) {
      throw new Error(`주인공 ${String(g)}가 비었다`)
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const s = (y * S + x) * 4, d = (y * S * GENDERS.length + g * S + x) * 4
        rgba[d] = one[s]!; rgba[d + 1] = one[s + 1]!; rgba[d + 2] = one[s + 2]!; rgba[d + 3] = one[s + 3]!
      }
    }
  })
  check(ctx)
  return new Map([['data/townMapPlayer.png', await encodePng(rgba, S * GENDERS.length, S)]])
}
