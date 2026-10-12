// 볼 씰 그림 여든 장 (`overlay076` 볼캡슐 편집기 · `unk_02097B18.c`의 `Unk_020F64D0` · `/application/custom_ball/data/cb_data.narc`)
//
//   cb_data.narc  (295칸)
//     93   셀(NCER) — 24×24 한 칸 (OAM 넷: 16×16 · 8×16 · 16×8 · 8×8 — `ov76_0223B140`이 캡슐 위 씰에 쓰는 셀)
//     185~264   씰 80종의 글자(NCGR · LZ77) — 씰 번호 n의 멤버 번호는 `Unk_020F64D0[n]`의 첫째 칸이고
//               `src/engine/world/sealTables.ts`의 `SEAL_ICON_MEMBER[n − 1]`이다 (`pnpm gen:seals`)
//     293   팔레트(NCLR) — 씰 전부가 첫 줄 하나를 같이 쓴다 (`SpriteSystem_LoadPaletteBuffer(… 293 … paletteIdx 1 …)`)
//
// 하나를 굽는다 (`public/data/sealIcons.png`):
//
//   240×192 — 24×24를 가로 10 · 세로 8로. 칸 번호 = 씰 번호 − 1 (왼쪽 위부터 가로로)
//
// 좌표 표는 따로 없다 — 칸이 고정 격자다(`SEAL_ICON_SHEET`). 0번 색은 투명이다 (OBJ).
//
// ⚠️ **세 롬이 같다**(글자가 없다 — 멤버 셋의 해시가 같다). 롬마다 따로 안 굽고 있는 것 하나로 한 벌이다.
// ⚠️ **`src/import/platinum/sealIcons.ts`와 한 줄씩 같아야 한다.** 칸 번호 표는 이쪽이 디컴프에서 읽고 저쪽은 `sealTables.ts`에서 읽는다 —
//    둘이 같은지는 `menuAssets.test.ts`가 맞댄다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const sources = require('../raw/sources.cjs')
const { encodePng } = require('./png')
const { palettes, chars, lz77, cellBank, drawCell } = require('./ntrcell')

const NARC = '/application/custom_ball/data/cb_data.narc'
const CELL = 93
const PALETTE = 293
const SEALS = 80
const COLS = 10
const S = 24

/** 디컴프의 씰 표 — 첫째 칸이 글자 멤버 번호다 */
function iconMembers() {
  const src = fs.readFileSync(path.join(sources.requireDir('references.decomp'), 'src/unk_02097B18.c'), 'utf8')
  const body = src.match(/Unk_020F64D0\[SEAL_ID_MAX\] = \{([\s\S]*?)\n\};/)
  if (body === null) throw new Error('Unk_020F64D0을 못 찾았다')
  const rows = [...body[1].matchAll(/\{([^}]*)\}/g)].map((m) => Number(m[1].split(',')[0].trim()))
  if (rows.length !== SEALS + 1) throw new Error(`줄이 ${rows.length}개다 — ${SEALS + 1}이어야 한다`)
  return rows.slice(1)
}

function main() {
  const locale = ['en', 'ko', 'ja'].find((l) => sources.platinumRom(l) !== null)
  if (locale === undefined) throw new Error('롬이 하나도 없다')
  const narc = openRom(sources.requirePlatinumRom(locale)).narc(NARC)
  const pal = palettes(narc[PALETTE])[0]
  const oams = cellBank(narc[CELL]).cells[0]
  if (oams === undefined || oams.length !== 4) throw new Error('씰 셀이 OAM 넷이 아니다')
  const members = iconMembers()
  const rows = Math.ceil(SEALS / COLS)
  const rgba = new Uint8Array(COLS * S * rows * S * 4)
  members.forEach((member, i) => {
    const tiles = chars(lz77(narc[member]))
    if (tiles.length < 9 * 32) throw new Error(`씰 ${i + 1}의 글자가 타일 ${tiles.length / 32}개다 — 9개라야 한다`)
    const one = new Uint8Array(S * S * 4)
    if (drawCell(one, S, 0, 0, oams, tiles, [pal]) === 0) throw new Error(`씰 ${i + 1}이 비었다`)
    const cx = (i % COLS) * S, cy = Math.floor(i / COLS) * S
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const s = (y * S + x) * 4, d = ((cy + y) * COLS * S + cx + x) * 4
        rgba[d] = one[s]; rgba[d + 1] = one[s + 1]; rgba[d + 2] = one[s + 2]; rgba[d + 3] = one[s + 3]
      }
    }
  })
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'public/data/sealIcons.png'), encodePng(rgba, COLS * S, rows * S))
  console.log(`볼 씰 그림 — ${SEALS}장 × ${S}×${S} (${COLS}×${rows})`)
}

main()
