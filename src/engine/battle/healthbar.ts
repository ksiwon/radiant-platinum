// HP 게이지 (PLAN §7)
//
// **색이 언제 바뀌는지는 비율이 아니라 픽셀이 정한다.** 원작은 게이지를 먼저
// 픽셀 수로 줄이고 그 픽셀 수로 색을 고른다 — `healthbox.c`가
// `App_BarColor(pixels, 8 * HEALTHBOX_HP_CELL_COUNT)`을 부른다.
//
// 그래서 비율로 `0.5 · 0.2`를 견주면 가장자리에서 어긋난다. 예를 들어 79 중 16은
// 비율이 0.2025라 비율 규칙으로는 노랑인데, 픽셀로는 `floor(16×48/79) = 9`라
// **빨강**이다.
//
// 배틀 게이지는 `HealthBar_Color`가 아니라 `App_BarColor`를 직접 쓴다 — 그래서
// "체력이 꽉 찼을 때"를 따로 가르는 `BARCOLOR_MAX`가 여기엔 없다. 그쪽은
// 파티 화면 아이콘용이다.

/** `HEALTHBOX_HP_CELL_COUNT`. 칸 하나가 8픽셀이다 */
const HP_CELLS = 6
/** 게이지 전체 픽셀 수 */
export const HP_PIXELS = 8 * HP_CELLS

type BarColor = 'empty' | 'red' | 'yellow' | 'green'

/**
 * `App_PixelCount` 그대로.
 *
 * 정수 나눗셈이라 내림이고, **0이 아닌 체력은 최소 1픽셀**을 받는다 — 1/100이
 * 남았을 때 게이지가 텅 비어 보이면 안 되기 때문이다
 */
export function barPixels(hp: number, maxHp: number, maxPixels = HP_PIXELS): number {
  if (maxHp <= 0) return 0
  const cur = Math.max(0, Math.min(hp, maxHp))
  const pixels = Math.floor((cur * maxPixels) / maxHp)
  if (pixels === 0 && cur > 0) return 1
  return pixels
}

/** `App_BarColor` 그대로. 견주는 것은 픽셀 수다 */
export function barColorAt(pixels: number, maxPixels = HP_PIXELS): BarColor {
  if (pixels > maxPixels / 2) return 'green'
  // 원작은 정수 나눗셈이다. 48/5 = 9이므로 10픽셀부터 노랑이다
  if (pixels > Math.floor(maxPixels / 5)) return 'yellow'
  if (pixels > 0) return 'red'
  return 'empty'
}

export function hpColor(hp: number, maxHp: number): BarColor {
  return barColorAt(barPixels(hp, maxHp))
}
