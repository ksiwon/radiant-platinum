// 간판 판의 그림 — 브라우저에서 (DATA.md §2.21)
//
// 마을 이름표·도로 표지판은 대사창이 아니라 **다른 창**에 뜬다(`Signpost`). 그
// 창의 왼쪽에는 48×32짜리 작은 그림이 붙는다 — 마을이면 그 마을의 약도, 도로면
// 그 도로의 갈래를 그린 화살표다. 안 뽑으면 판이 글자만 있는 상자가 된다.
//
// `graphic/field_board.narc` 52개가 전부 여기 있다 (`field_board.order`):
//
//   0        signpost_frame.NCGR   판 테두리 타일 (48×24)
//   1        signpost.NCLR         **16색 팔레트가 여러 벌**. 간판 종류가 곧 팔레트 번호다
//   2~32     route_map_00~30       도로 화살표 31장
//   33~51    city_map_empty + 18   마을 약도 19장 (0번이 빈 판)
//
// ⚠️ 테두리 타일은 안 쓴다. 원작은 NDS 타일맵으로 9칸 테두리를 채우는데
// (`DrawSignpostFrame`), 우리 판은 DOM이라 그 절차를 옮길 자리가 없다 — 테두리는
// CSS로 그리고 **그림만** 원작 것을 쓴다.
//
// ⚠️ **노드 쪽(`tools/extract/signposts.js`)과 한 줄씩 같아야 한다.**
import { narcEntry, narcCount } from './nds'
import { encodePng } from './png'
import { palettes, chars, drawTile, TILE, TILE_BYTES } from './ntrgfx'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/graphic/field_board.narc'
const FILES = 52

/** 그림 한 장. 6×4타일 = 24타일이고 원작도 딱 그만큼 싣는다 (`24 * TILE_SIZE_4BPP`) */
const W = 48
const H = 32
const TILES = (W / TILE) * (H / TILE)

/** `field_board.order`의 자리. 이름이 곧 번호다 */
const PALETTE = 1
const ROUTE_FIRST = 2
const ROUTE_COUNT = 31
const CITY_FIRST = 33
const CITY_COUNT = 19
/** 신오의 도로 30개·마을 18곳에 빈 판 하나씩 */
const ROUTES = 30
const CITIES = 18

/** 아틀라스 가로 장수. 50장을 10×5로 놓는다 */
const COLS = 10

export async function convertSignposts(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read(NARC)
  if (!narc) throw new Error(`${NARC}을 못 읽었다`)
  const count = narcCount(narc)
  if (count !== FILES) throw new Error(`${NARC}이 ${String(FILES)}개가 아니라 ${String(count)}개다`)

  const take = (at: number): Uint8Array => {
    const buf = narcEntry(narc, at)
    if (!buf) throw new Error(`${NARC} ${String(at)}번이 없다`)
    return buf
  }

  const pals = palettes(take(PALETTE))
  // 종류 넷(지도·화살표·명패·흘림)이 팔레트 넷을 쓴다. 그림이 붙는 것은 앞의 둘이다
  if (pals.length < 2) throw new Error(`팔레트가 ${String(pals.length)}벌뿐이다`)

  // 화살표 31장 다음에 마을 19장. 순서를 이렇게 두면 `route_map_n`이 n번,
  // `city_map_n`이 31+n번이라 색인이 원작 번호에서 바로 나온다
  const sheets = [
    ...Array.from({ length: ROUTE_COUNT }, (_, i) => ({ file: ROUTE_FIRST + i, pal: 1 })),
    ...Array.from({ length: CITY_COUNT }, (_, i) => ({ file: CITY_FIRST + i, pal: 0 })),
  ]

  const rows = Math.ceil(sheets.length / COLS)
  const sheetW = COLS * W
  const rgba = new Uint8Array(sheetW * rows * H * 4)

  const blank: number[] = []
  for (const [n, sheet] of sheets.entries()) {
    const data = chars(take(sheet.file)).data
    if (data.byteLength !== TILES * TILE_BYTES) {
      throw new Error(
        `${String(sheet.file)}번이 ${String(TILES)}타일이 아니라 ${String(data.byteLength / TILE_BYTES)}타일이다`,
      )
    }
    const ox = (n % COLS) * W, oy = Math.floor(n / COLS) * H
    for (let t = 0; t < TILES; t++) {
      // 색 0은 뚫는다. 판 배경이 그대로 비쳐야 원작처럼 그림만 얹힌 것으로 보인다
      drawTile(
        rgba, sheetW, ox + (t % (W / TILE)) * TILE, oy + Math.floor(t / (W / TILE)) * TILE,
        data, t, pals[sheet.pal]!, { alphaZero: true },
      )
    }
    if (data.every((b) => b === data[0])) blank.push(n)
    if (n % 8 === 0) { check(ctx); ctx.onProgress?.(n, sheets.length); await breathe(ctx) }
  }

  /**
   * ⚠️ **두 갈래의 0번만 한 색으로 차 있어야 한다.**
   *
   * 그림 번호가 안 붙은 간판은 0번으로 떨어지는데, 그 자리가 바로 `route_map_00`과
   * `city_map_empty` — 원작이 일부러 비워 둔 판이다. 그래서 셋 이상 나오면 자리가
   * 밀린 것이고, 하나뿐이면 한 갈래를 잘못 짚은 것이다.
   *
   * 장수도 여기서 걸린다. 신오의 도로가 201~230번 30개이고 마을이 18곳이라 빈 판을
   * 하나씩 더한 31·19가 정확히 맞아떨어진다
   */
  if (blank.join() !== `0,${String(ROUTE_COUNT)}`) {
    throw new Error(`빈 판이 0·${String(ROUTE_COUNT)}번이 아니라 ${blank.join('·')}번이다`)
  }
  if (ROUTE_COUNT !== 1 + ROUTES || CITY_COUNT !== 1 + CITIES) {
    throw new Error('장수가 신오와 안 맞는다')
  }
  ctx.onProgress?.(sheets.length, sheets.length)

  return new Map([
    ['data/signposts.png', await encodePng(rgba, sheetW, rows * H)],
    ['data/signposts.json', json({
      width: W,
      height: H,
      cols: COLS,
      /** 화살표가 앞, 마을 약도가 뒤다. 원작 번호에 이만큼 더하면 우리 자리다 */
      routeFirst: 0,
      cityFirst: ROUTE_COUNT,
      routeCount: ROUTE_COUNT,
      cityCount: CITY_COUNT,
    })],
  ])
}
