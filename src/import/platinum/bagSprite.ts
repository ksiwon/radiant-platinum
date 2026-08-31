// 가방 그림 + 주머니 아이콘 — 브라우저에서 (DESIGN.md §5)
//
// ⚠️ **`tools/extract/bagSprite.js`와 한 줄씩 같아야 한다.** 브라우저 변환기가
// 없는 그룹은 설치본에서 통째로 없고, 개발 서버에서는 `public/data/`에 남은
// 노드 쪽 결과물이 그대로 보여서 안 보인다.
import { narcCount, narcEntry } from './nds'
import { color, type Rgb } from './nitrotex'
import { encodePng } from './png'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

/** 가방 한 장 */
const BAG = 64
/** 주머니 아이콘 한 칸 */
const ICON = 16
const TILE = 8
/** 주머니 여덟 (`POCKET_MAX`) */
const POCKETS = 8
/** 남·여 두 벌 */
const BODIES = 2
/** `graphic/pl_bag_gra.narc`의 칸 수 (`bag_graphics.order`) */
const MEMBERS = 39
const COLORS = 16
const PAL_DATA = 0x28
const TILE_DATA = 0x30

// 차례는 `bag_graphics.order`다
const MALE_TILES = 2, MALE_PALETTE = 3
const FEMALE_TILES = 6, FEMALE_PALETTE = 7
const ICON_TILES = 21, ICON_PALETTE = 22

/**
 * 주머니 번호 → 그림 번호.
 *
 * `bag_sprite_anim.json`의 `animationResults[N].index`다 — 그림 차례가
 * 주머니 차례와 다르다. 그대로 그리면 「도구」에 볼 칸이 열린 가방이 뜬다
 */
const FRAME_OF_POCKET = [1, 3, 4, 7, 2, 6, 5, 0]

const magic = (b: Uint8Array): string => String.fromCharCode(...b.subarray(0, 4))

function palette(buf: Uint8Array): Rgb[] {
  if (magic(buf) !== 'RLCN') throw new Error('NCLR이 아니다')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out: Rgb[] = []
  for (let i = 0; i < COLORS; i++) out.push(color(view.getUint16(PAL_DATA + i * 2, true)))
  return out
}

interface Sheet { px: Uint8Array, width: number, height: number }

/** NCGR을 **가로 `across`타일**로 편 색 번호 판. 1D 매핑이라 타일이 차례대로다 */
function tiles(buf: Uint8Array, across: number): Sheet {
  if (magic(buf) !== 'RGCN') throw new Error('NCGR이 아니다')
  const data = buf.subarray(TILE_DATA)
  const count = Math.floor((data.length * 2) / (TILE * TILE))
  const width = across * TILE
  const height = Math.ceil(count / across) * TILE
  const px = new Uint8Array(width * height)
  for (let t = 0; t < count; t++) {
    const ox = (t % across) * TILE, oy = Math.floor(t / across) * TILE
    for (let i = 0; i < TILE * TILE; i++) {
      const byte = data[t * ((TILE * TILE) / 2) + (i >> 1)]!
      px[(oy + (i >> 3)) * width + ox + (i & 7)] = i & 1 ? byte >> 4 : byte & 0xf
    }
  }
  return { px, width, height }
}

/** 한 조각을 아틀라스에 옮긴다. 칠한 픽셀 수를 돌려준다 */
function blit(
  rgba: Uint8Array, width: number, dx: number, dy: number,
  src: Sheet, sx: number, sy: number, w: number, h: number, pal: readonly Rgb[],
): number {
  let solid = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = src.px[(sy + y) * src.width + sx + x]!
      if (idx === 0) continue // 0번은 투명하다
      const c = pal[idx]
      if (!c) throw new Error(`색 ${String(idx)}번이 팔레트에 없다`)
      const at = ((dy + y) * width + dx + x) * 4
      rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
      solid++
    }
  }
  return solid
}

function member(narc: Uint8Array, at: number): Uint8Array {
  const buf = narcEntry(narc, at)
  if (!buf) throw new Error(`가방 아카이브에 ${String(at)}번 칸이 없다`)
  return buf
}

export async function convertBagSprite(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/graphic/pl_bag_gra.narc')
  if (!narc) throw new Error('pl_bag_gra.narc을 못 읽었다')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`가방 아카이브가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }

  // ── 가방 여덟 장 × 두 벌 ─────────────────────────────────────────────────
  const width = BAG * POCKETS, height = BAG * BODIES
  const rgba = new Uint8Array(width * height * 4)
  const bodies = [
    { tiles: MALE_TILES, palette: MALE_PALETTE },
    { tiles: FEMALE_TILES, palette: FEMALE_PALETTE },
  ]
  const filled: number[] = []
  let done = 0
  const steps = BODIES * POCKETS + POCKETS * 2
  for (const [row, body] of bodies.entries()) {
    const sheet = tiles(member(narc, body.tiles), BAG / TILE)
    const pal = palette(member(narc, body.palette))
    if (sheet.height !== BAG * POCKETS) {
      throw new Error(`가방 시트가 ${String(sheet.width)}×${String(sheet.height)}다 — 64×512라야 한다`)
    }
    for (let pocket = 0; pocket < POCKETS; pocket++) {
      const frame = FRAME_OF_POCKET[pocket]!
      filled.push(blit(rgba, width, pocket * BAG, row * BAG, sheet, 0, frame * BAG, BAG, BAG, pal))
      check(ctx); ctx.onProgress?.(++done, steps); await breathe(ctx)
    }
  }
  if (Math.min(...filled) === 0) {
    throw new Error('빈 가방 칸이 있다 — 타일이나 팔레트를 잘못 읽었다')
  }

  // ── 주머니 아이콘 열여섯 (주머니마다 안 고른 것·고른 것) ─────────────────
  //
  // ⚠️ 이쪽 NCGR은 `-sopc`라 머리에 크기가 들어 있다. 가방 시트는
  // `-clobbersize`라 그 자리가 0xffff고, 그래서 둘의 폭을 같은 길로 못 구한다
  const iconTiles = member(narc, ICON_TILES)
  const iconView = new DataView(iconTiles.buffer, iconTiles.byteOffset, iconTiles.byteLength)
  const iconAcross = iconView.getUint16(0x1a, true)
  if (iconAcross * TILE !== ICON * POCKETS * 2) {
    throw new Error(`주머니 아이콘 시트가 ${String(iconAcross * TILE)}px다 — 256px이라야 한다`)
  }
  const iconSheet = tiles(iconTiles, iconAcross)
  const iconPal = palette(member(narc, ICON_PALETTE))
  const iconCount = POCKETS * 2
  const iw = ICON * iconCount
  const iconRgba = new Uint8Array(iw * ICON * 4)
  const iconFilled: number[] = []
  for (let i = 0; i < iconCount; i++) {
    iconFilled.push(blit(iconRgba, iw, i * ICON, 0, iconSheet, i * ICON, 0, ICON, ICON, iconPal))
    check(ctx); ctx.onProgress?.(++done, steps); await breathe(ctx)
  }
  if (Math.min(...iconFilled) === 0) throw new Error('빈 주머니 아이콘이 있다')

  return new Map([
    ['data/bagSprite.png', await encodePng(rgba, width, height)],
    ['data/bagPockets.png', await encodePng(iconRgba, iw, ICON)],
    ['data/bagSprite.json', json({
      size: BAG, cols: POCKETS, rows: BODIES, icon: ICON, iconCols: iconCount,
    })],
  ])
}
