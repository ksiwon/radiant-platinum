// 기술 타입 그림과 분류 그림 — 브라우저에서 (`type_icon.c` · `battle/graphic/pl_batt_obj.narc`)
//
// ⚠️ **`tools/extract/typeIcons.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 팔레트 줄 · 칸 차례)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import type { Rgb } from './nitrotex'
import { cellBank, drawCell, type Oam } from './ntrcell'
import { chars, maybeLz77, palettes } from './ntrgfx'
import { encodePng } from './png'
import { check, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const MEMBERS = 343
const PALETTE = 74
const CELL = 242
const W = 32
const H = 16

/** 칸 하나 — `[이름, 글자 그림 칸, 팔레트 줄]` */
type Slot = readonly [string, number, number]

/** 타입 번호 차례. 칸은 `sprites.order` 줄 − 1, 줄은 `sMoveTypeIconPaletteIndex` */
export const TYPES: readonly Slot[] = [
  ['normal', 234, 0], ['fighting', 225, 0], ['flying', 227, 1], ['poison', 235, 1], ['ground', 229, 0],
  ['rock', 237, 0], ['bug', 231, 2], ['ghost', 228, 1], ['steel', 238, 0], ['mystery', 236, 2],
  ['fire', 226, 0], ['water', 241, 1], ['grass', 233, 2], ['electric', 222, 0], ['psychic', 223, 1],
  ['ice', 230, 1], ['dragon', 221, 2], ['dark', 224, 0],
]
/** 분류 번호 차례. `sMoveCategoryIconPaletteIndex` */
export const CLASSES: readonly Slot[] = [['physical', 244, 0], ['special', 246, 1], ['status', 245, 0]]

/** 32×16 칸 여럿을 가로 한 줄로 */
async function strip(
  take: (at: number) => Uint8Array, pal: readonly (readonly Rgb[])[], cell: readonly Oam[], list: readonly Slot[],
): Promise<Uint8Array> {
  const rgba = new Uint8Array(W * list.length * H * 4)
  list.forEach(([name, at, row], i) => {
    const one = new Uint8Array(W * H * 4)
    const pals: Rgb[][] = [pal[row]!.slice()]
    if (drawCell(one, W, 0, 0, cell, chars(maybeLz77(take(at))).data, pals) === 0) {
      throw new Error(`${name} 그림이 비었다`)
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = (y * W + x) * 4, d = (y * W * list.length + i * W + x) * 4
        rgba[d] = one[s]!; rgba[d + 1] = one[s + 1]!; rgba[d + 2] = one[s + 2]!; rgba[d + 3] = one[s + 3]!
      }
    }
  })
  return encodePng(rgba, W * list.length, H)
}

export async function convertTypeIcons(ctx: ConvertContext): Promise<Produced> {
  // ⚠️ **한국판은 이 아카이브를 `/resource/kor/` 밑으로 옮겼다** — 타입 이름이 그림에 그려져 있어서다
  const narc = await readRomFile(ctx, '/battle/graphic/pl_batt_obj.narc')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`pl_batt_obj가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`pl_batt_obj에 ${String(at)}번 칸이 없다`)
    return b
  }
  const pal = palettes(maybeLz77(take(PALETTE)))
  if (pal.length !== 3) throw new Error(`타입 팔레트가 ${String(pal.length)}줄이다 — 3줄이라야 한다`)
  const { cells } = cellBank(take(CELL))
  if (cells.length !== 1 || cells[0]!.length !== 1) throw new Error('타입 셀이 OAM 하나가 아니다')
  const types = await strip(take, pal, cells[0]!, TYPES)
  check(ctx)
  const classes = await strip(take, pal, cells[0]!, CLASSES)
  return new Map([
    [`data/typeIcons.${ctx.locale}.png`, types],
    ['data/moveClass.png', classes],
  ])
}
