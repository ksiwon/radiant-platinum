// 파티 화면의 「들고 있는 것」 표식 셋 — 브라우저에서 (`applications/party_menu/sprites.c` · `/graphic/pl_plist_gra.narc`)
//
// ⚠️ **`tools/extract/partyIcons.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 애니 차례 · 0번 색)은 그쪽에 있다
import { narcEntry } from './nds'
import { chars, maybeLz77, palettes, TILE } from './ntrgfx'
import { encodePng } from './png'
import { readRomFile, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/graphic/pl_plist_gra.narc'
const CHARS = 20
const PALETTE = 21
const ICONS = 3

export async function convertPartyIcons(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`pl_plist_gra에 ${String(at)}번 칸이 없다`)
    return b
  }
  const pal = palettes(maybeLz77(take(PALETTE)))[0]
  if (!pal) throw new Error('표식 팔레트가 비었다')
  const tiles = chars(maybeLz77(take(CHARS))).data
  if (tiles.length < ICONS * 32) {
    throw new Error(`표식 타일이 ${String(tiles.length / 32)}개다 — ${String(ICONS)}개라야 한다`)
  }
  const rgba = new Uint8Array(TILE * ICONS * TILE * 4)
  for (let i = 0; i < ICONS; i++) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const byte = tiles[i * 32 + y * 4 + (x >> 1)] ?? 0
        const idx = x & 1 ? byte >> 4 : byte & 0xf
        // 0번 색은 투명이다 (OBJ)
        if (idx === 0) continue
        const c = pal[idx]!
        const at = (y * TILE * ICONS + i * TILE + x) * 4
        rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
      }
    }
  }
  return new Map([['data/partyIcons.png', await encodePng(rgba, TILE * ICONS, TILE)]])
}
