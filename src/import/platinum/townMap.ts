// 타운맵 — 신오 지도 한 장 (DATA.md §2.27 · PARITY §5)
//
// 공중날기 화면이 목록이 아니라 **지도** 위에서 일어나는 것이 원작이다. 지도를
// 안 뽑으면 그 화면을 지어내야 하고, 지어낸 신오는 신오가 아니다.
//
// `graphic/tmap_gra.narc`의 멤버 차례는 `res/graphics/town_map/…order`에 있다
// (0부터 센다):
//
//    0  top_screen_map.NCLR            16색 팔레트 여러 벌
//   19  top_screen_map_tiles.NCGR      LZ77. 위 화면이 쓰는 타일 전부
//   22  top_screen_region_bg_tilemap.NSCR   32×24칸 — **뒤 판** (BG_LAYER_MAIN_3)
//   24  top_screen_region_map_tilemap.NSCR  32×24칸 — **앞 판** (BG_LAYER_MAIN_2)
//
// ⚠️ **두 판을 겹쳐야 지도가 된다.** 뒤 판이 바다와 테두리고 앞 판이 육지다 —
// 하나만 그리면 신오가 바다에 잠기거나 허공에 뜬다. NDS는 층 번호가 클수록
// 뒤라서 3을 먼저 깔고 2를 얹는다.
//
// ⚠️ 앞 판의 **색 0은 비침**이다. 그냥 칠하면 육지 판이 바다를 통째로 덮는다
// (`drawTile`의 `skipZero`).
//
// ⚠️ **맵 헤더 표를 여기서 다시 읽는다.** `maps` 그룹의 산출물을 읽지 않는다 —
// 그룹 사이에 산출물 의존을 만들면 설치 순서가 바뀌는 순간 그룹이 서로를
// 기다리게 된다. ARM9 표 하나 더 파싱하는 값이 그보다 싸다
import { narcCount, narcEntry } from './nds'
import { maybeLz77, palettes, chars, screen, drawTile, TILE } from './ntrgfx'
import { encodePng } from './png'
import {
  findHeaderTable, parseHeader, parseMatrix, HEADER_SIZE, MAP_COUNT, type TableCounts,
} from './maps'
import {
  breathe, check, json, put, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const GRA = '/graphic/tmap_gra.narc'
const BLOCKS = '/data/tmap_block.dat'
const MATRIX = '/fielddata/mapmatrix/map_matrix.narc'

/** `res/graphics/town_map/town_map_graphics.order`의 줄 번호 − 1 */
const MEMBER = { palette: 0, tiles: 19, bgMap: 22, landMap: 24 }
/** 위 화면 한 장 (`HW_LCD_WIDTH` × `HW_LCD_HEIGHT`) */
const COLS = 32
const ROWS = 24

/** `TownMapBlock` — u16 열둘 */
const BLOCK_SIZE = 24

/** 오버월드 행렬 */
const OVERWORLD = 0

const member = (narc: Uint8Array, at: number): Uint8Array => {
  const buf = narcEntry(narc, at)
  if (!buf) throw new Error(`${GRA}에 ${String(at)}번 멤버가 없다`)
  return maybeLz77(buf)
}

export interface TownMapCell {
  x: number
  z: number
  area: number
  landmark: number
  hidden: number
}

/**
 * `data/tmap_block.dat` — 격자 칸 하나가 어느 곳인지 (`TownMap_ReadBlocks`).
 *
 * 머리에 `int` 하나로 개수가 있고 그다음 `TownMapBlock` 배열이다. 구조체는
 * u16 열둘(24바이트)이고 마지막 `index`는 파일이 아니라 코드가 채운다.
 *
 * ⚠️ 이게 없으면 커서 아래에 **이름을 못 띄운다.** 지도 그림만으로는 그 칸이
 * 어느 도로인지 알 수 없다 — 원작도 이 표를 보고 이름을 찾는다
 */
function parseBlocks(buf: Uint8Array): TownMapCell[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const count = view.getInt32(0, true)
  const out: TownMapCell[] = []
  for (let i = 0; i < count; i++) {
    const at = 4 + i * BLOCK_SIZE
    out.push({
      x: view.getUint16(at, true),
      z: view.getUint16(at + 2, true),
      /** 이 칸의 이름 (`TEXT_BANK_TOWN_MAP`) */
      area: view.getUint16(at + 8, true),
      /** 그 안의 이름난 자리 — 없으면 0 */
      landmark: view.getUint16(at + 10, true),
      /** 0이 아니면 그 깃발을 세워야 보인다 (`hiddenLocationFlags`) */
      hidden: view.getUint16(at + 20, true),
    })
  }
  return out
}

/**
 * 격자 칸 → 지역명 번호.
 *
 * ⚠️ **칸의 `areaDescString`은 이름이 아니라 설명이다.** ("어린잎의 숨결이…")
 * 이름은 원작도 따로 읽는다 — 행렬 0의 그 칸에 놓인 맵의 `label`이고, 그것이
 * `TEXT_BANK_LOCATION_NAMES`를 가리킨다. 여기서 미리 이어 두면 화면이 행렬을
 * 통째로 받지 않아도 된다
 */
async function labelsOfGrid(
  ctx: ConvertContext,
): Promise<(x: number, z: number) => { map: number, label: number }> {
  const matrixNarc = await readRomFile(ctx, MATRIX)
  const matrixFile = narcEntry(matrixNarc, OVERWORLD)
  if (!matrixFile) throw new Error(`${MATRIX}에 오버월드 행렬이 없다`)
  const matrix = parseMatrix(matrixFile)

  const events = await readRomFile(ctx, '/fielddata/eventdata/zone_event.narc')
  const enc = await readRomFile(ctx, '/fielddata/encountdata/pl_enc_data.narc')
  const counts: TableCounts = {
    events: narcCount(events) ?? 0,
    matrices: narcCount(matrixNarc) ?? 0,
    encounters: narcCount(enc) ?? 0,
  }
  const arm9 = await ctx.fs.arm9(0, ctx.fs.header.arm9Size)
  if (!arm9) throw new Error('ARM9를 못 읽었다')
  const tableAt = findHeaderTable(arm9, counts)
  const view = new DataView(arm9.buffer, arm9.byteOffset, arm9.byteLength)

  const labels = new Map<number, number>()
  return (x, z) => {
    const at = matrix.headers?.[z * matrix.width + x]
    if (at === undefined) return { map: -1, label: 0 }
    // 표 밖을 가리키는 칸은 이름이 없다 — 노드 쪽의 `maps[at]?.label ?? 0`과 같다
    if (at >= MAP_COUNT) return { map: at, label: 0 }
    let label = labels.get(at)
    if (label === undefined) {
      label = parseHeader(view, tableAt + at * HEADER_SIZE, at).label
      labels.set(at, label)
    }
    return { map: at, label }
  }
}

export async function convertTownMap(ctx: ConvertContext): Promise<Produced> {
  const STEPS = 4
  const narc = await readRomFile(ctx, GRA)
  ctx.onProgress?.(0, STEPS)

  const labelAt = await labelsOfGrid(ctx)
  const blockFile = await readRomFile(ctx, BLOCKS)
  const cells = parseBlocks(blockFile).map((c) => ({ ...c, ...labelAt(c.x, c.z) }))
  ctx.onProgress?.(1, STEPS)
  await breathe(ctx)

  const pals = palettes(member(narc, MEMBER.palette))
  const tiles = chars(member(narc, MEMBER.tiles))
  const bg = screen(member(narc, MEMBER.bgMap))
  const land = screen(member(narc, MEMBER.landMap))
  for (const [name, s] of [['뒤 판', bg], ['앞 판', land]] as const) {
    if (s.width < COLS || s.height < ROWS) {
      throw new Error(`${name}이 ${String(s.width)}×${String(s.height)}칸이다 — 화면 ${String(COLS)}×${String(ROWS)}보다 작다`)
    }
  }
  ctx.onProgress?.(2, STEPS)
  await breathe(ctx)

  const width = COLS * TILE, height = ROWS * TILE
  const rgba = new Uint8Array(width * height * 4)
  // ⚠️ 차례가 자료다. 뒤 판(층 3) → 앞 판(층 2)
  const paint = (s: { width: number, cells: number[] }, skipZero: boolean): void => {
    for (let c = 0; c < s.cells.length; c++) {
      const cell = s.cells[c]!
      drawTile(
        rgba, width, (c % s.width) * TILE, Math.floor(c / s.width) * TILE,
        tiles.data, cell & 0x3ff, pals[(cell >> 12) & 0xf] ?? pals[0]!,
        { hflip: (cell & 0x400) !== 0, vflip: (cell & 0x800) !== 0, skipZero },
      )
    }
  }
  paint(bg, false)
  paint(land, true)
  ctx.onProgress?.(3, STEPS)
  await breathe(ctx)

  const out: Produced = new Map()
  put(ctx, out, 'data/townMap.png', await encodePng(rgba, width, height))
  check(ctx)
  put(ctx, out, 'data/townMap.json', json({
    width, height,
    /** `TOWN_MAP_GRID_SPACING`과 그 원점 (`applications/town_map/defs.h`) */
    grid: 7, originX: 25, originY: -34,
    palettes: pals.length,
    cells,
  }))
  ctx.onProgress?.(STEPS, STEPS)
  return out
}
