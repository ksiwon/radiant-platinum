// 아이템·포켓몬 아이콘 아틀라스 — 브라우저에서 (DATA.md §2.12 · §2.20)
//
// 둘 다 4bpp 8×8 타일을 격자로 이어 붙인 한 장이다. 파일이 수백 개인데 하나하나
// 요청하면 첫 화면이 그만큼 늦어지므로 **한 장으로 굽는다** — 가로 24칸 고정이라
// 읽는 쪽은 번호에서 자리를 산술로 낸다.
//
// ⚠️ **노드 쪽(`tools/extract/itemIcons.js`·`pokeIcons.js`)과 한 줄씩 같아야 한다.**
import { narcCount, narcEntry } from './nds'
import { color, type Rgb } from './nitrotex'
import { encodePng } from './png'
import { ITEM_TABLE, ITEM_ICON_COUNT } from './itemTable'
import { EXTRA_ITEMS } from '../../engine/bag/extraItems'
import { ICON_PALETTE } from './pokeIconTable'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const ICON = 32
const TILE = 8
const COLS = 24
/** 팔레트는 색 열여섯이면 넉넉하다 — 타일에 15보다 큰 번호가 안 나온다 */
const COLORS = 16
/** NCLR 헤더 뒤 색 자료가 시작하는 자리 */
const PAL_DATA = 0x28
/** NCGR 헤더 뒤 타일 자료가 시작하는 자리 */
const TILE_DATA = 0x30

/** 공용 파일 7개 뒤부터 아이콘이다 (`res/pokemon/species_icons.order`) */
const FIRST_ICON = 7
/** 포켓몬 아이콘이 돌려쓰는 팔레트 벌 수 */
const ICON_PALETTES = 3

const magic = (b: Uint8Array): string => String.fromCharCode(...b.subarray(0, 4))

/** NCLR에서 팔레트 한 벌(16색)을 꺼낸다. `set`은 몇 번째 벌인가 */
function palette(buf: Uint8Array, set = 0): Rgb[] {
  if (magic(buf) !== 'RLCN') throw new Error('NCLR이 아니다')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out: Rgb[] = []
  for (let i = 0; i < COLORS; i++) {
    out.push(color(view.getUint16(PAL_DATA + (set * COLORS + i) * 2, true)))
  }
  return out
}

/**
 * NCGR에서 32×32 한 장을 꺼낸다.
 *
 * 타일은 8×8 단위로 순서대로 놓인다. 32px이니 가로 4장씩이고 위 32×32는 타일
 * 열여섯 장, 곧 앞 512바이트다 — 포켓몬 아이콘은 32×64(프레임 둘)인데 원작이
 * 둘을 번갈아 그려 까딱거리게 한다. 우리는 위 한 장만 쓴다
 */
function tiles(buf: Uint8Array): Uint8Array {
  if (magic(buf) !== 'RGCN') throw new Error('NCGR이 아니다')
  const data = buf.subarray(TILE_DATA)
  const px = new Uint8Array(ICON * ICON)
  const across = ICON / TILE
  for (let t = 0; t < across * across; t++) {
    const ox = (t % across) * TILE, oy = Math.floor(t / across) * TILE
    for (let i = 0; i < TILE * TILE; i++) {
      const byte = data[t * ((TILE * TILE) / 2) + (i >> 1)]!
      px[(oy + (i >> 3)) * ICON + ox + (i & 7)] = i & 1 ? byte >> 4 : byte & 0xf
    }
  }
  return px
}

/** 한 칸을 아틀라스에 찍는다. 칠한 픽셀 수를 돌려준다 */
function blit(
  rgba: Uint8Array, width: number, slot: number, px: Uint8Array, pal: readonly Rgb[],
): number {
  const ox = (slot % COLS) * ICON, oy = Math.floor(slot / COLS) * ICON
  let solid = 0
  for (let y = 0; y < ICON; y++) {
    for (let x = 0; x < ICON; x++) {
      const idx = px[y * ICON + x]!
      if (idx === 0) continue // 0번은 투명하다 — 스프라이트의 규칙이다
      const c = pal[idx]
      if (!c) throw new Error(`색 ${String(idx)}번이 팔레트에 없다`)
      const at = ((oy + y) * width + ox + x) * 4
      rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
      solid++
    }
  }
  return solid
}

// ── 아이템 ───────────────────────────────────────────────────────────────────

export async function convertItemIcons(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/itemtool/itemdata/item_icon.narc')
  if (!narc) throw new Error('item_icon.narc을 못 읽었다')
  if (narcCount(narc) !== ITEM_ICON_COUNT) {
    throw new Error(`아이콘 아카이브 ${String(narcCount(narc))}칸 ≠ 표 ${String(ITEM_ICON_COUNT)}칸`)
  }

  // ⚠️ **롬 밖의 둘도 제 칸을 받는다** (PARITY §12). 표 뒤에 이어 그리므로
  // 앞의 468칸은 자리가 그대로다 — 남의 칸을 빌리면 가방에 같은 그림이 둘 뜬다
  const extras = EXTRA_ITEMS.map((it) => ({
    name: it.name, icon: it.icon ?? 0, palette: it.palette ?? 0,
  }))
  const count = ITEM_TABLE.length + extras.length
  const rows = Math.ceil(count / COLS)
  const width = COLS * ICON, height = rows * ICON
  const rgba = new Uint8Array(width * height * 4)

  // 자료 없는 아이템(`ITEM_UNUSED_*`)은 none 아이콘으로 채운다. 빈칸을 남기면
  // 잘못된 번호로 그렸을 때 "원래 빈 칸"과 구분이 안 된다
  const none = ITEM_TABLE[0]!
  if (none[1] === null || none[2] === null) throw new Error('none 아이콘이 표에 없다')

  const cells = [
    ...ITEM_TABLE.map((row) => {
      const [, icon, pal] = row[1] === null ? none : row
      return { name: row[0], icon: icon!, palette: pal! }
    }),
    ...extras,
  ]

  const blank: string[] = []
  for (let id = 0; id < count; id++) {
    const cell = cells[id]!
    const sprite = narcEntry(narc, cell.icon)
    const colors = narcEntry(narc, cell.palette)
    if (!sprite || !colors) {
      throw new Error(`${cell.name}: 아이콘 멤버 ${String(cell.icon)}/${String(cell.palette)}이 없다`)
    }
    if (blit(rgba, width, id, tiles(sprite), palette(colors)) === 0) blank.push(cell.name)
    if (id % 32 === 0) { check(ctx); ctx.onProgress?.(id, count); await breathe(ctx) }
  }
  // 전부 투명한 칸이 있으면 팔레트나 타일을 잘못 읽은 것이다
  if (blank.length > 0) {
    throw new Error(`빈 아이콘 ${String(blank.length)}개: ${blank.slice(0, 5).join(', ')}`)
  }
  ctx.onProgress?.(count, count)

  return new Map([
    ['data/itemIcons.png', await encodePng(rgba, width, height)],
    ['data/itemIcons.json', json({ size: ICON, cols: COLS, rows, count })],
  ])
}

// ── 포켓몬 ───────────────────────────────────────────────────────────────────

export async function convertPokeIcons(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/poketool/icongra/pl_poke_icon.narc')
  if (!narc) throw new Error('pl_poke_icon.narc을 못 읽었다')

  const shared = narcEntry(narc, 0)
  if (!shared) throw new Error('공용 팔레트 파일이 없다')
  const pals = Array.from({ length: ICON_PALETTES }, (_, p) => palette(shared, p))

  const count = ICON_PALETTE.length
  const have = narcCount(narc) ?? 0
  if (have < FIRST_ICON + count) {
    throw new Error(`아이콘 ${String(have - FIRST_ICON)}장인데 종은 ${String(count)}개다`)
  }

  const rows = Math.ceil(count / COLS)
  const width = COLS * ICON, height = rows * ICON
  const rgba = new Uint8Array(width * height * 4)

  const blank: number[] = []
  for (let species = 0; species < count; species++) {
    const buf = narcEntry(narc, FIRST_ICON + species)
    if (!buf) throw new Error(`종 ${String(species)}의 아이콘이 없다`)
    const pal = pals[ICON_PALETTE[species]!]
    if (!pal) throw new Error(`종 ${String(species)}: 팔레트 ${String(ICON_PALETTE[species])}번은 없다`)
    if (blit(rgba, width, species, tiles(buf), pal) === 0) blank.push(species)
    if (species % 32 === 0) { check(ctx); ctx.onProgress?.(species, count); await breathe(ctx) }
  }
  // 0번(`SPECIES_NONE`)은 원작도 빈 칸이다. 그 뒤가 비면 잘못 읽은 것이다
  const real = blank.filter((i) => i > 0)
  if (real.length > 0) {
    throw new Error(`빈 아이콘 ${String(real.length)}개: ${real.slice(0, 5).join(', ')}`)
  }
  ctx.onProgress?.(count, count)

  return new Map([
    ['data/pokeIcons.png', await encodePng(rgba, width, height)],
    ['data/pokeIcons.json', json({ size: ICON, cols: COLS, rows, count })],
  ])
}
