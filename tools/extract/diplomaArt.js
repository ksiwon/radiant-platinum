// 도감 완성 상장 종이 그림 (`applications/diploma.c` · `Diploma_LoadGraphics` · `/demo/syoujyou/syoujyou.narc`)
//
//   /demo/syoujyou/syoujyou.narc  12칸 (`res/graphics/diploma/diploma.order` 차례)
//     0 신오 종이 NCGR · 1 전국 종이 NCGR · 2 신오 바탕 NCGR · 3 전국 바탕 NCGR   4~7 같은 차례의 NCLR(256색 — 첫 줄만 쓴다)
//     8 신오 종이 NSCR(32×64칸) · 9 전국 종이 NSCR   10 신오 바탕 NSCR(32×32칸) · 11 전국 바탕 NSCR
//
// 하나를 굽는다 (`public/data/diplomaArt.png`):
//
//   512×384 — **왼쪽 256 신오 · 오른쪽 256 전국.** 위 192줄은 **바탕**(`blank` — 한 색 위에 무늬), 아래 192줄은 **종이**(`document` — 포켓몬 둘레 무늬 · 0번 색은 투명)
//
// 종이는 바탕 **위에** 놓이고 움직인다: 위 화면에 있던 종이가 아래 화면으로 `yOffset` 0 → −192로 미끄러져 내려온다 (`Diploma_UpdateYOffset`:
// 위 화면은 종이의 `y`, 아래 화면은 `y + 192`를 본다 — `diploma.c:330-336`). 그래서 둘을 따로 낸다. 글자는 따로 그린다(`TEXT_COLOR(1, 2, 0)`).
//
// ⚠️ **팔레트 줄이 칸마다 다르다.** 종이 NSCR의 칸은 전부 0행인데 코드가 **위쪽 32×24칸만 1행으로 바꾼다** (`Bg_ChangeTilemapRectPalette(… 32, 24, 1)`,
// `diploma.c:369` · `:374`). 1행에는 종이 팔레트가 · 0행에는 바탕 팔레트가 실린다 (`PLTT_OFFSET(1)` · `PLTT_OFFSET(0)`). 종이가 아래 화면의 맨 아래 24칸으로
// 내려가도 그 칸은 바뀐 것이다 — 이 그림은 위 24칸 줄(192줄)만 싣고 **그 밑 40칸 줄이 비어 있음을 확인한다** (비어 있지 않으면 던진다).
//
// ⚠️ **세 롬이 열두 칸을 바이트까지 같게 싣는다.** 한 벌이다.
//
// ⚠️ **`src/import/platinum/diplomaArt.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { lz77, palettes, chars, screen, screenCell, TILE } = require('./ntrcell')

const MEMBERS = 12
const KINDS = 2
const W = 256
const H = 192
const ROWS = H / TILE
const COLS = W / TILE
/** 칸 번호: 종이 타일 0 · 바탕 타일 2 · 종이 팔레트 4 · 바탕 팔레트 6 · 종이 판 8 · 바탕 판 10 — 각각 `+ 종류` (종류: 신오 0 · 전국 1) */
const DOC_TILES = 0
const BLANK_TILES = 2
const DOC_PAL = 4
const BLANK_PAL = 6
const DOC_MAP = 8
const BLANK_MAP = 10
const DOC_MAP_ROWS = 64

/** 4bpp 판 한 장을 `(ox, oy)`에 찍는다. 0번 색은 `backdrop`이 있으면 그 색으로 · 없으면 비운다. 칠한 픽셀 수를 돌려준다 */
function drawMap(rgba, ox, oy, scr, tiles, palOf, rows, backdrop) {
  let solid = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const cell = screenCell(scr, cx, cy)
      const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      const pal = palOf(cy)
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
          const byte = tiles[tile * 32 + sy * 4 + (sx >> 1)] ?? 0
          const idx = sx & 1 ? byte >> 4 : byte & 0xf
          if (idx === 0 && !backdrop) continue
          const c = idx === 0 ? backdrop : pal[idx]
          const at = ((oy + cy * TILE + y) * W * KINDS + ox + cx * TILE + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
          solid++
        }
      }
    }
  }
  return solid
}

function main() {
  const narc = openRom().narc('/demo/syoujyou/syoujyou.narc')
  if (narc.length !== MEMBERS) throw new Error(`syoujyou가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const rgba = new Uint8Array(W * KINDS * H * 2 * 4)
  for (let k = 0; k < KINDS; k++) {
    const docPal = palettes(lz77(narc[DOC_PAL + k]))[0]
    const blankPal = palettes(lz77(narc[BLANK_PAL + k]))[0]
    const docMap = screen(lz77(narc[DOC_MAP + k]))
    const blankMap = screen(lz77(narc[BLANK_MAP + k]))
    if (docMap.width !== COLS || docMap.height !== DOC_MAP_ROWS) throw new Error(`종이 판 ${k}가 ${docMap.width}×${docMap.height}칸이다 — 32×64칸이라야 한다`)
    if (blankMap.width !== COLS || blankMap.height < ROWS) throw new Error(`바탕 판 ${k}가 ${blankMap.width}×${blankMap.height}칸이다`)
    const docTiles = chars(lz77(narc[DOC_TILES + k]))
    const blankTiles = chars(lz77(narc[BLANK_TILES + k]))
    // 바탕 — 타일 0번 색까지 칠한다 (`BG_LAYER_MAIN_3`은 맨 뒤라 비치는 것이 없다)
    if (drawMap(rgba, k * W, 0, blankMap, blankTiles, () => blankPal, ROWS, blankPal[0]) === 0) throw new Error(`바탕 ${k}가 비었다`)
    // 종이 — 위 24칸 줄은 1행(종이 팔레트). 0번 색은 투명
    if (drawMap(rgba, k * W, H, docMap, docTiles, () => docPal, ROWS, null) === 0) throw new Error(`종이 ${k}가 비었다`)
    // 그 밑 40칸 줄은 비어 있어야 한다 — 0행(바탕 팔레트)으로 읽히는 자리라 비지 않았으면 다른 그림이 숨은 것이다
    const below = solidBelow(docMap, docTiles)
    if (below !== 0) throw new Error(`종이 ${k}의 아래 칸 줄에 ${below}픽셀이 있다 — 비어 있다는 가정이 깨졌다`)
  }
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'public/data/diplomaArt.png'), encodePng(rgba, W * KINDS, H * 2))
  console.log(`상장 종이 — 신오 · 전국 × (바탕 + 종이) ${W}×${H}`)
}

/** 위 24칸 줄 밑의 칸에서 0번이 아닌 픽셀이 몇 개인가 */
function solidBelow(scr, tiles) {
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

main()
