// 기술 타입 그림과 분류 그림 (`type_icon.c` · `battle/graphic/pl_batt_obj.narc`)
//
//   /battle/graphic/pl_batt_obj.narc  343칸 (`res/graphics/battle/sprites.order` 차례 — 번호 = 줄 번호 − 1)
//     74   공용 팔레트 `type_icons/shared.NCLR` (4bpp 세 줄 — 타입마다 쓰는 줄이 다르다)
//     219~241  타입 글자 그림 `type_icons/{이름}.NCGR.lz` (32×16 · 타일 8개)
//     242  `type_icons/cell.NCER.lz` (셀 하나 · 32×16 · OAM 하나)
//     244 물리 · 245 변화 · 246 특수 `type_icons/{physical,status,special}.NCGR.lz`
//
// 둘을 굽는다 (`public/data/`):
//
//   typeIcons.{지역판}.png  32×16 × 18칸을 가로로. **칸 번호 = 엔진 타입 번호**(`TYPE_NORMAL`=0 … `TYPE_DARK`=17, 9번은 ???)
//   moveClass.png           32×16 × 3칸을 가로로. **칸 번호 = 엔진 분류 번호**(`CLASS_PHYSICAL`=0 · `CLASS_SPECIAL`=1 · `CLASS_STATUS`=2)
//
// ⚠️ **타입 그림은 글자가 그려져 있어서 지역판마다 다르다.** 한국판 롬의 것이 `노말` · `격투` · `비행`이고 미국판은 `NORMAL`이다.
// 그래서 지역판마다 한 장씩 만든다(`names/moves.{지역판}.json`과 같다). 분류 그림 셋은 세 롬에서 바이트까지 같아서 한 장이다.
//
// ⚠️ **타입마다 팔레트 줄이 다르다** (`sMoveTypeIconPaletteIndex` · `type_icon.c:41`). 한 줄로 다 칠하면 격투가 불꽃 색이 된다.
// 분류는 물리 0 · 특수 1 · 변화 0줄이다 (`sMoveCategoryIconPaletteIndex` · `type_icon.c:74`).
//
// ⚠️ **`src/import/platinum/typeIcons.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const sources = require('../raw/sources.cjs')
const { encodePng } = require('./png')
const { lz77, palettes, chars, cellBank, drawCell } = require('./ntrcell')

const MEMBERS = 343
const PALETTE = 74
const CELL = 242
const W = 32
const H = 16

/** 타입 번호 차례. `[이름, 글자 그림 칸, 팔레트 줄]` — 칸은 `sprites.order` 줄 − 1, 줄은 `sMoveTypeIconPaletteIndex` */
const TYPES = [
  ['normal', 234, 0], ['fighting', 225, 0], ['flying', 227, 1], ['poison', 235, 1], ['ground', 229, 0],
  ['rock', 237, 0], ['bug', 231, 2], ['ghost', 228, 1], ['steel', 238, 0], ['mystery', 236, 2],
  ['fire', 226, 0], ['water', 241, 1], ['grass', 233, 2], ['electric', 222, 0], ['psychic', 223, 1],
  ['ice', 230, 1], ['dragon', 221, 2], ['dark', 224, 0],
]
/** 분류 번호 차례. `sMoveCategoryIconPaletteIndex` */
const CLASSES = [['physical', 244, 0], ['special', 246, 1], ['status', 245, 0]]

/** 롬 안 자리. 한국판만 글자가 든 그림이라 `/resource/kor/` 밑으로 옮겼다 (`localePaths.ts`) */
const NARC_AT = {
  en: '/battle/graphic/pl_batt_obj.narc',
  ja: '/battle/graphic/pl_batt_obj.narc',
  ko: '/resource/kor/battle_graphic/pl_batt_obj.narc',
}

/** 32×16 칸 여럿을 가로 한 줄로 */
function strip(narc, pal, cell, list) {
  const rgba = new Uint8Array(W * list.length * H * 4)
  list.forEach(([name, at, row], i) => {
    const one = new Uint8Array(W * H * 4)
    const pals = [pal[row]]
    if (drawCell(one, W, 0, 0, cell, chars(lz77(narc[at])), pals) === 0) throw new Error(`${name} 그림이 비었다`)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = (y * W + x) * 4, d = (y * W * list.length + i * W + x) * 4
        rgba[d] = one[s]; rgba[d + 1] = one[s + 1]; rgba[d + 2] = one[s + 2]; rgba[d + 3] = one[s + 3]
      }
    }
  })
  return encodePng(rgba, W * list.length, H)
}

function bake(locale) {
  const narc = openRom(sources.requirePlatinumRom(locale)).narc(NARC_AT[locale])
  if (narc.length !== MEMBERS) throw new Error(`pl_batt_obj가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const pal = palettes(narc[PALETTE])
  if (pal.length !== 3) throw new Error(`타입 팔레트가 ${pal.length}줄이다 — 3줄이라야 한다`)
  const { cells } = cellBank(narc[CELL])
  if (cells.length !== 1 || cells[0].length !== 1) throw new Error('타입 셀이 OAM 하나가 아니다')
  return { types: strip(narc, pal, cells[0], TYPES), classes: strip(narc, pal, cells[0], CLASSES) }
}

function main() {
  const out = path.join(ROOT, 'public/data')
  fs.mkdirSync(out, { recursive: true })
  let classes = null
  for (const locale of ['en', 'ko', 'ja']) {
    if (sources.platinumRom(locale) === null) { console.log(`타입 그림 — ${locale} 롬이 없어 건너뛴다`); continue }
    const baked = bake(locale)
    fs.writeFileSync(path.join(out, `typeIcons.${locale}.png`), baked.types)
    // 분류 그림은 세 롬이 같다 — 다르면 이 가정이 깨진 것이다
    if (classes !== null && !classes.equals(baked.classes)) throw new Error(`${locale} 롬의 분류 그림이 다르다`)
    classes = baked.classes
  }
  if (classes === null) throw new Error('롬이 하나도 없다')
  fs.writeFileSync(path.join(out, 'moveClass.png'), classes)
  console.log(`타입 그림 — ${TYPES.length}칸 × ${W}×${H} · 분류 ${CLASSES.length}칸`)
}

main()
