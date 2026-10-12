// 파티 화면의 「들고 있는 것」 표식 셋 (`applications/party_menu/sprites.c` · `/graphic/pl_plist_gra.narc`)
//
//   /graphic/pl_plist_gra.narc  (`res/graphics/party_menu/party_menu_graphics.order` 차례 — 번호 = 줄 번호 − 1)
//     19 `icons_anim.NANR`   20 `icons_cell.NCER`   21→20 `icons.NCGR`(8×24 · 타일 셋)   22→21 `icons.NCLR`
//
// 하나를 굽는다 (`public/data/partyIcons.png`):
//
//   24×8 — **8×8 타일 셋을 가로로.** 칸 번호 = 애니 번호(`PartyMenu_Template_HeldIcons`의 `animIdx`): 0 도구 · 1 편지 · 2 볼캡슐
//
// 애니마다 셀 하나(OAM 하나 · 8×8 · 4bpp · 타일 번호 = 애니 번호 · 팔레트 0행)라 셀을 펴지 않고 타일을 그대로 찍는다.
// 볼캡슐 표식(`PARTY_MENU_SPRITE_BALL_SEAL_MEMB0`)은 도구 표식 자리에서 오른쪽으로 8픽셀이다 (`PartyMenu_AlignMemberBallSeal`).
//
// ⚠️ **세 롬이 같다**(글자가 없다). 롬마다 따로 안 굽고 있는 것 하나로 한 벌이다.
// ⚠️ **`src/import/platinum/partyIcons.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const sources = require('../raw/sources.cjs')
const { encodePng } = require('./png')
const { palettes, chars, TILE } = require('./ntrcell')

const NARC = '/graphic/pl_plist_gra.narc'
const CHARS = 20
const PALETTE = 21
const ICONS = 3

function main() {
  const locale = ['en', 'ko', 'ja'].find((l) => sources.platinumRom(l) !== null)
  if (locale === undefined) throw new Error('롬이 하나도 없다')
  const narc = openRom(sources.requirePlatinumRom(locale)).narc(NARC)
  const pal = palettes(narc[PALETTE])[0]
  const tiles = chars(narc[CHARS])
  if (tiles.length < ICONS * 32) throw new Error(`표식 타일이 ${tiles.length / 32}개다 — ${ICONS}개라야 한다`)
  const rgba = new Uint8Array(TILE * ICONS * TILE * 4)
  for (let i = 0; i < ICONS; i++) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const byte = tiles[i * 32 + y * 4 + (x >> 1)] ?? 0
        const idx = x & 1 ? byte >> 4 : byte & 0xf
        // 0번 색은 투명이다 (OBJ)
        if (idx === 0) continue
        const c = pal[idx]
        const at = (y * TILE * ICONS + i * TILE + x) * 4
        rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
      }
    }
  }
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'public/data/partyIcons.png'), encodePng(rgba, TILE * ICONS, TILE))
  console.log(`파티 표식 — ${ICONS}칸 × ${TILE}×${TILE}`)
}

main()
