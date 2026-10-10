// 편지지 그림 열둘 (`applications/mail_viewer.c` · `MailViewer_DrawMail` · `/graphic/mail_gra.narc`)
//
//   /graphic/mail_gra.narc  37칸 (`res/graphics/mail/mail.order` 차례)
//     0~11 `{편지}_mail_tiles.NCLR` (네 줄)   12~23 `…_tiles.NCGR` (4bpp)   24~35 `{편지}_mail.NSCR` (32×24칸)   36 `interface.NSCR` (쓰기 화면의 단추 — 안 굽는다)
//   편지 차례 = `item − ITEM_GRASS_MAIL` (`mail_viewer.c:704-706` · `constants/items.h:52`): 풀 · 불꽃 · 물방울 · 꽃 · 터널 · 철 · 하트 · 눈 · 우주 · 항공 · 모자이크 · 벽돌
//
// 하나를 굽는다 (`public/data/mailArt.png`):
//
//   256×2304 — **256×192 한 장씩 열둘을 위에서 아래로.** 칸 번호 = 편지 종류
//
// 아래 화면(`BG_LAYER_MAIN_3`)에 깔리는 판이다: 같은 타일 · 팔레트로 NSCR을 그대로 찍는다. 글자(`MAIN_1`)와 그림(고른 포켓몬 아이콘)은 그 위에 얹히므로
// 여기에 안 들어 있다. 0번 색은 **팔레트 0행 0번 색**(뒤판 색)으로 채운다 — 원작이 팔레트 자동 투명(`PaletteData_SetAutoTransparent`)을 켜서
// 모든 줄의 0번이 뒤판 색으로 보이기 때문이다 (`mail_viewer.c:745`).
//
// 팔레트는 세 줄(`PALETTE_SIZE_BYTES * 3`)만 싣는다. 쓰기 모드(`MAIL_VIEWER_MODE_WRITE`)가 네 번째 줄을 1행에 덮지만 그것은 편지를 쓸 때의 강조라
// 읽는 판에는 안 쓴다.
//
// ⚠️ **세 롬이 열두 장을 바이트까지 같게 싣는다** (글자가 그려져 있지 않다). 한 벌이다.
//
// ⚠️ **`src/import/platinum/mailArt.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { lz77, palettes, chars, screen, screenCell, TILE } = require('./ntrcell')

const MEMBERS = 37
const MAILS = 12
const TILES = 12
const SCREENS = 24
const W = 256
const H = 192

function main() {
  const narc = openRom().narc('/graphic/mail_gra.narc')
  if (narc.length !== MEMBERS) throw new Error(`mail_gra가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const rgba = new Uint8Array(W * H * MAILS * 4)
  for (let m = 0; m < MAILS; m++) {
    const pals = palettes(lz77(narc[m])).slice(0, 3)
    const tiles = chars(lz77(narc[TILES + m]))
    const scr = screen(lz77(narc[SCREENS + m]))
    if (scr.width !== W / TILE || scr.height !== H / TILE) throw new Error(`편지 ${m}의 판이 ${scr.width}×${scr.height}칸이다 — 32×24칸이라야 한다`)
    const backdrop = pals[0][0]
    for (let cy = 0; cy < H / TILE; cy++) {
      for (let cx = 0; cx < W / TILE; cx++) {
        const cell = screenCell(scr, cx, cy)
        const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
        const pal = pals[cell >> 12]
        if (!pal) throw new Error(`편지 ${m}가 팔레트 ${cell >> 12}행을 쓴다 — 세 줄뿐이다`)
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
            const byte = tiles[tile * 32 + sy * 4 + (sx >> 1)] ?? 0
            const idx = sx & 1 ? byte >> 4 : byte & 0xf
            const c = idx === 0 ? backdrop : pal[idx]
            const at = ((m * H + cy * TILE + y) * W + cx * TILE + x) * 4
            rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
          }
        }
      }
    }
  }
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'public/data/mailArt.png'), encodePng(rgba, W, H * MAILS))
  console.log(`편지지 — ${MAILS}장 × ${W}×${H}`)
}

main()
