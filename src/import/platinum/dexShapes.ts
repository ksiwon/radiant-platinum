// 도감 검색의 몸 모양 실루엣 열넷 — 브라우저에서 (`pokedex_search.c` · `zukan.narc`)
//
// ⚠️ **`tools/extract/dexShapes.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 칸 차례 · 팔레트)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import { cellBank, drawCell } from './ntrcell'
import { chars, maybeLz77, palettes } from './ntrgfx'
import { encodePng } from './png'
import { check, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const MEMBERS = 130
const PALETTE = 3
const CELLS = 79
const TILES = 81
const FIRST_CELL = 3
const SHAPES = 14
const S = 32

export async function convertDexShapes(ctx: ConvertContext): Promise<Produced> {
  // ⚠️ **미국판 · 한국판은 이 아카이브를 `/resource/…/zukan/` 밑으로 옮겼다** (`localePaths.ts`)
  const narc = await readRomFile(ctx, '/graphic/zukan.narc')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`zukan이 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`zukan에 ${String(at)}번 칸이 없다`)
    return b
  }
  const pal = palettes(take(PALETTE))
  const tiles = chars(maybeLz77(take(TILES))).data
  const { cells } = cellBank(take(CELLS))
  if (cells.length < FIRST_CELL + SHAPES) throw new Error(`몸 모양 셀이 ${String(cells.length)}개뿐이다`)
  const rgba = new Uint8Array(S * SHAPES * S * 4)
  for (let i = 0; i < SHAPES; i++) {
    const oams = cells[FIRST_CELL + i]!
    if (oams.length !== 1 || oams[0]!.w !== S || oams[0]!.h !== S) {
      throw new Error(`몸 모양 셀 ${String(FIRST_CELL + i)}가 32×32 하나가 아니다`)
    }
    const one = new Uint8Array(S * S * 4)
    if (drawCell(one, S, 0, 0, oams, tiles, [pal[0]!.slice()]) === 0) throw new Error(`몸 모양 ${String(i)}가 비었다`)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const s = (y * S + x) * 4, d = (y * S * SHAPES + i * S + x) * 4
        rgba[d] = one[s]!; rgba[d + 1] = one[s + 1]!; rgba[d + 2] = one[s + 2]!; rgba[d + 3] = one[s + 3]!
      }
    }
  }
  check(ctx)
  return new Map([['data/dexShapes.png', await encodePng(rgba, S * SHAPES, S)]])
}
