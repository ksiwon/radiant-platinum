// 볼 씰 그림 여든 장 — 브라우저에서 (`overlay076` 볼캡슐 편집기 · `/application/custom_ball/data/cb_data.narc`)
//
// ⚠️ **`tools/extract/sealIcons.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 셀 · 팔레트 · 세 롬이 같다는 것)은 그쪽에 있다.
// 글자 멤버 번호 표는 그쪽이 디컴프에서 읽고 여기는 `sealTables.ts`의 `SEAL_ICON_MEMBER`에서 읽는다
import { narcEntry } from './nds'
import { cellBank, drawCell } from './ntrcell'
import { chars, lz77, maybeLz77, palettes } from './ntrgfx'
import { encodePng } from './png'
import { SEAL_ICON_MEMBER, SEAL_KINDS } from '../../engine/world/sealTables'
import { check, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/application/custom_ball/data/cb_data.narc'
const CELL = 93
const PALETTE = 293
const COLS = 10
const S = 24

export async function convertSealIcons(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`cb_data에 ${String(at)}번 칸이 없다`)
    return b
  }
  const pal = palettes(maybeLz77(take(PALETTE)))[0]
  if (!pal) throw new Error('씰 팔레트가 비었다')
  const oams = cellBank(take(CELL)).cells[0]
  if (oams?.length !== 4) throw new Error('씰 셀이 OAM 넷이 아니다')
  if (SEAL_ICON_MEMBER.length !== SEAL_KINDS) throw new Error(`씰 그림 표가 ${String(SEAL_ICON_MEMBER.length)}칸이다`)
  const rows = Math.ceil(SEAL_KINDS / COLS)
  const rgba = new Uint8Array(COLS * S * rows * S * 4)
  for (let i = 0; i < SEAL_KINDS; i++) {
    const tiles = chars(lz77(take(SEAL_ICON_MEMBER[i]!))).data
    if (tiles.length < 9 * 32) throw new Error(`씰 ${String(i + 1)}의 글자가 타일 ${String(tiles.length / 32)}개다 — 9개라야 한다`)
    const one = new Uint8Array(S * S * 4)
    if (drawCell(one, S, 0, 0, oams, tiles, [pal.slice()]) === 0) throw new Error(`씰 ${String(i + 1)}이 비었다`)
    const cx = (i % COLS) * S, cy = Math.floor(i / COLS) * S
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const s = (y * S + x) * 4, d = ((cy + y) * COLS * S + cx + x) * 4
        rgba[d] = one[s]!; rgba[d + 1] = one[s + 1]!; rgba[d + 2] = one[s + 2]!; rgba[d + 3] = one[s + 3]!
      }
    }
    if (i % 8 === 7) check(ctx)
  }
  return new Map([['data/sealIcons.png', await encodePng(rgba, COLS * S, rows * S)]])
}
