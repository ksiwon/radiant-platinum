// 트레이너 카드와 배지 케이스 (`applications/trainer_case` · `TrainerCaseApp_Init`)
//
//   /graphic/trainer_case.narc  66칸 (`res/graphics/trainer_case/trainer_case.order` 차례)
//     0~6   카드 팔레트(256색) — 노멀 · 코발트 · 브론즈 · 실버 · 골드 · 블랙 · 도감 없음
//     10    케이스 팔레트 — 플래티나 (`TrainerCase_LoadCasePalette`의 `VERSION_PLATINUM`)
//     16~23 배지 팔레트 — 석탄 · 숲 · 광석 · 늪 · 유물 · 광산 · 고드름 · 등대. 한 벌에 네 줄이 **때 묻은 정도**다
//     27    카드 타일(8bpp) · 29 케이스 타일(4bpp) · 31 주인공 타일(8bpp) · 33 배지 셀 타일(4bpp)
//     35 카드 앞면 · 36 뒷면 (회전 BG라 한 칸이 1바이트) · 38 케이스 · 40 광휘 · 41 빛나 (16비트 칸)
//     44 배지 셀 · 46 배지 셀 애니 (애니 0~7이 배지 여덟 — `Sprite_SetAnim(sprite, badgeID)`)
//
// 넷을 굽는다 (`public/data/trainerCase/`):
//
//   card.png    앞면 | 뒷면 × 팔레트 일곱 줄. 카드가 칠해진 상자만큼 잘라 낸다
//   case.png    아래 화면의 배지 케이스 256×192 — 빈 자리마다 배지 모양 홈이 이 판에 그려져 있다
//   badges.png  배지 여덟 칸 × 때 네 줄. 여덟 배지가 칠한 상자를 합친 만큼 잘라 낸다
//   trainer.png 광휘 | 빛나. 둘이 칠한 상자를 합친 만큼 잘라 낸다
//   index.json  자른 상자 셋(화면 좌표)과 팔레트마다의 글자 색
//
// ⚠️ **카드 색은 판 전체가 아니라 1~3줄과 15줄만 갈린다** (`TrainerCase_LoadCardPalette`). 처음에 노멀 256색을 통째로
// 붓고, 등급 팔레트에서 그 넷만 덮는다 — 주인공 그림의 색(4줄부터)은 그래서 등급과 상관없이 노멀 판에서 온다.
// 별은 따로 그린 것이 아니다 — 1줄 6~15번이 별 다섯의 켜짐 · 꺼짐 색이라, 등급이 오를수록 노란 별이 하나씩 켜진다.
//
// ⚠️ **글자 색은 15줄의 1 · 2번이다** — 창이 `palette = 15`로 서고 `TEXT_COLOR(1, 2, 0)`으로 찍는다 (`card_text.c`).
// 블랙 카드만 그 둘이 노랑 · 짙은 회색으로 바뀐다.
//
// ⚠️ **`src/import/platinum/trainerCase.ts`와 한 줄씩 같아야 한다.**
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { palettes, chars, screen, screenCell, cellBank, cellAnims, drawCell, TILE } = require('./ntrcell')

const MEMBERS = 66
const CARD_PALETTES = 7
const CASE_PALETTE = 10
const BADGE_PALETTE = 16
const CARD_TILES = 27
const CASE_TILES = 29
const PLAYER_TILES = 31
const BADGE_TILES = 33
const CARD_FRONT = 35
const CARD_BACK = 36
const CASE_MAP = 38
const PLAYERS = [40, 41]
const BADGE_CELLS = 44
const BADGE_ANIMS = 46
const BADGES = 8
const DIRT_LEVELS = 4
/** 등급 팔레트가 덮는 줄 (`GXS_LoadBGPltt(… PLTT_OFFSET(1), PALETTE_SIZE_BYTES * 3)` · `PLTT_OFFSET(15)`) */
const CARD_ROWS = [1, 2, 3, 15]
const TEXT_ROW = 15
const SCREEN_W = 256
const SCREEN_H = 192
const CELL = 64
const TILE8 = 64

/** 256색 판을 한 줄로 */
const flat = (rows) => rows.flat()

/** 등급 하나의 256색 — 노멀을 깔고 네 줄만 덮는다 */
function cardPalette(base, level) {
  const out = base.map((row) => row.slice())
  for (const r of CARD_ROWS) out[r] = level[r]
  return flat(out)
}

/** 회전 BG 판(칸 1바이트)을 8bpp 타일로 찍는다. 0번 색은 뚫는다 */
function drawAffine(rgba, map, tiles, pal) {
  const across = map.readUInt16LE(0x18) / TILE
  for (let cy = 0; cy < SCREEN_H / TILE; cy++) {
    for (let cx = 0; cx < SCREEN_W / TILE; cx++) {
      const tile = map[0x24 + cy * across + cx]
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const idx = tiles[tile * TILE8 + y * TILE + x] ?? 0
          if (idx === 0) continue
          const c = pal[idx]
          const at = ((cy * TILE + y) * SCREEN_W + cx * TILE + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
        }
      }
    }
  }
}

/** 16비트 칸 판을 8bpp 타일로 찍는다. 쓴 색 번호를 돌려준다 */
function drawExtended(rgba, scr, tiles, pal) {
  const used = new Set()
  for (let cy = 0; cy < SCREEN_H / TILE; cy++) {
    for (let cx = 0; cx < SCREEN_W / TILE; cx++) {
      const cell = screenCell(scr, cx, cy)
      const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
          const idx = tiles[tile * TILE8 + sy * TILE + sx] ?? 0
          if (idx === 0) continue
          used.add(idx)
          const c = pal[idx]
          const at = ((cy * TILE + y) * SCREEN_W + cx * TILE + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
        }
      }
    }
  }
  return used
}

/** 4bpp 판. 0번 색 자리에 뒤판색을 깐다 */
function drawText(rgba, scr, tiles, pals, backdrop) {
  for (let cy = 0; cy < SCREEN_H / TILE; cy++) {
    for (let cx = 0; cx < SCREEN_W / TILE; cx++) {
      const cell = screenCell(scr, cx, cy)
      const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      const pal = pals[cell >> 12] ?? []
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
          const byte = tiles[tile * 32 + sy * 4 + (sx >> 1)] ?? 0
          const idx = sx & 1 ? byte >> 4 : byte & 0xf
          const c = idx === 0 ? backdrop : pal[idx]
          if (!c) continue
          const at = ((cy * TILE + y) * SCREEN_W + cx * TILE + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
        }
      }
    }
  }
}

/** 칠해진 픽셀의 상자 [x, y, w, h]를 앞의 상자와 합친다 */
function unionBox(rgba, w, h, box) {
  let [x0, y0, x1, y1] = box === null ? [w, h, -1, -1] : [box[0], box[1], box[0] + box[2] - 1, box[1] + box[3] - 1]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  if (x1 < x0) throw new Error('칠해진 픽셀이 하나도 없다')
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1]
}

/** `src`의 `box`를 `dst`의 `(dx, dy)`로 옮긴다 */
function blit(dst, dw, dx, dy, src, sw, box) {
  const [bx, by, bw, bh] = box
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const s = ((by + y) * sw + bx + x) * 4
      const d = ((dy + y) * dw + dx + x) * 4
      dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = src[s + 3]
    }
  }
}

function main() {
  const narc = openRom().narc('/graphic/trainer_case.narc')
  if (narc.length !== MEMBERS) throw new Error(`trainer_case가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  const out = path.join(ROOT, 'public/data/trainerCase')
  fs.mkdirSync(out, { recursive: true })

  // ── 카드 — 앞뒤 × 팔레트 일곱 ────────────────────────────────────────
  const base = palettes(narc[0])
  if (base.length !== 16) throw new Error(`카드 팔레트가 ${base.length}줄이다 — 16줄이라야 한다`)
  const levels = Array.from({ length: CARD_PALETTES }, (_, i) => palettes(narc[i]))
  const cardTiles = chars(narc[CARD_TILES])
  const faces = levels.map((level) => {
    const pal = cardPalette(base, level)
    return [CARD_FRONT, CARD_BACK].map((m) => {
      const rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4)
      drawAffine(rgba, narc[m], cardTiles, pal)
      return rgba
    })
  })
  let card = null
  for (const face of faces[0]) card = unionBox(face, SCREEN_W, SCREEN_H, card)
  const cardRgba = new Uint8Array(card[2] * 2 * card[3] * CARD_PALETTES * 4)
  faces.forEach((pair, row) => pair.forEach((face, col) => {
    blit(cardRgba, card[2] * 2, col * card[2], row * card[3], face, SCREEN_W, card)
  }))
  fs.writeFileSync(path.join(out, 'card.png'), encodePng(cardRgba, card[2] * 2, card[3] * CARD_PALETTES))

  // ── 주인공 — 광휘 · 빛나 ─────────────────────────────────────────────
  const playerTiles = chars(narc[PLAYER_TILES])
  const normal = flat(base)
  const players = PLAYERS.map((m) => {
    const rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4)
    const used = drawExtended(rgba, screen(narc[m]), playerTiles, normal)
    // 등급이 덮는 줄을 쓰면 카드 색에 따라 주인공 색이 바뀐다 — 그때는 등급마다 따로 구워야 한다
    for (const idx of used) {
      if (CARD_ROWS.includes(idx >> 4)) throw new Error(`주인공 그림이 등급 팔레트 ${idx >> 4}줄을 쓴다`)
    }
    return rgba
  })
  let trainer = null
  for (const p of players) trainer = unionBox(p, SCREEN_W, SCREEN_H, trainer)
  const trainerRgba = new Uint8Array(trainer[2] * PLAYERS.length * trainer[3] * 4)
  players.forEach((p, i) => blit(trainerRgba, trainer[2] * PLAYERS.length, i * trainer[2], 0, p, SCREEN_W, trainer))
  fs.writeFileSync(path.join(out, 'trainer.png'), encodePng(trainerRgba, trainer[2] * PLAYERS.length, trainer[3]))

  // ── 케이스 ───────────────────────────────────────────────────────────
  const casePals = palettes(narc[CASE_PALETTE])
  const caseRgba = new Uint8Array(SCREEN_W * SCREEN_H * 4)
  drawText(caseRgba, screen(narc[CASE_MAP]), chars(narc[CASE_TILES]), casePals.slice(0, 1), casePals[0][0])
  fs.writeFileSync(path.join(out, 'case.png'), encodePng(caseRgba, SCREEN_W, SCREEN_H))

  // ── 배지 — 여덟 × 때 넷 ─────────────────────────────────────────────
  const { cells } = cellBank(narc[BADGE_CELLS])
  const anims = cellAnims(narc[BADGE_ANIMS])
  const badgeTiles = chars(narc[BADGE_TILES])
  const drawn = []
  let badge = null
  for (let b = 0; b < BADGES; b++) {
    const oams = cells[anims[b].frames[0][0]]
    // `TrainerCase_DrawBadgeDirt`가 배지 b의 팔레트 자리 b에 때 줄을 붓는다 — 셀이 다른 자리를 보면 그 가정이 깨진 것이다
    if (oams.some((o) => o.pal !== b)) throw new Error(`배지 ${b}의 셀이 팔레트 ${b}번을 안 쓴다`)
    const dirt = palettes(narc[BADGE_PALETTE + b])
    drawn.push(Array.from({ length: DIRT_LEVELS }, (_, d) => {
      const pals = []
      pals[b] = dirt[d]
      const rgba = new Uint8Array(CELL * CELL * 4)
      if (drawCell(rgba, CELL, 0, 0, oams, badgeTiles, pals) === 0) throw new Error(`배지 ${b}가 비었다`)
      badge = unionBox(rgba, CELL, CELL, badge)
      return rgba
    }))
  }
  const badgeRgba = new Uint8Array(badge[2] * BADGES * badge[3] * DIRT_LEVELS * 4)
  drawn.forEach((rows, b) => rows.forEach((rgba, d) => {
    blit(badgeRgba, badge[2] * BADGES, b * badge[2], d * badge[3], rgba, CELL, badge)
  }))
  fs.writeFileSync(path.join(out, 'badges.png'), encodePng(badgeRgba, badge[2] * BADGES, badge[3] * DIRT_LEVELS))

  const meta = writeJson('trainerCase/index.json', {
    card, trainer, badge,
    text: levels.map((level) => [level[TEXT_ROW][1], level[TEXT_ROW][2]]),
  })
  console.log(`트레이너 카드 — 카드 ${card[2]}×${card[3]} · 주인공 ${trainer[2]}×${trainer[3]} · 배지 ${badge[2]}×${badge[3]} · ${meta.rel}`)
}

main()
