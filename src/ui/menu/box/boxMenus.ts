// 박스 화면의 순수 셈 — 자리 · 크기 · 현황 · 글 (시험이 브라우저 없이 돈다).
//
// ⚠️ **격자는 벽지 안에 다 든다.** 한때 아이콘을 원작 값(원본 32px을 3배 = 96px, 칸 간격 72px) 그대로 깔았고, 맨 아랫줄이
// 벽지 아래로 12px 삐져나왔다 (DECISIONS 사용자 지적 ②). 아이콘 배율은 **벽지 안쪽 크기에서 거꾸로 정한다** —
// 안쪽에 정수배가 안 들어가면 한 단 낮춘다 (`fitGrid`). 벽지 밖으로 나가는 픽셀은 0이다.
import type { PokeIcons } from '../../../data/schema'
import { BOX_COLS, BOX_ROWS, BOX_SIZE, countInBox } from '../../../engine/pokemon/boxes'
import type { Boxes } from '../../../engine/pokemon/boxes'
import { iconSlot, SPECIES_EGG } from '../../../engine/pokemon/form'
import type { PokemonInstance } from '../../../engine/pokemon/instance'
import { pixelCell } from '../../common/pixelSprite'
import { HOP } from '../../common/iconHop'
import { ICON, PIXEL, type PixelScale } from '../../theme/scale'
import { pokeSheet } from '../pokeIcon'
import { WALL, WALL_PX } from './wallGeometry'

// ── 벽지 ────────────────────────────────────────────────────────────────────

/** 원작의 칸 간격(원본 24px)을 벽지 배율로 옮긴 값 — 이보다 넓게는 안 벌린다 */
const WANT_PITCH = 24 * WALL.k
/** 커서 원이 아이콘 둘레로 나오는 폭(px)과 그 금 고리 굵기 */
const RING_PAD = 4
const RING_EDGE = 2
/** 아이콘이 이만큼(상자 한 변의 몇 분의 몇) 넘게 겹치면 한 단 낮춘다 — 원작은 4분의 1(8 / 32)이다 */
const MAX_OVERLAP = 0.25

interface GridFit {
  /** 아이콘 배율 (정수) */
  scale: PixelScale
  /** 아이콘 상자 한 변 */
  icon: number
  /** 칸 간격 */
  pitch: number
  /** 첫 칸 아이콘 상자의 왼쪽 위 (벽지 좌표) */
  left: number
  top: number
  /** 쉬고 있을 때의 격자 전체 (아이콘 상자 기준) */
  width: number
  height: number
  /** 뛰거나 커서 원이 나올 때 위 · 아래로 더 쓰는 폭 */
  edge: number
}

/**
 * 안쪽 크기 `inner`(px)에 `cols × rows` 아이콘이 다 드는 가장 큰 정수 배율을 고른다.
 *
 * 위 · 아래로는 **뛰는 폭**(`HOP.up`)과 **커서 원**이 더 쓰므로 그만큼 남긴다 — 맨 윗줄이 뛰거나 맨 아랫줄에 커서가 서도
 * 안쪽 밖으로 안 나간다. 칸 간격은 원작 값(`WANT_PITCH`)이 못 들어가면 줄이되, 아이콘이 `MAX_OVERLAP`보다 더 겹치면 그 배율은
 * 버린다. 어느 배율도 안 되면 1배다
 */
export function fitGrid(
  inner: { x: number, y: number, w: number, h: number },
  cols: number = BOX_COLS,
  rows: number = BOX_ROWS,
  want: number = WANT_PITCH,
): GridFit {
  const scales = Object.values(PIXEL).sort((a, b) => b - a) as PixelScale[]
  let fit: GridFit | null = null
  for (const scale of scales) {
    const icon = ICON.cell * scale
    const edge = Math.max(HOP.up * scale, RING_PAD + RING_EDGE)
    const pitchH = Math.floor((inner.h - icon - edge * 2) / (rows - 1))
    const pitchW = Math.floor((inner.w - icon) / (cols - 1))
    const pitch = Math.min(want, pitchH, pitchW)
    if (pitch < 1) continue
    const found = place(inner, cols, rows, scale, icon, pitch, edge)
    fit = found
    if (pitch >= icon * (1 - MAX_OVERLAP)) return found
  }
  // 어느 배율도 안 맞았다 — 1배로 간다 (가장 작은 배율의 결과)
  return fit ?? place(inner, cols, rows, 1, ICON.cell, 1, RING_PAD + RING_EDGE)
}

function place(
  inner: { x: number, y: number, w: number, h: number },
  cols: number, rows: number, scale: PixelScale, icon: number, pitch: number, edge: number,
): GridFit {
  const width = (cols - 1) * pitch + icon
  const height = (rows - 1) * pitch + icon
  return {
    scale,
    icon,
    pitch,
    left: inner.x + Math.floor((inner.w - width) / 2),
    top: inner.y + Math.floor((inner.h - height - edge * 2) / 2) + edge,
    width,
    height,
    edge,
  }
}

/** 벽지 안쪽에 앉는 격자. 한 곳에서만 정한다 */
export const GRID: GridFit = fitGrid(WALL_PX.inner)

/** 칸 번호 → 아이콘 상자의 왼쪽 위 (벽지 좌표) */
export function slotAt(fit: GridFit, slot: number): { left: number, top: number } {
  return {
    left: fit.left + (slot % BOX_COLS) * fit.pitch,
    top: fit.top + Math.floor(slot / BOX_COLS) * fit.pitch,
  }
}

/** 커서 원 한 변 (금 고리 안쪽) — 아이콘보다 `RING_PAD`씩 크다 */
export function ringSize(fit: GridFit): number {
  return fit.icon + RING_PAD * 2
}

/** 커서 원의 왼쪽 위 (벽지 좌표) */
export function ringAt(fit: GridFit, slot: number): { left: number, top: number } {
  const at = slotAt(fit, slot)
  return { left: at.left - RING_PAD, top: at.top - RING_PAD }
}

/** 들어 올린 아이콘이 커서 위로 뜨는 높이 (px) */
export const LIFT = 14

/**
 * 그 칸에서 들어 올릴 높이 — 맨 윗줄은 벽지 틀(안쪽 위 끝)을 넘지 않게 덜 든다 (그림은 제 틀을 넘지 않는다).
 * 윗줄은 칸 위 여백이 `LIFT`보다 좁아서 14를 다 들면 틀에 걸친다
 */
export function liftOf(fit: GridFit, slot: number, innerTop: number = WALL_PX.inner.y): number {
  return Math.max(0, Math.min(LIFT, slotAt(fit, slot).top - innerTop))
}

/**
 * 격자가 **벽지 안쪽 밖으로** 나가는 가장자리의 최악 값 — 시험이 본다. 음수나 0이면 다 안에 든다.
 * 쉬고 있는 아이콘 · 위로 뛴 아이콘 · 아래로 뛴 아이콘 · 맨 가장자리 칸의 커서 원(금 고리 포함)을 모두 센다
 */
export function gridOverflow(fit: GridFit, inner: { x: number, y: number, w: number, h: number }): number {
  const hopUp = HOP.up * fit.scale
  const hopDown = HOP.down * fit.scale
  const ring = RING_PAD + RING_EDGE
  const first = slotAt(fit, 0)
  const last = slotAt(fit, BOX_SIZE - 1)
  const reach = Math.max(hopUp, ring)
  const reachDown = Math.max(hopDown, ring)
  const left = inner.x - (first.left - ring)
  const top = inner.y - (first.top - reach)
  const right = last.left + fit.icon + ring - (inner.x + inner.w)
  const bottom = last.top + fit.icon + reachDown - (inner.y + inner.h)
  return Math.max(left, top, right, bottom)
}

// ── 아이콘과 이름 ───────────────────────────────────────────────────────────

/**
 * 한 마리의 아이콘 칸 번호. 이름과 **같은 개체**에서 같이 나온다 — 따로 셈하지 않는다.
 *
 * ⚠️ 한때 박스 파티가 이름과 아이콘을 다른 길로 구해서 아이콘이 잘리고 옆 칸의 종이 나왔다 (DECISIONS 사용자 지적 ③).
 * 알은 속의 종이 새지 않게 알 칸이다 (`iconSlot`)
 */
export function iconOf(mon: Pick<PokemonInstance, 'species' | 'form' | 'isEgg'>): number {
  return iconSlot(mon.species, mon.form, mon.isEgg)
}

/** 마리의 이름 — 알은 「알」이다 (`BoxApp_LoadBoxMonIntoPreview`). 속에 든 것이 새면 안 된다 */
export function nameOfMon(
  mon: Pick<PokemonInstance, 'species' | 'nickname' | 'isEgg'>, names: readonly string[],
): string {
  return (mon.isEgg ? names[SPECIES_EGG] : mon.nickname ?? names[mon.species]) ?? ''
}

/** 파티 칸 하나가 그릴 것 — 이름과 아이콘 칸이 한 개체에서 같이 나온다 */
interface PartyEntry {
  name: string
  level: number
  /** 시트의 칸 번호 */
  slot: number
}

export function partyEntry(mon: PokemonInstance, names: readonly string[]): PartyEntry {
  return { name: nameOfMon(mon, names), level: mon.level, slot: iconOf(mon) }
}

/** 파티 아이콘 배율 — 칸 안에 상자째 든다 (`partyCellFits`) */
export const PARTY_SCALE: PixelScale = PIXEL.x2

/**
 * 시트의 한 칸이 **칸 상자 하나 안에 온전히** 들어가고 이웃 칸을 안 건드리는가 — 칸 번호와 배율이 한 곳(`pixelCell`)에서
 * 정해지므로, 상자 크기가 원본 칸 × 배율이고 시트 안에서 이웃과 겹치지 않으면 참이다
 */
export function iconCellIsolated(icons: PokeIcons, slot: number, scale: PixelScale): boolean {
  // 그림이 있는 칸 수(`count`)를 넘으면 칸이 아니다 — `pokeIconAt`도 그 칸을 빈 상자로 돌린다
  if (slot < 0 || slot >= icons.count) return false
  const at = pixelCell(pokeSheet(icons), slot, scale)
  if (at === null) return false
  const size = icons.size * scale
  if (at.w !== size || at.h !== size) return false
  // 시트의 칸 틀 위에 정확히 앉는다 (이웃 칸으로 넘어가지 않는다)
  return at.x % size === 0 && at.y % size === 0 && at.x + size <= at.sheetW && at.y + size <= at.sheetH
}

// ── 현황 ────────────────────────────────────────────────────────────────────

/** 박스 한 장의 채움 수 — **실제 칸을 센다** (`countInBox`). 따로 적은 숫자를 안 쓴다 */
export function filled(boxes: Boxes, box: number): number {
  return countInBox(boxes, box)
}

export interface FilmCell {
  index: number
  /** 채운 칸 수 */
  count: number
  /** 0~1 */
  fill: number
  full: boolean
  empty: boolean
}

/** 필름 띠의 칸 — 박스마다 채움 수와 비율 */
export function filmCells(boxes: Boxes, count: number): FilmCell[] {
  return Array.from({ length: count }, (_, index) => {
    const n = filled(boxes, index)
    return { index, count: n, fill: n / BOX_SIZE, full: n >= BOX_SIZE, empty: n === 0 }
  })
}

export interface Dot {
  filled: boolean
  here: boolean
}

/** 칸 점유 지도 — 서른 점. 커서가 선 칸(`cursor`, 박스 칸 번호)은 `here` */
export function occupancyDots(box: readonly (unknown | null)[], cursor: number | null): Dot[] {
  return Array.from({ length: BOX_SIZE }, (_, i) => ({ filled: box[i] !== null && box[i] !== undefined, here: i === cursor }))
}

// ── 글 ─────────────────────────────────────────────────────────────────────

interface FootState {
  /** 띄운 줄이 있다 */
  say: boolean
  /** 갈래 창이 떠 있다 */
  menu: boolean
  mode: number
  /** 마리를 들고 있다 */
  held: boolean
  /** 도구를 들고 있다 (도구 옮기기) */
  heldItem: boolean
  /** 비교 쪽 이름 */
  comparePage: string
}

/** 바닥 안내. 키 토큰 · 순서는 지금 것 그대로이고(시험이 문자열을 본다), 낱말만 「X 닫기」로 모았다 */
export function boxFoot(state: FootState, modes: { compare: number, items: number }): string {
  if (state.say) return 'Z 다음'
  if (state.menu) return '↑↓ 고르기 · Z 결정 · X 그만둔다'
  if (state.mode === modes.compare) return `↑↓←→ 고르기 · Z 올린다/내린다 · Tab ${state.comparePage} · X 닫기`
  if (state.mode === modes.items) {
    return state.heldItem
      ? '↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 도구 돌려놓기'
      : '↑↓←→ 고르기 · Z 도구 집기 · Tab 파티/박스 · Q/E 박스 · X 닫기'
  }
  return state.held
    ? '↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 되돌리기'
    : '↑↓←→ 고르기 · Z 메뉴 · Tab 파티/박스 · Q/E 박스 · X 닫기'
}

/** 머리 오른쪽 한 줄 — 지금 박스의 채움과 전체 · 파티 (모두 실제 수) */
export function boxNote(here: number, total: number, party: number, partyMax: number, capacity: number): string {
  return `박스 ${String(here)}/${String(BOX_SIZE)} · 전체 ${String(total)}/${String(capacity)} · 파티 ${String(party)}/${String(partyMax)}`
}

// ── 비교 ───────────────────────────────────────────────────────────────────

/**
 * 비교 막대의 길이(0~1). 두 값 중 큰 쪽이 아니라 **같은 기준(`max`)**에 맞춘다 — 둘이 비슷하면 막대도 비슷해야 한다.
 * `max`가 0이면 0이다
 */
export function compareBar(value: number, max: number): number {
  return max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
}
