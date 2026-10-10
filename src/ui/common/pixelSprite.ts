// 도트 시트에서 칸 하나를 **정수배로** 자른다 (SYSTEM §0 도트 배율 · §2.2 `pixelSprite`).
//
// 도구 · 포켓몬 · 가방 · 시작 메뉴 아이콘이 전부 이 계산 하나를 거친다. 한때 아이콘마다 칸 계산을 따로
// 했고, 파티 아이콘은 **배율과 칸 번호가 따로 놀아서** 박스 파티의 아이콘이 잘리고 옆 칸의 종이
// 나왔다 (DECISIONS 사용자 지적 ③). 여기서는 한 값으로 세 가지가 같이 정해진다.
//
//   ① 칸 상자의 크기 = 원본 칸 × 배율
//   ② 시트 전체의 크기 = 원본 시트 × 같은 배율
//   ③ 칸의 위치 = 칸의 원본 위치 × 같은 배율
//
// 배율은 `PixelScale`(1~4 정수)뿐이다. 소수 배율은 형이 막고, JS에서 넘어와도 던진다 — 도트를 1.5배로
// 늘리면 어떤 칸은 1픽셀, 어떤 칸은 2픽셀이 되어 그림이 일그러진다.
// 줄이는 것은 박스 필름 썸네일 한 곳뿐이고 그것은 따로다 (`pokeIcon`의 `wallThumb`).
import type { CSSProperties } from 'react'
import { atlasUrl } from '../../data/providers/atlas'
import { sheetSize, type SpriteSheet } from '../../data/spriteSheet'
import { PIXEL, type PixelScale } from '../theme/scale'

/** 배율을 적용한 칸의 자리 (px). 시험이 이 값을 본다 */
export interface PixelCell {
  /** 칸 상자 크기 */
  w: number
  h: number
  /** 시트 안 칸의 왼쪽 위 (배율 적용) */
  x: number
  y: number
  /** 시트 전체 크기 (배율 적용) */
  sheetW: number
  sheetH: number
}

const SCALES: readonly number[] = Object.values(PIXEL)

/** 배율이 1~4의 정수인가 */
export function isPixelScale(n: number): n is PixelScale {
  return SCALES.includes(n)
}

/**
 * 칸 번호(왼쪽 위부터 가로로 센다) → 배율 적용한 자리. 시트 밖이면 null.
 *
 * ⚠️ **시트 밖을 빈 칸으로 돌린다.** 범위를 넘는 번호를 그대로 밀면 **다른 포켓몬이 뜬다.**
 */
export function pixelCell(sheet: SpriteSheet, cell: number, scale: PixelScale): PixelCell | null {
  if (!isPixelScale(scale)) throw new RangeError(`도트 배율은 1~4의 정수다: ${String(scale)}`)
  if (!Number.isInteger(cell) || cell < 0 || cell >= sheet.cols * sheet.rows) return null
  return pixelCellAt(sheet, cell % sheet.cols, Math.floor(cell / sheet.cols), scale)
}

/** 열과 줄로 부르는 짝. 한 줄이 상태인 시트(시작 메뉴 아이콘의 컬러 · 회색)가 쓴다 */
export function pixelCellAt(
  sheet: SpriteSheet, col: number, row: number, scale: PixelScale,
): PixelCell | null {
  if (!isPixelScale(scale)) throw new RangeError(`도트 배율은 1~4의 정수다: ${String(scale)}`)
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null
  if (col < 0 || row < 0 || col >= sheet.cols || row >= sheet.rows) return null
  const { w: sheetW, h: sheetH } = sheetSize(sheet)
  return {
    w: sheet.cellW * scale,
    h: sheet.cellH * scale,
    x: col * (sheet.cellW + (sheet.gapX ?? 0)) * scale,
    y: row * (sheet.cellH + (sheet.gapY ?? 0)) * scale,
    sheetW: sheetW * scale,
    sheetH: sheetH * scale,
  }
}

/** 칸 상자만 (그림 없이). 자료를 아직 못 받았거나 없는 칸일 때 자리를 잡는다 */
function blank(sheet: SpriteSheet, scale: PixelScale): CSSProperties {
  return { width: sheet.cellW * scale, height: sheet.cellH * scale }
}

function paint(sheet: SpriteSheet, at: PixelCell): CSSProperties {
  const url = atlasUrl(sheet.path)
  return {
    width: at.w,
    height: at.h,
    // 그림이 아직 안 왔으면 상자만 선다 — 빈 `url()`을 걸지 않는다
    ...(url === '' ? {} : { backgroundImage: `url(${url})` }),
    backgroundSize: `${String(at.sheetW)}px ${String(at.sheetH)}px`,
    backgroundPosition: `-${String(at.x)}px -${String(at.y)}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  }
}

/** 시트의 `cell`번 칸을 `scale`배로. 없는 칸이면 빈 상자다 */
export function pixelSprite(sheet: SpriteSheet, cell: number, scale: PixelScale): CSSProperties {
  const at = pixelCell(sheet, cell, scale)
  return at === null ? blank(sheet, scale) : paint(sheet, at)
}

/** 열 · 줄로 고른다 */
export function pixelSpriteAt(
  sheet: SpriteSheet, col: number, row: number, scale: PixelScale,
): CSSProperties {
  const at = pixelCellAt(sheet, col, row, scale)
  return at === null ? blank(sheet, scale) : paint(sheet, at)
}

/**
 * 옛 호출(`itemIcon(icons, id, 28)`처럼 **픽셀 크기**를 받는 자리)을 정수 배율로 옮긴다.
 *
 * `px`가 칸의 정수배면 그대로이고, 아니면 가장 가까운 정수배로 **맞춘다**(1~4로 가둔다). 개발 서버에서는
 * 한 번 경고를 남긴다 — 그 화면이 정수배로 옮겨야 한다는 알림이다.
 */
const warned = new Set<string>()
export function scaleFor(px: number, native: number, who: string): PixelScale {
  const k = px / native
  const snapped = Math.min(4, Math.max(1, Math.round(k)))
  if (k !== snapped && import.meta.env?.DEV && !warned.has(who + String(px))) {
    warned.add(who + String(px))
    console.warn(`${who}: ${String(px)}px는 칸(${String(native)})의 정수배가 아니다 — ${String(snapped)}배로 맞춘다`)
  }
  return snapped as PixelScale
}
