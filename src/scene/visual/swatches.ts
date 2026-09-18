// 원본 그림에서 **역할별 색**을 꺼낸다 (FIRST_PERSON §6.1-6 · §5.3)
//
// ⚠️ **평균색이나 알파로 역할을 정하지 않는다.** 화분 칸은 림·용기·흙·잎이 제자리에
// 그려져 있다 — 그 자리(텍셀)를 레시피가 적고, 여기서는 그 자리의 색을 읽기만 한다.
// 자리는 묶음 0의 imped를 텍셀 그대로 읽어 정했다 (`docs/orders/FIRST_PERSON_FP_20260917.md`).
//
// 나오는 색은 **sRGB 정수**(0xRRGGBB)다. 정점색으로 넣을 때 선형으로 한 번 바꾸는 것은
// 부르는 쪽 몫이다 — 여기서 바꾸면 `Color.setHex`가 한 번 더 바꾼다.
import type { SheetPixels } from './sourceParts'

type Item = { x: number, y: number, w: number, h: number }

/** 칸 안 한 텍셀의 색. 투명이면 null */
export function texel(sheet: SheetPixels, item: Item, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= item.w || y >= item.h) return null
  const o = ((item.y + y) * sheet.width + item.x + x) * 4
  if (sheet.pixels[o + 3]! < 128) return null
  return (sheet.pixels[o]! << 16) | (sheet.pixels[o + 1]! << 8) | sheet.pixels[o + 2]!
}

const luma = (c: number): number => ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114

/** 사각형 안의 불투명 색들 — 빈도순 */
export function colorsIn(
  sheet: SheetPixels, item: Item, rect: readonly [number, number, number, number],
): { color: number, count: number }[] {
  const seen = new Map<number, number>()
  for (let y = rect[1]; y < rect[3]; y++) {
    for (let x = rect[0]; x < rect[2]; x++) {
      const c = texel(sheet, item, x, y)
      if (c !== null) seen.set(c, (seen.get(c) ?? 0) + 1)
    }
  }
  return [...seen].map(([color, count]) => ({ color, count })).sort((a, b) => b.count - a.count || a.color - b.color)
}

export interface PlanterSwatch {
  rim: number
  rimEdge: number
  container: number
  containerEdge: number
  /** 흙이 그림에 안 보이는 화분도 있다 (잎이 림을 덮는다) */
  soil: number | null
  /** 잎 — 밝은 것부터 */
  leaves: readonly number[]
}

/** 화분 칸 안의 역할 자리. 칸 왼쪽 위가 (0,0) */
interface PlanterLayout {
  rim: readonly [number, number]
  rimEdge: readonly [number, number]
  container: readonly [number, number]
  containerEdge: readonly [number, number]
  soil: readonly [number, number] | null
  /** 잎을 찾는 사각형 — 림·용기·흙 색은 빼고 센다 */
  leaves: readonly [number, number, number, number]
}

/**
 * 그림마다의 자리 — 칸 지문으로 고른다 (`docs/orders/FIRST_PERSON_FP_20260917.md`).
 *
 * - `e1000013` 묶음 0: 림 안 네 귀에 흙이 보인다
 * - `c92159ee` 축복시티(6)를 비롯한 17묶음: 흙이 안 보이고 잎이 림 위(1행)로 솟는다
 */
export const PLANTER_LAYOUTS: Readonly<Record<string, PlanterLayout>> = {
  e1000013: {
    rim: [2, 1], rimEdge: [1, 1], container: [7, 12], containerEdge: [1, 12],
    soil: [3, 2], leaves: [3, 3, 13, 10],
  },
  c92159ee: {
    rim: [2, 2], rimEdge: [1, 2], container: [7, 12], containerEdge: [1, 12],
    soil: null, leaves: [2, 1, 14, 11],
  },
}

/**
 * imped 화분 칸(32,32,48,48)의 역할별 색. 자리 하나라도 투명이면 null —
 * 그 그림은 이 배치가 아니다
 */
export function planterSwatch(sheet: SheetPixels, item: Item, layout: PlanterLayout): PlanterSwatch | null {
  const X = 32, Y = 32
  const at = (p: readonly [number, number]) => texel(sheet, item, X + p[0], Y + p[1])
  const rim = at(layout.rim)
  const rimEdge = at(layout.rimEdge)
  const container = at(layout.container)
  const containerEdge = at(layout.containerEdge)
  const soil = layout.soil === null ? null : at(layout.soil)
  if (rim === null || rimEdge === null || container === null || containerEdge === null) return null
  if (layout.soil !== null && soil === null) return null
  const skip = new Set([rim, rimEdge, container, containerEdge, soil])
  const r = layout.leaves
  const leaves = colorsIn(sheet, item, [X + r[0], Y + r[1], X + r[2], Y + r[3]])
    .map((c) => c.color)
    .filter((c) => !skip.has(c))
    .sort((a, b) => luma(b) - luma(a))
  if (leaves.length === 0) return null
  return { rim, rimEdge, container, containerEdge, soil, leaves }
}

export interface ShrubSwatch {
  leaves: readonly number[]
  shade: number
}

/**
 * imped 둥근 식생 칸(48,32,64,48)의 색. 잎은 가운데 몸통, 그늘은 밑줄 (5,14).
 * 잎은 밝은 것부터
 */
export function shrubSwatch(
  sheet: SheetPixels, item: Item,
  /**
   * 덤불 칸의 왼쪽 위. `imped`는 64×64 한 장에 여럿이 들어 있어 (48,32)지만,
   * `bf_ueki01`은 16×16 한 장이 통째로 덤불이라 (0,0)이다 — 두 그림의 칸 안
   * 자리(잎 다섯 단계 · 밑줄 그늘 `#6b6b7b`)는 텍셀까지 같은 꼴이다 (실측 2026-09-17)
   */
  cell: readonly [number, number] = [48, 32],
): ShrubSwatch | null {
  const [X, Y] = cell
  const shade = texel(sheet, item, X + 5, Y + 14) ?? texel(sheet, item, X + 1, Y + 11)
  const leaves = colorsIn(sheet, item, [X + 2, Y + 2, X + 14, Y + 11])
    .map((c) => c.color)
    .filter((c) => c !== shade)
    .sort((a, b) => luma(b) - luma(a))
  if (shade === null || leaves.length === 0) return null
  return { leaves, shade }
}

export interface FenceSwatch {
  postFront: number
  postTop: number
  postEdge: number
  railTop: number
  railFront: number
}

/**
 * imped 말뚝 울타리 칸(0,0,64,16)의 역할별 색 (§6.2).
 *
 * 자리는 묶음 6(`ad611b1d`)과 14(`270d4b6d`)를 텍셀로 읽어 정했다 — 둘은 짜임이 같고
 * 색만 다르다. 8텍셀마다 기둥(열 2–5), 행 2–3이 기둥 윗면, 열 2가 모서리, 사이 열의
 * 행 6이 가로대 윗면 · 행 8이 가로대 앞면이다 (`docs/orders/FIRST_PERSON_FP_20260917.md` FP-03).
 * 자리 하나라도 투명이면 null — 그 그림은 이 짜임이 아니다
 */
export function fenceSwatch(sheet: SheetPixels, item: Item): FenceSwatch | null {
  const postFront = texel(sheet, item, 3, 8)
  const postTop = texel(sheet, item, 3, 2)
  const postEdge = texel(sheet, item, 2, 3)
  const railTop = texel(sheet, item, 0, 6)
  const railFront = texel(sheet, item, 0, 8)
  if (postFront === null || postTop === null || postEdge === null || railTop === null || railFront === null) {
    return null
  }
  return { postFront, postTop, postEdge, railTop, railFront }
}
