// 도감 검색의 몸 모양 실루엣 열넷 (`pokedex_search.c` · `FilterFormSilhouette` · `zukan.narc`의 `search_body_shapes`)
//
//   /graphic/zukan.narc  130칸 (`res/graphics/pokedex/pokedex.order` 차례 — 번호 = 줄 번호 − 1)
//     3 `buttons.NCLR`   79 `search_body_shapes_cell.NCER`   80 `_anim.NANR`   81 `search_body_shapes.NCGR`
//   (한국판 · 미국판은 `/resource/{kor,eng}/zukan/zukan.narc`로 옮겨 놓았다 — `localePaths.ts`. 세 롬이 이 세 칸을 바이트까지 똑같이 싣는다)
//
// 하나를 굽는다 (`public/data/dexShapes.png`):
//
//   32×32 × 14칸을 가로로 — **칸 번호 = `FilterForm` − 1**: 네발 · 두발(꼬리 없음) · 두발(꼬리) · 뱀 · 날개 여럿 · 날개 · 곤충 · 머리와 몸 ·
//   머리와 팔 · 머리와 다리 · 촉수 · 지느러미 · 머리 · 여럿 (`pokedex_sort.h:59-76` · 셀 3~16 = 애니 3~16, `pokedex_search.c:954-1004`)
//
// ⚠️ **팔레트는 `buttons.NCLR`의 0행이다.** 몸 모양 스프라이트가 그 팔레트를 12줄로 싣고 OAM의 팔레트 번호가 0이다 (`pokedex_search.c:596`).
// 셀 0 · 1 · 2 · 17은 이 아틀라스의 다른 그림(몸 모양 틀 · 포켓볼)이라 안 굽는다.
//
// ⚠️ **`src/import/platinum/dexShapes.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { lz77, palettes, chars, cellBank, drawCell } = require('./ntrcell')

const MEMBERS = 130
const PALETTE = 3
const CELLS = 79
const TILES = 81
const FIRST_CELL = 3
const SHAPES = 14
const S = 32

function main() {
  const narc = openRom().narc('/resource/eng/zukan/zukan.narc')
  if (narc.length !== MEMBERS) throw new Error(`zukan이 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const pal = palettes(narc[PALETTE])
  const tiles = chars(lz77(narc[TILES]))
  const { cells } = cellBank(narc[CELLS])
  if (cells.length < FIRST_CELL + SHAPES) throw new Error(`몸 모양 셀이 ${cells.length}개뿐이다`)
  const rgba = new Uint8Array(S * SHAPES * S * 4)
  for (let i = 0; i < SHAPES; i++) {
    const oams = cells[FIRST_CELL + i]
    if (oams.length !== 1 || oams[0].w !== S || oams[0].h !== S) throw new Error(`몸 모양 셀 ${FIRST_CELL + i}가 32×32 하나가 아니다`)
    const one = new Uint8Array(S * S * 4)
    if (drawCell(one, S, 0, 0, oams, tiles, [pal[0]]) === 0) throw new Error(`몸 모양 ${i}가 비었다`)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const s = (y * S + x) * 4, d = (y * S * SHAPES + i * S + x) * 4
        rgba[d] = one[s]; rgba[d + 1] = one[s + 1]; rgba[d + 2] = one[s + 2]; rgba[d + 3] = one[s + 3]
      }
    }
  }
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'public/data/dexShapes.png'), encodePng(rgba, S * SHAPES, S))
  console.log(`도감 몸 모양 — ${SHAPES}칸 × ${S}×${S}`)
}

main()
