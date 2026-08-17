// 박스 벽지 — 브라우저에서 (DATA.md §2.20)
//
// 보관 시스템의 배경이다. 박스마다 다른 그림이 깔리는 것이 원작에서 박스를
// 구분하는 가장 큰 신호라, 이걸 안 뽑으면 화면이 "회색 판 열여덟 개"가 된다.
//
// `graphic/box.narc`의 파일 세 개가 벽지 한 장이다 (`Unk_ov19_021E0178`):
//
//   28 + n*3  NCLR  16색. 압축 안 됨
//   29 + n*3  NCGR  LZ77. 21×20 타일 = 168×160 픽셀
//   30 + n*3  NSCR  LZ77. 같은 21×20 칸의 타일 배치
//
// 벽지는 32장이다. 앞 16장이 처음부터 있고(박스 18개가 이 16장을 돌려 쓴다)
// 뒤 16장은 원작에서 조건을 채워야 열린다.
//
// ⚠️ 위 21×4 타일은 **박스 이름이 찍히는 자리**다. 원작은 그림 위에 글자를 직접
// 그려 넣는데(`ov19_021D7C58`), 우리는 이름을 HTML로 얹으므로 그림은 그대로 두고
// 글자만 그 자리에 올린다.
//
// ⚠️ **노드 쪽(`tools/extract/boxWallpapers.js`)과 한 줄씩 같아야 한다.**
import { narcEntry } from './nds'
import { encodePng } from './png'
import { lz77, palettes, chars, screen, drawTile, TILE, TILE_BYTES } from './ntrgfx'
import {
  breathe, check, json, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const NARC = '/graphic/box.narc'
/** 벽지 장수와 첫 파일 번호. 셋씩 묶여 있다 */
const COUNT = 32
const FIRST = 28
/** 아틀라스 가로 장수. 32장을 8×4로 놓는다 */
const COLS = 8
/** 타일 번호는 아래 10비트, 그 위 두 비트가 가로·세로 뒤집기다 */
const TILE_MASK = 0x3ff
const HFLIP = 0x400
const VFLIP = 0x800

export async function convertBoxWallpapers(ctx: ConvertContext): Promise<Produced> {
  // ⚠️ 한국판은 이 파일이 `/resource/kor/box/box.narc`에 있다 (`localePaths`)
  const narc = await readRomFile(ctx, NARC)

  const take = (at: number): Uint8Array => {
    const buf = narcEntry(narc, at)
    if (!buf) throw new Error(`${NARC} ${String(at)}번이 없다`)
    return buf
  }

  const sheets = Array.from({ length: COUNT }, (_, n) => ({
    pal: palettes(take(FIRST + n * 3))[0]!,
    chr: chars(lz77(take(FIRST + n * 3 + 1))),
    scr: screen(lz77(take(FIRST + n * 3 + 2))),
  }))

  const w = sheets[0]!.scr.width, h = sheets[0]!.scr.height
  for (const [n, s] of sheets.entries()) {
    if (s.scr.width !== w || s.scr.height !== h) {
      throw new Error(
        `벽지 ${String(n)}장째가 ${String(s.scr.width)}×${String(s.scr.height)}칸이다 — 앞과 다르다`,
      )
    }
    // 배치가 가리키는 타일이 실제로 있어야 한다. 없으면 압축을 잘못 풀었다
    const tiles = s.chr.data.byteLength / TILE_BYTES
    const max = Math.max(...s.scr.cells.map((c) => c & TILE_MASK))
    if (max >= tiles) {
      throw new Error(`벽지 ${String(n)}장째가 타일 ${String(max)}번을 가리키는데 ${String(tiles)}장뿐이다`)
    }
  }

  const cellW = w * TILE, cellH = h * TILE
  const rows = Math.ceil(COUNT / COLS)
  const width = COLS * cellW, height = rows * cellH
  const rgba = new Uint8Array(width * height * 4)

  for (const [n, { pal, chr, scr }] of sheets.entries()) {
    const ox = (n % COLS) * cellW, oy = Math.floor(n / COLS) * cellH
    for (let c = 0; c < scr.cells.length; c++) {
      const cell = scr.cells[c]!
      drawTile(
        rgba, width,
        ox + (c % scr.width) * TILE, oy + Math.floor(c / scr.width) * TILE,
        chr.data, cell & TILE_MASK, pal,
        { hflip: (cell & HFLIP) !== 0, vflip: (cell & VFLIP) !== 0 },
      )
    }
    check(ctx)
    ctx.onProgress?.(n + 1, COUNT)
    await breathe(ctx)
  }

  return new Map([
    ['data/boxWallpapers.png', await encodePng(rgba, width, height)],
    ['data/boxWallpapers.json', json({
      count: COUNT, cols: COLS, rows, width: cellW, height: cellH,
    })],
  ])
}
