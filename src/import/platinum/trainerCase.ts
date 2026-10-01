// 트레이너 카드와 배지 케이스 — 브라우저에서 (`applications/trainer_case`)
//
// ⚠️ **`tools/extract/trainerCase.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 팔레트 줄 · 자르는 상자)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import type { Rgb } from './nitrotex'
import { cellAnims, cellBank, drawCell } from './ntrcell'
import { chars, palettes, screen, screenCell, TILE, type Screen } from './ntrgfx'
import { encodePng } from './png'
import { check, json, readRomFile, type ConvertContext, type Produced } from './convertTypes'

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
const PLAYERS = [40, 41] as const
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

/** 자른 상자 — [x, y, 폭, 높이] */
type Box = [number, number, number, number]

/** 등급 하나의 256색 — 노멀을 깔고 네 줄만 덮는다 */
function cardPalette(base: readonly (readonly Rgb[])[], level: readonly (readonly Rgb[])[]): Rgb[] {
  const out = base.map((row) => row.slice())
  for (const r of CARD_ROWS) out[r] = level[r]!.slice()
  return out.flat()
}

/** 회전 BG 판(칸 1바이트)을 8bpp 타일로 찍는다. 0번 색은 뚫는다 */
function drawAffine(rgba: Uint8Array, map: Uint8Array, tiles: Uint8Array, pal: readonly Rgb[]): void {
  const across = (map[0x18]! | (map[0x19]! << 8)) / TILE
  for (let cy = 0; cy < SCREEN_H / TILE; cy++) {
    for (let cx = 0; cx < SCREEN_W / TILE; cx++) {
      const tile = map[0x24 + cy * across + cx]!
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const idx = tiles[tile * TILE8 + y * TILE + x] ?? 0
          if (idx === 0) continue
          const c = pal[idx]!
          const at = ((cy * TILE + y) * SCREEN_W + cx * TILE + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
        }
      }
    }
  }
}

/** 16비트 칸 판을 8bpp 타일로 찍는다. 쓴 색 번호를 돌려준다 */
function drawExtended(rgba: Uint8Array, scr: Screen, tiles: Uint8Array, pal: readonly Rgb[]): Set<number> {
  const used = new Set<number>()
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
          const c = pal[idx]!
          const at = ((cy * TILE + y) * SCREEN_W + cx * TILE + x) * 4
          rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
        }
      }
    }
  }
  return used
}

/** 4bpp 판. 0번 색 자리에 뒤판색을 깐다 */
function drawText(
  rgba: Uint8Array, scr: Screen, tiles: Uint8Array, pals: readonly (readonly Rgb[])[], backdrop: Rgb,
): void {
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

/** 칠해진 픽셀의 상자를 앞의 상자와 합친다 */
function unionBox(rgba: Uint8Array, w: number, h: number, box: Box | null): Box {
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
function blit(dst: Uint8Array, dw: number, dx: number, dy: number, src: Uint8Array, sw: number, box: Box): void {
  const [bx, by, bw, bh] = box
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const s = ((by + y) * sw + bx + x) * 4
      const d = ((dy + y) * dw + dx + x) * 4
      dst[d] = src[s]!; dst[d + 1] = src[s + 1]!; dst[d + 2] = src[s + 2]!; dst[d + 3] = src[s + 3]!
    }
  }
}

export async function convertTrainerCase(ctx: ConvertContext): Promise<Produced> {
  // ⚠️ **한국판은 이 아카이브를 `/resource/kor/` 밑으로 옮겼다** — 카드 위 「트레이너 카드」 글자가 타일에 그려져 있어서다
  const narc = await readRomFile(ctx, '/graphic/trainer_case.narc')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`trainer_case가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`trainer_case에 ${String(at)}번 칸이 없다`)
    return b
  }

  // ── 카드 — 앞뒤 × 팔레트 일곱 ────────────────────────────────────────
  const base = palettes(take(0))
  if (base.length !== 16) throw new Error(`카드 팔레트가 ${String(base.length)}줄이다 — 16줄이라야 한다`)
  const levels = Array.from({ length: CARD_PALETTES }, (_, i) => palettes(take(i)))
  const cardTiles = chars(take(CARD_TILES)).data
  const faces = levels.map((level) => {
    const pal = cardPalette(base, level)
    return [CARD_FRONT, CARD_BACK].map((m) => {
      const rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4)
      drawAffine(rgba, take(m), cardTiles, pal)
      return rgba
    })
  })
  let card: Box | null = null
  for (const face of faces[0]!) card = unionBox(face, SCREEN_W, SCREEN_H, card)
  const cardBox = card!
  const cardRgba = new Uint8Array(cardBox[2] * 2 * cardBox[3] * CARD_PALETTES * 4)
  faces.forEach((pair, row) => pair.forEach((face, col) => {
    blit(cardRgba, cardBox[2] * 2, col * cardBox[2], row * cardBox[3], face, SCREEN_W, cardBox)
  }))
  check(ctx)

  // ── 주인공 — 광휘 · 빛나 ─────────────────────────────────────────────
  const playerTiles = chars(take(PLAYER_TILES)).data
  const normal = base.flat()
  const players = PLAYERS.map((m) => {
    const rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4)
    const used = drawExtended(rgba, screen(take(m)), playerTiles, normal)
    // 등급이 덮는 줄을 쓰면 카드 색에 따라 주인공 색이 바뀐다 — 그때는 등급마다 따로 구워야 한다
    for (const idx of used) {
      if (CARD_ROWS.includes(idx >> 4)) throw new Error(`주인공 그림이 등급 팔레트 ${String(idx >> 4)}줄을 쓴다`)
    }
    return rgba
  })
  let trainer: Box | null = null
  for (const p of players) trainer = unionBox(p, SCREEN_W, SCREEN_H, trainer)
  const trainerBox = trainer!
  const trainerRgba = new Uint8Array(trainerBox[2] * PLAYERS.length * trainerBox[3] * 4)
  players.forEach((p, i) => {
    blit(trainerRgba, trainerBox[2] * PLAYERS.length, i * trainerBox[2], 0, p, SCREEN_W, trainerBox)
  })

  // ── 케이스 ───────────────────────────────────────────────────────────
  const casePals = palettes(take(CASE_PALETTE))
  const caseRgba = new Uint8Array(SCREEN_W * SCREEN_H * 4)
  drawText(caseRgba, screen(take(CASE_MAP)), chars(take(CASE_TILES)).data, casePals.slice(0, 1), casePals[0]![0]!)
  check(ctx)

  // ── 배지 — 여덟 × 때 넷 ─────────────────────────────────────────────
  const { cells } = cellBank(take(BADGE_CELLS))
  const anims = cellAnims(take(BADGE_ANIMS))
  const badgeTiles = chars(take(BADGE_TILES)).data
  const drawn: Uint8Array[][] = []
  let badge: Box | null = null
  for (let b = 0; b < BADGES; b++) {
    const oams = cells[anims[b]!.frames[0]![0]]!
    // `TrainerCase_DrawBadgeDirt`가 배지 b의 팔레트 자리 b에 때 줄을 붓는다 — 셀이 다른 자리를 보면 그 가정이 깨진 것이다
    if (oams.some((o) => o.pal !== b)) throw new Error(`배지 ${String(b)}의 셀이 팔레트 ${String(b)}번을 안 쓴다`)
    const dirt = palettes(take(BADGE_PALETTE + b))
    const rows: Uint8Array[] = []
    for (let d = 0; d < DIRT_LEVELS; d++) {
      const pals: Rgb[][] = []
      pals[b] = dirt[d]!
      const rgba = new Uint8Array(CELL * CELL * 4)
      if (drawCell(rgba, CELL, 0, 0, oams, badgeTiles, pals) === 0) throw new Error(`배지 ${String(b)}가 비었다`)
      badge = unionBox(rgba, CELL, CELL, badge)
      rows.push(rgba)
    }
    drawn.push(rows)
  }
  const badgeBox = badge!
  const badgeRgba = new Uint8Array(badgeBox[2] * BADGES * badgeBox[3] * DIRT_LEVELS * 4)
  drawn.forEach((rows, b) => rows.forEach((rgba, d) => {
    blit(badgeRgba, badgeBox[2] * BADGES, b * badgeBox[2], d * badgeBox[3], rgba, CELL, badgeBox)
  }))
  check(ctx)

  return new Map([
    ['data/trainerCase/card.png', await encodePng(cardRgba, cardBox[2] * 2, cardBox[3] * CARD_PALETTES)],
    ['data/trainerCase/trainer.png', await encodePng(trainerRgba, trainerBox[2] * PLAYERS.length, trainerBox[3])],
    ['data/trainerCase/case.png', await encodePng(caseRgba, SCREEN_W, SCREEN_H)],
    ['data/trainerCase/badges.png', await encodePng(badgeRgba, badgeBox[2] * BADGES, badgeBox[3] * DIRT_LEVELS)],
    ['data/trainerCase/index.json', json({
      card: cardBox, trainer: trainerBox, badge: badgeBox,
      text: levels.map((level) => [level[TEXT_ROW]![1], level[TEXT_ROW]![2]]),
    })],
  ])
}
