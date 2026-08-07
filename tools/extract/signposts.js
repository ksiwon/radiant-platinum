// 간판 판의 그림 (DATA.md §2.21)
//
// 마을 이름표·도로 표지판은 대사창이 아니라 **다른 창**에 뜬다(`Signpost`).
// 그 창의 왼쪽에는 48×32짜리 작은 그림이 붙는다 — 마을이면 그 마을의 약도,
// 도로면 그 도로의 갈래를 그린 화살표다. 안 뽑으면 판이 글자만 있는 상자가 된다.
//
// graphic/field_board.narc 52개가 전부 여기 있다 (`field_board.order`):
//
//   0        signpost_frame.NCGR   판 테두리 타일 (48×24)
//   1        signpost.NCLR         **16색 팔레트가 여러 벌**. 간판 종류가 곧 팔레트 번호다
//   2~32     route_map_00~30       도로 화살표 31장
//   33~51    city_map_empty + 18   마을 약도 19장 (0번이 빈 판)
//
// ⚠️ **그림 번호는 스크립트가 안 준다.** 매크로(`ShowMapSign`)가 인자를 0으로
// 두고, 원작은 그때 **말을 건 객체의 `data[0]`**을 쓴다
// (`ScrCmd_DrawSignpostInstantMessage`). 그래서 번호는 배치표에서 온다.
//
// ⚠️ 테두리 타일은 안 쓴다. 원작은 NDS 타일맵으로 9칸 테두리를 채우는데
// (`DrawSignpostFrame`), 우리 판은 DOM이라 그 절차를 옮길 자리가 없다 —
// 테두리는 CSS로 그리고 **그림만** 원작 것을 쓴다.
'use strict'
const { openRom, writeJson } = require('./rom')
const { encodePng } = require('./png')

const TILE = 8
/** 그림 한 장. 6×4타일 = 24타일이고 원작도 딱 그만큼 싣는다 (`24 * TILE_SIZE_4BPP`) */
const W = 48
const H = 32
const TILES = (W / TILE) * (H / TILE)

/** `field_board.order`의 자리. 이름이 곧 번호다 */
const FRAME = 0
const PALETTE = 1
const ROUTE_FIRST = 2
const ROUTE_COUNT = 31
const CITY_FIRST = 33
const CITY_COUNT = 19

/** 아틀라스 가로 장수. 50장을 10×5로 놓는다 */
const COLS = 10

function color(v) {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

/**
 * NCLR — 여러 벌이 이어져 있다.
 *
 * `Bg_LoadPalette(..., paletteBuf + signpostType * PALETTE_SIZE, ...)`이므로
 * **간판 종류 번호가 곧 팔레트 번호**다
 */
function palettes(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  // TTLP 절의 0x20이 색 자료 크기다. 한 벌이 16색 × 2바이트 = 32바이트
  const count = Math.floor(buf.readUInt32LE(0x20) / 32)
  const out = []
  for (let p = 0; p < count; p++) {
    const one = []
    for (let i = 0; i < 16; i++) one.push(color(buf.readUInt16LE(0x28 + (p * 16 + i) * 2)))
    out.push(one)
  }
  return out
}

/** NCGR 4bpp 타일 자료 */
function chars(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const size = buf.readUInt32LE(0x28)
  return buf.subarray(0x30, 0x30 + size)
}

/**
 * 타일을 한 장으로 편다.
 *
 * 타일은 8×8이 줄줄이 이어져 있고 한 픽셀이 4비트다. 아래 니블이 왼쪽 픽셀이다
 */
function drawSheet(rgba, sheetW, ox, oy, data, pal, alphaZero) {
  for (let t = 0; t < TILES; t++) {
    const tx = (t % (W / TILE)) * TILE
    const ty = Math.floor(t / (W / TILE)) * TILE
    for (let i = 0; i < 32; i++) {
      const byte = data[t * 32 + i]
      for (const [half, index] of [[0, byte & 0xf], [1, byte >> 4]]) {
        const px = tx + ((i % 4) * 2) + half
        const py = ty + Math.floor(i / 4)
        const at = ((oy + py) * sheetW + ox + px) * 4
        const [r, g, b] = pal[index] ?? [0, 0, 0]
        rgba[at] = r
        rgba[at + 1] = g
        rgba[at + 2] = b
        rgba[at + 3] = index === 0 && alphaZero ? 0 : 255
      }
    }
  }
}

function main() {
  const narc = openRom().narc('/graphic/field_board.narc')
  const files = narc.files ?? narc
  if (files.length !== 52) throw new Error(`field_board.narc가 52개가 아니라 ${files.length}개다`)

  const pals = palettes(files[PALETTE])
  // 종류 넷(지도·화살표·명패·흘림)이 팔레트 넷을 쓴다. 그림이 붙는 것은 앞의 둘이다
  if (pals.length < 2) throw new Error(`팔레트가 ${pals.length}벌뿐이다`)

  // 화살표 31장 다음에 마을 19장. 순서를 이렇게 두면 `route_map_n`이 n번,
  // `city_map_n`이 31+n번이라 색인이 원작 번호에서 바로 나온다
  const sheets = []
  for (let i = 0; i < ROUTE_COUNT; i++) sheets.push({ file: ROUTE_FIRST + i, pal: 1 })
  for (let i = 0; i < CITY_COUNT; i++) sheets.push({ file: CITY_FIRST + i, pal: 0 })

  const rows = Math.ceil(sheets.length / COLS)
  const sheetW = COLS * W
  const sheetH = rows * H
  const rgba = Buffer.alloc(sheetW * sheetH * 4)

  const blank = []
  for (const [n, sheet] of sheets.entries()) {
    const data = chars(files[sheet.file])
    if (data.length !== TILES * 32) {
      throw new Error(`${sheet.file}번이 24타일이 아니라 ${data.length / 32}타일이다`)
    }
    // 색 0은 뚫는다. 판 배경이 그대로 비쳐야 원작처럼 그림만 얹힌 것으로 보인다
    drawSheet(rgba, sheetW, (n % COLS) * W, Math.floor(n / COLS) * H, data, pals[sheet.pal], true)
    if (data.every((b) => b === data[0])) blank.push(n)
  }
  /**
   * ⚠️ **두 갈래의 0번만 한 색으로 차 있어야 한다.**
   *
   * 그림 번호가 안 붙은 간판은 0번으로 떨어지는데, 그 자리가 바로
   * `route_map_00`과 `city_map_empty` — 원작이 일부러 비워 둔 판이다. 그래서
   * 셋 이상 나오면 자리가 밀린 것이고, 하나뿐이면 한 갈래를 잘못 짚은 것이다.
   *
   * 장수도 여기서 걸린다. 신오의 도로가 201~230번 **30개**이고 마을이 18곳이라
   * 빈 판을 하나씩 더한 31·19가 정확히 맞아떨어진다
   */
  if (blank.join() !== `0,${String(ROUTE_COUNT)}`) {
    throw new Error(`빈 판이 0·${String(ROUTE_COUNT)}번이 아니라 ${blank.join('·')}번이다`)
  }
  if (ROUTE_COUNT !== 1 + 30 || CITY_COUNT !== 1 + 18) throw new Error('장수가 신오와 안 맞는다')

  writeJson('signposts.json', {
    width: W,
    height: H,
    cols: COLS,
    /** 화살표가 앞, 마을 약도가 뒤다. 원작 번호에 이만큼 더하면 우리 자리다 */
    routeFirst: 0,
    cityFirst: ROUTE_COUNT,
    routeCount: ROUTE_COUNT,
    cityCount: CITY_COUNT,
  })
  const png = encodePng(rgba, sheetW, sheetH)
  require('fs').writeFileSync(
    require('path').join(require('./rom').ROOT, 'public/data/signposts.png'), png,
  )
  console.log(`간판 그림 ${sheets.length}장 — ${sheetW}×${sheetH}, ${(png.length / 1024).toFixed(1)}KB`)
  console.log(`  팔레트 ${pals.length}벌 · 테두리 타일(${FRAME}번)은 안 쓴다`)
}

if (require.main === module) main()
