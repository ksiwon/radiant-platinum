// 나무열매 그림 예순넷 (`applications/berry_tag.c` · `BerryTag_LoadBerryGraphics` · `/graphic/ntag_gra.narc`)
//
//   /graphic/ntag_gra.narc  134칸 (`res/graphics/berry_tag/berry_tag.order` 차례)
//     6~69 열매 `{이름}.NCGR` (4bpp · 64타일 = 64×64)   70~133 열매 `{이름}.NCLR` (열매마다 16색 한 줄)
//   열매 번호 = 칸 − 6 (`BerryTag_GetTiles` = `cheri_NCGR + berryID` · `BerryTag_GetPalette` = `cheri_NCLR + berryID`, `berry_tag.c:845-853`)
//
// 하나를 굽는다 (`public/data/berryArt.png`):
//
//   512×512 — **64×64 한 장씩 가로 8 × 세로 8**, 열매 번호 `n`은 `(n % 8) × 64, ⌊n / 8⌋ × 64`
//
// 타일은 8×8로 **차례대로** 놓인다 — 코드가 타일맵을 `1 + i`로 채워 8×8칸 사각형에 붓는다 (`berry_tag.c:519-524`). 그래서 타일 `i`는 `(i % 8, ⌊i / 8⌋)`다.
// 0번 색은 **투명**이다 — 뒤 판(`MAIN_2`의 태그 그림)이 비친다.
//
// ⚠️ **세 롬이 이 128칸을 바이트까지 같게 싣는다** (일본판만 0 · 2번 — 태그 판 글자 — 이 다르고 열매는 같다). 한 벌이다.
//
// ⚠️ **`src/import/platinum/berryArt.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { lz77, palettes, chars } = require('./ntrcell')

const MEMBERS = 134
const BERRIES = 64
const TILES = 6
const PALETTES = 70
const S = 64
const ACROSS = 8
const T = 8

function main() {
  const narc = openRom().narc('/graphic/ntag_gra.narc')
  if (narc.length !== MEMBERS) throw new Error(`ntag_gra가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const w = S * ACROSS
  const rgba = new Uint8Array(w * w * 4)
  for (let b = 0; b < BERRIES; b++) {
    const tiles = chars(lz77(narc[TILES + b]))
    if (tiles.length < (S / T) * (S / T) * 32) throw new Error(`열매 ${b}의 타일이 모자란다 (${tiles.length}바이트)`)
    const pal = palettes(lz77(narc[PALETTES + b]))[0]
    let solid = 0
    for (let i = 0; i < (S / T) * (S / T); i++) {
      const tx = (i % (S / T)) * T, ty = Math.floor(i / (S / T)) * T
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const byte = tiles[i * 32 + y * 4 + (x >> 1)]
          const idx = x & 1 ? byte >> 4 : byte & 0xf
          if (idx === 0) continue
          const c = pal[idx]
          const at = ((Math.floor(b / ACROSS) * S + ty + y) * w + (b % ACROSS) * S + tx + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
          solid++
        }
      }
    }
    if (solid === 0) throw new Error(`열매 ${b}가 비었다`)
  }
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'public/data/berryArt.png'), encodePng(rgba, w, w))
  console.log(`열매 그림 — ${BERRIES}장 × ${S}×${S}`)
}

main()
