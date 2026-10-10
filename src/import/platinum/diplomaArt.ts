// 도감 완성 상장 종이 그림 — 브라우저에서 (`applications/diploma.c` · `/demo/syoujyou/syoujyou.narc`)
//
// ⚠️ **`tools/extract/diplomaArt.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 바탕과 종이 · 팔레트 줄 · 아래 칸 줄이 비었다는 확인)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import type { Rgb } from './nitrotex'
import { chars, maybeLz77, palettes, screen, screenCell, TILE, type Screen } from './ntrgfx'
import { encodePng } from './png'
import { check, type ConvertContext, type Produced } from './convertTypes'

const MEMBERS = 12
const KINDS = 2
const W = 256
const H = 192
const ROWS = H / TILE
const COLS = W / TILE
const DOC_TILES = 0
const BLANK_TILES = 2
const DOC_PAL = 4
const BLANK_PAL = 6
const DOC_MAP = 8
const BLANK_MAP = 10
const DOC_MAP_ROWS = 64

/** 4bpp 판 한 장을 `(ox, oy)`에 찍는다. 0번 색은 `backdrop`이 있으면 그 색으로 · 없으면 비운다. 칠한 픽셀 수를 돌려준다 */
function drawMap(
  rgba: Uint8Array, ox: number, oy: number, scr: Screen, tiles: Uint8Array,
  pal: readonly Rgb[], rows: number, backdrop: Rgb | null,
): number {
  let solid = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const cell = screenCell(scr, cx, cy)
      const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
          const byte = tiles[tile * 32 + sy * 4 + (sx >> 1)] ?? 0
          const idx = sx & 1 ? byte >> 4 : byte & 0xf
          if (idx === 0 && !backdrop) continue
          const c = idx === 0 ? backdrop! : pal[idx]!
          const at = ((oy + cy * TILE + y) * W * KINDS + ox + cx * TILE + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
          solid++
        }
      }
    }
  }
  return solid
}

/** 위 24칸 줄 밑의 칸에서 0번이 아닌 픽셀이 몇 개인가 */
function solidBelow(scr: Screen, tiles: Uint8Array): number {
  let solid = 0
  for (let cy = ROWS; cy < DOC_MAP_ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const cell = screenCell(scr, cx, cy)
      const tile = cell & 0x3ff
      for (let i = 0; i < TILE * 4; i++) {
        const byte = tiles[tile * 32 + i] ?? 0
        if ((byte & 0xf) !== 0) solid++
        if ((byte >> 4) !== 0) solid++
      }
    }
  }
  return solid
}

export async function convertDiplomaArt(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/demo/syoujyou/syoujyou.narc')
  if (!narc) throw new Error('syoujyou.narc을 못 읽었다')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`syoujyou가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`syoujyou에 ${String(at)}번 칸이 없다`)
    return b
  }
  const rgba = new Uint8Array(W * KINDS * H * 2 * 4)
  for (let k = 0; k < KINDS; k++) {
    const docPal = palettes(maybeLz77(take(DOC_PAL + k)))[0]!
    const blankPal = palettes(maybeLz77(take(BLANK_PAL + k)))[0]!
    const docMap = screen(maybeLz77(take(DOC_MAP + k)))
    const blankMap = screen(maybeLz77(take(BLANK_MAP + k)))
    if (docMap.width !== COLS || docMap.height !== DOC_MAP_ROWS) {
      throw new Error(`종이 판 ${String(k)}가 ${String(docMap.width)}×${String(docMap.height)}칸이다 — 32×64칸이라야 한다`)
    }
    if (blankMap.width !== COLS || blankMap.height < ROWS) {
      throw new Error(`바탕 판 ${String(k)}가 ${String(blankMap.width)}×${String(blankMap.height)}칸이다`)
    }
    const docTiles = chars(maybeLz77(take(DOC_TILES + k))).data
    const blankTiles = chars(maybeLz77(take(BLANK_TILES + k))).data
    if (drawMap(rgba, k * W, 0, blankMap, blankTiles, blankPal, ROWS, blankPal[0]!) === 0) {
      throw new Error(`바탕 ${String(k)}가 비었다`)
    }
    if (drawMap(rgba, k * W, H, docMap, docTiles, docPal, ROWS, null) === 0) throw new Error(`종이 ${String(k)}가 비었다`)
    const below = solidBelow(docMap, docTiles)
    if (below !== 0) {
      throw new Error(`종이 ${String(k)}의 아래 칸 줄에 ${String(below)}픽셀이 있다 — 비어 있다는 가정이 깨졌다`)
    }
    check(ctx)
  }
  return new Map([['data/diplomaArt.png', await encodePng(rgba, W * KINDS, H * 2)]])
}
