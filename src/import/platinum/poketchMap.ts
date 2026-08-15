// 포켓치 지도 화면과 액정 팔레트 — 브라우저에서 (DATA.md §2.28)
//
// 마킹맵과 나무열매탐색기가 같은 신오 지도 위에 점을 찍는다. 그 지도는 우리가
// 그린 것이 아니라 `graphic/poketch.narc` 안의 타일맵이다:
//
//   115  marking_map.NSCR      32×24칸
//   116  berry_searcher.NSCR   같은 지도 + 아래쪽에 열매 표시 3×2칸 (여섯 칸만 다르다)
//   117  map_bg_tiles.NCGR     27×4타일 = 108장, 4bpp
//     0  generic_bg_tiles.NCLR 액정 팔레트 열여섯 벌
//
// ⚠️ **액정은 네 단계다.** 팔레트 열여섯 칸 중 실제로 쓰는 것은 4·15·8·1
// 넷뿐이고 나머지는 흰색으로 채워져 있다. 밝은 쪽부터 4 → 15 → 8 → 1이며,
// 화면의 **바탕이 제일 밝은 4번**이다.
//
// ⚠️ **한 색이 팔레트 두 벌을 쓴다** (`SLOTS_PER_POKETCH_THEME`이 u16 서른둘).
// 앞이 보통, 뒤가 백라이트다 — 우리는 백라이트를 안 켜므로 앞만 쓴다.
//
// ⚠️ **노드 쪽(`tools/extract/poketchMap.js`)과 한 줄씩 같아야 한다.**
import { narcEntry } from './nds'
import { encodePng } from './png'
import { lz77, palettes, chars, screen, drawTile, TILE, TILE_BYTES } from './ntrgfx'
import type { Rgb } from './nitrotex'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/graphic/poketch.narc'
/** `poketch.order`의 줄 번호 − 1이다 */
const MEMBER = { palette: 0, marking: 115, berry: 116, tiles: 117 }
const MAPS = ['marking', 'berry'] as const
/** 액정 색 여덟 가지 (`NUM_POKETCH_THEMES`) */
const THEMES = 8
/** 한 색이 쓰는 팔레트 벌 수 — 보통과 백라이트 */
const PALETTES_PER_THEME = 2
/** 실제로 쓰는 칸. 밝은 쪽부터다 — 이 차례가 곧 액정의 명암 단계다 */
const SHADES = [4, 15, 8, 1]
const TILE_MASK = 0x3ff
const HFLIP = 0x400
const VFLIP = 0x800

const hex = (c: Rgb): string => `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`

export async function convertPoketchMap(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read(NARC)
  if (!narc) throw new Error(`${NARC}을 못 읽었다`)

  const take = (at: number): Uint8Array => {
    const buf = narcEntry(narc, at)
    if (!buf) throw new Error(`${NARC} ${String(at)}번이 없다`)
    return buf
  }

  const pal = palettes(take(MEMBER.palette))
  if (pal.length < THEMES * PALETTES_PER_THEME) {
    throw new Error(`팔레트가 ${String(pal.length)}벌이다 — 색 여덟에 열여섯이 있어야 한다`)
  }

  const tiles = chars(lz77(take(MEMBER.tiles))).data
  const screens = MAPS.map((name) => screen(lz77(take(MEMBER[name]))))
  const cellsW = screens[0]!.width, cellsH = screens[0]!.height
  for (const [i, s] of screens.entries()) {
    if (s.width !== cellsW || s.height !== cellsH) {
      throw new Error(`${MAPS[i]!}가 ${String(s.width)}×${String(s.height)}칸이다`)
    }
    const max = Math.max(...s.cells.map((c) => c & TILE_MASK))
    const have = tiles.byteLength / TILE_BYTES
    if (max >= have) {
      throw new Error(`${MAPS[i]!}가 타일 ${String(max)}번을 가리키는데 ${String(have)}장뿐이다`)
    }
  }

  // 액정이 정말 네 단계인지 그림에서 확인한다 — 아니면 단계를 잘못 골랐다는 뜻이다
  const hist = new Array<number>(16).fill(0)
  for (const s of screens) {
    for (const cell of s.cells) {
      const t = cell & TILE_MASK
      for (let i = 0; i < TILE * TILE; i++) {
        const byte = tiles[t * TILE_BYTES + (i >> 1)] ?? 0
        hist[i & 1 ? byte >> 4 : byte & 0xf]! += 1
      }
    }
  }
  for (const [i, n] of hist.entries()) {
    if (n > 0 && !SHADES.includes(i)) {
      throw new Error(`지도가 ${String(i)}번 칸을 ${String(n)}번 쓴다 — 네 단계가 아니다`)
    }
  }

  const mapW = cellsW * TILE, mapH = cellsH * TILE
  const width = mapW * MAPS.length, height = mapH * THEMES
  const rgba = new Uint8Array(width * height * 4)
  for (let t = 0; t < THEMES; t++) {
    const theme = pal[t * PALETTES_PER_THEME]!
    for (const [m, scr] of screens.entries()) {
      for (let c = 0; c < scr.cells.length; c++) {
        const cell = scr.cells[c]!
        drawTile(
          rgba, width,
          m * mapW + (c % scr.width) * TILE, t * mapH + Math.floor(c / scr.width) * TILE,
          tiles, cell & TILE_MASK, theme,
          { hflip: (cell & HFLIP) !== 0, vflip: (cell & VFLIP) !== 0 },
        )
      }
    }
    check(ctx)
    ctx.onProgress?.(t + 1, THEMES)
    await breathe(ctx)
  }

  return new Map([
    ['data/poketchMap.png', await encodePng(rgba, width, height)],
    ['data/poketchMap.json', json({
      width: mapW, height: mapH, themes: THEMES, maps: MAPS,
      shades: Array.from({ length: THEMES }, (_, t) => SHADES.map((s) => hex(pal[t * PALETTES_PER_THEME]![s]!))),
    })],
  ])
}
