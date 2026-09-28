// 가리키는 손 — 브라우저에서 (포획 강좌 · `battle/indicator.c`)
//
// ⚠️ **`tools/extract/pointerHand.js`와 한 줄씩 같아야 한다.** 머리말은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import { cellBank, cellBox, drawCell } from './ntrcell'
import { chars, maybeLz77, palettes } from './ntrgfx'
import { encodePng } from './png'
import { check, type ConvertContext, type Produced } from './convertTypes'

const MEMBERS = 18
const CHARS = 10
const PALETTE = 11
const CELLS = 12

export async function convertPointerHand(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/graphic/ev_pokeselect.narc')
  if (!narc) throw new Error('ev_pokeselect.narc을 못 읽었다')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`ev_pokeselect가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`ev_pokeselect에 ${String(at)}번 칸이 없다`)
    return b
  }
  const pals = palettes(maybeLz77(take(PALETTE))).slice(0, 1)
  const tiles = chars(maybeLz77(take(CHARS))).data
  const { cells } = cellBank(take(CELLS))
  if (cells.length !== 1) throw new Error(`손 셀이 ${String(cells.length)}개다 — 하나라야 한다`)
  const [, , w, h] = cellBox(cells[0]!)
  const rgba = new Uint8Array(w * h * 4)
  if (drawCell(rgba, w, 0, 0, cells[0]!, tiles, pals) === 0) throw new Error('손이 비었다')
  check(ctx)
  return new Map([['data/pointerHand.png', await encodePng(rgba, w, h)]])
}
