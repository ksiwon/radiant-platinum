// 타운맵의 주인공 머리 표식 (`applications/town_map/graphics.c` · `CreateSprites` · `/graphic/tmap_gra.narc`)
//
//   /graphic/tmap_gra.narc  30칸 (`res/graphics/town_map/town_map_graphics.order` 차례 — 번호 = 줄 번호 − 1)
//     2 `top_screen_sprites.NCLR` (열다섯 줄 — 0행 여자 분홍 · 1행 남자 파랑)   10 `player_icons.NCGR`   11 `_cell.NCER`(셀 둘)   12 `_anim.NANR`
//
// 하나를 굽는다 (`public/data/townMapPlayer.png`):
//
//   32×16 — **왼쪽 16칸 남자 · 오른쪽 16칸 여자.** 칸 번호 = `trainerGender`(`GENDER_MALE` 0 · `GENDER_FEMALE` 1)
//
// 남자는 셀 0 · 팔레트 1행, 여자는 셀 1 · 팔레트 0행이다. 코드는 `Sprite_SetAnimFrame(playerSprite, trainerGender)`로 셀을 고르고
// `plttIdx = (남자 ? 1 : 0)`로 팔레트를 간다 (`graphics.c:856-866`). 셀의 OAM이 이미 그 팔레트 번호를 갖고 있어서(셀 0 → 1 · 셀 1 → 0)
// 이 굽기가 그 일치를 확인한다.
//
// ⚠️ **`src/import/platinum/townMapPlayer.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { lz77, palettes, chars, cellBank, drawCell } = require('./ntrcell')

const MEMBERS = 30
const PALETTE = 2
const TILES = 10
const CELLS = 11
const S = 16
/** 칸 번호 = 성별. `[셀, 팔레트 줄]` */
const GENDERS = [[0, 1], [1, 0]]

function main() {
  const narc = openRom().narc('/graphic/tmap_gra.narc')
  if (narc.length !== MEMBERS) throw new Error(`tmap_gra가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const pal = palettes(narc[PALETTE])
  const tiles = chars(lz77(narc[TILES]))
  const { cells } = cellBank(narc[CELLS])
  if (cells.length !== 2) throw new Error(`주인공 셀이 ${cells.length}개다 — 둘이라야 한다`)
  const rgba = new Uint8Array(S * GENDERS.length * S * 4)
  GENDERS.forEach(([cell, row], g) => {
    const oams = cells[cell]
    if (oams.length !== 1 || oams[0].w !== S || oams[0].h !== S || oams[0].pal !== row) {
      throw new Error(`주인공 셀 ${cell}이 16×16 · 팔레트 ${row}행 하나가 아니다`)
    }
    const one = new Uint8Array(S * S * 4)
    if (drawCell(one, S, 0, 0, oams, tiles, [pal[row], pal[row]]) === 0) throw new Error(`주인공 ${g}가 비었다`)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const s = (y * S + x) * 4, d = (y * S * GENDERS.length + g * S + x) * 4
        rgba[d] = one[s]; rgba[d + 1] = one[s + 1]; rgba[d + 2] = one[s + 2]; rgba[d + 3] = one[s + 3]
      }
    }
  })
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'public/data/townMapPlayer.png'), encodePng(rgba, S * GENDERS.length, S))
  console.log(`타운맵 주인공 — ${GENDERS.length}칸 × ${S}×${S}`)
}

main()
