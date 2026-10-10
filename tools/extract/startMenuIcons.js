// 시작 메뉴 아이콘 (`start_menu.c` · `StartMenu_InitSprites` · `/graphic/menu_gra.narc`)
//
//   /graphic/menu_gra.narc  11칸 (`res/graphics/start_menu/start_menu.order` 차례)
//     0~2 커서(NANR · NCER · NCGR)   3 아이콘 NANR   4 아이콘 NCER(셀 열 · 32×32)   5 `menu.NCLR`   6 아이콘 NCGR
//     7~10 지하통로 쪽 — 안 쓴다
//
// 둘을 굽는다 (`public/data/`):
//
//   startMenuIcons.{지역판}.png   64×329. **왼쪽 32칸은 컬러 · 오른쪽 32칸은 회색**, 아래로 33픽셀 간격으로 열 칸.
//                        컬러 = 팔레트 1행(`PALETTE_COLORED`) · 회색 = 0행(`PALETTE_GRAYSCALE`) — `constants/start_menu.h`.
//                        칸 차례 = `StartMenuOption`: 도감0 · 포켓몬1 · 가방(남)2 · 카드3 · 리포트4 · 설정5 · 닫기6 · 채팅7 · 포기8 · 가방(여)9
//                        (`start_menu.c:768`이 여자 가방을 9번 칸으로 바꾼다)
//   startMenuIcons.json  고른 줄이 움직이는 법. 아이콘마다 NANR 순서 셋 `3i`(없음) · `3i+1`(부풀기 — 한 번) · `3i+2`(흔들기 — 되풀이)
//                        (`ICON_ANIM_*`). 프레임마다 `[머무는 프레임 수, 배율, 도]`. 열 아이콘이 다 같은 값이어야 한다
//
// ⚠️ **그림이 지역판마다 다르다.** 한국판 롬은 5번 칸(설정 — DS 아이콘) 하나를 바꿔 실었다(미국판과 일본판은 같다). 그래서 
// 지역판마다 한 장이고, 움직임 표는 세 롬이 같아서 한 벌이다.
//
// ⚠️ **회색은 CSS 필터가 아니라 롬의 팔레트 0행이다.** 흰 바탕에 올리는 판이라 굽는다.
//
// ⚠️ **`src/import/platinum/startMenuIcons.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const sources = require('../raw/sources.cjs')
const { encodePng } = require('./png')
const { lz77, palettes, chars, cellBank, drawCell } = require('./ntrcell')

const MEMBERS = 11
const ANIMS = 3
const CELLS = 4
const PALETTE = 5
const TILES = 6
const ICONS = 10
const CELL = 32
const PITCH = 33
const GRAY_ROW = 0
const COLOR_ROW = 1
const ANIM_PER_ICON = 3
/** `StartMenuOption` 차례 (여자 가방이 마지막) */
const ORDER = ['pokedex', 'pokemon', 'bag', 'trainerCase', 'save', 'options', 'exit', 'chat', 'retire', 'bagFemale']

/**
 * NANR의 SRT 순서 하나를 `[프레임 수, 배율, 도]` 열로.
 *
 * 순서 머리 16바이트: 프레임 수 u16 · 되풀이 시작 u16 · 요소 u16(0 번호 · 1 번호+SRT · 2 번호+이동) · 종류 u16 · 재생 모드 u32 · 프레임 표 u32.
 * 프레임 8바이트: 자료 자리 u32 · 프레임 수 u16 · 빈 u16. SRT 자료 16바이트: 번호 u16 · 회전 u16(65536 = 한 바퀴) · 배율 x s32 · y s32 · 이동 s16 둘.
 * 배율은 4096이 1배다(1.20.12 고정소수)
 */
function srtFrames(buf, seq) {
  const k = 0x10
  const seqAt = k + 8 + buf.readUInt32LE(k + 12)
  const frameAt = k + 8 + buf.readUInt32LE(k + 16)
  const dataAt = k + 8 + buf.readUInt32LE(k + 20)
  const q = seqAt + seq * 16
  const n = buf.readUInt16LE(q)
  const elem = buf.readUInt16LE(q + 4)
  const mode = buf.readUInt16LE(q + 8)
  if (elem !== 1) throw new Error(`순서 ${seq}가 SRT가 아니다 (요소 ${elem})`)
  const arr = frameAt + buf.readUInt32LE(q + 12)
  const frames = []
  for (let f = 0; f < n; f++) {
    const fo = arr + f * 8
    const d = dataAt + buf.readUInt32LE(fo)
    const time = buf.readUInt16LE(fo + 4)
    // 부호 있는 회전 — 65536이 한 바퀴라 반대로 도는 값은 위쪽 절반에 있다
    const rot = buf.readInt16LE(d + 2)
    const sx = buf.readInt32LE(d + 4), sy = buf.readInt32LE(d + 8)
    if (sx !== sy) throw new Error(`순서 ${seq}의 가로 · 세로 배율이 다르다`)
    if (buf.readInt16LE(d + 12) !== 0 || buf.readInt16LE(d + 14) !== 0) throw new Error(`순서 ${seq}가 옮긴다`)
    frames.push([time, Math.round((sx / 4096) * 10000) / 10000, Math.round((rot / 65536) * 360 * 1000) / 1000])
  }
  return { mode, frames }
}

function bake(locale) {
  const narc = openRom(sources.requirePlatinumRom(locale)).narc('/graphic/menu_gra.narc')
  if (narc.length !== MEMBERS) throw new Error(`menu_gra가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const pal = palettes(narc[PALETTE])
  const tiles = chars(lz77(narc[TILES]))
  const { cells } = cellBank(narc[CELLS])
  if (cells.length !== ICONS) throw new Error(`아이콘 셀이 ${cells.length}개다 — ${ICONS}개라야 한다`)

  const w = CELL * 2, h = PITCH * ICONS - (PITCH - CELL)
  const rgba = new Uint8Array(w * h * 4)
  cells.forEach((oams, i) => {
    // 셀 하나가 OAM 하나(32×32)이고 팔레트 줄은 0이다 — `plttIdx`가 거기에 1 · 0을 더해 컬러 · 회색이 갈린다
    if (oams.length !== 1 || oams[0].w !== CELL || oams[0].h !== CELL || oams[0].pal !== 0) {
      throw new Error(`아이콘 셀 ${i}가 32×32 하나가 아니다`)
    }
    for (const [col, row] of [[0, COLOR_ROW], [1, GRAY_ROW]]) {
      const one = new Uint8Array(CELL * CELL * 4)
      if (drawCell(one, CELL, 0, 0, oams, tiles, [pal[row]]) === 0) throw new Error(`아이콘 ${i}가 비었다`)
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const s = (y * CELL + x) * 4, d = ((i * PITCH + y) * w + col * CELL + x) * 4
          rgba[d] = one[s]; rgba[d + 1] = one[s + 1]; rgba[d + 2] = one[s + 2]; rgba[d + 3] = one[s + 3]
        }
      }
    }
  })
  // 움직임 — 열 아이콘이 같은 값이어야 하나로 줄인다
  const anim = lz77(narc[ANIMS])
  const pick = (off) => Array.from({ length: ICONS }, (_, i) => srtFrames(anim, i * ANIM_PER_ICON + off))
  const same = (list) => list.every((s) => JSON.stringify(s) === JSON.stringify(list[0]))
  const swell = pick(1), wiggle = pick(2)
  if (!same(swell) || !same(wiggle)) throw new Error('아이콘마다 움직임이 다르다 — 하나로 줄일 수 없다')
  return {
    png: encodePng(rgba, w, h),
    meta: {
      cell: CELL, pitch: PITCH, order: ORDER, grayX: CELL,
      swell: { once: swell[0].mode === 1, frames: swell[0].frames },
      wiggle: { loop: wiggle[0].mode === 2, frames: wiggle[0].frames },
    },
  }
}

function main() {
  const out = path.join(ROOT, 'public/data')
  fs.mkdirSync(out, { recursive: true })
  let meta = null
  for (const locale of ['en', 'ko', 'ja']) {
    if (sources.platinumRom(locale) === null) { console.log(`시작 메뉴 아이콘 — ${locale} 롬이 없어 건너뛴다`); continue }
    const baked = bake(locale)
    fs.writeFileSync(path.join(out, `startMenuIcons.${locale}.png`), baked.png)
    // 움직임 표는 세 롬이 같다 — 다르면 이 가정이 깨진 것이다
    if (meta !== null && JSON.stringify(meta) !== JSON.stringify(baked.meta)) throw new Error(`${locale} 롬의 움직임이 다르다`)
    meta = baked.meta
  }
  if (meta === null) throw new Error('롬이 하나도 없다')
  const written = writeJson('startMenuIcons.json', meta)
  console.log(`시작 메뉴 아이콘 — 64×${PITCH * ICONS - (PITCH - CELL)} · 열 칸 · ${written.rel}`)
}

main()
