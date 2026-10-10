// 도구 아이콘 — 468칸짜리 아틀라스 한 장을 잘라 쓴다.
//
// 파일 468개를 받는 것보다 훨씬 싸고, 목록을 굴릴 때 새로 뜨는 칸이 없다.
//
// ⚠️ **칸 크기를 바꾸려면 시트도 같이 늘려야 한다.** 칸은 32픽셀인데 배경 위치만 옮기고 칸을
// 28픽셀로 줄이면 그림의 오른쪽 아래가 잘린다. 그래서 자르는 계산은 `common/pixelSprite` 한 곳에
// 있고, 거기서 칸 상자 · 시트 · 위치가 **같은 정수 배율** 하나로 같이 정해진다 (SYSTEM §0 도트 배율).
// 이 파일은 도구 번호 → 칸 번호와 시트 자료만 안다.
import type { CSSProperties } from 'react'
import type { ItemIcons } from '../../data/schema'
import { ITEM_ICON_ATLAS } from '../../data/gameData'
import type { SpriteSheet } from '../../data/spriteSheet'
import { pixelSprite, scaleFor } from '../common/pixelSprite'
import { ICON, type PixelScale } from '../theme/scale'

/** 도구 아이콘 시트. 자료(`itemIcons.json`)의 칸 수를 그대로 쓴다 */
export function itemSheet(icons: ItemIcons): SpriteSheet {
  return { path: ITEM_ICON_ATLAS, cellW: icons.size, cellH: icons.size, cols: icons.cols, rows: icons.rows }
}

/** 아이콘 한 칸을 정수 배율로. 자료를 아직 못 받았으면 빈 칸이다 */
export function itemIconAt(
  icons: ItemIcons | undefined, id: number, scale: PixelScale,
): CSSProperties {
  if (!icons) return { width: ICON.cell * scale, height: ICON.cell * scale }
  // ⚠️ 칸은 **도구 번호**다. 롬 밖의 둘(468·469)도 아틀라스에 제 칸이 있다 —
  // 굽는 쪽이 표 뒤에 두 칸을 더 그린다 (`tools/extract/itemIcons.js`)
  return pixelSprite(itemSheet(icons), id, scale)
}

/**
 * 아이콘 한 칸을 `px` 크기로. `px`는 칸(32)의 정수배여야 한다 — 아니면 가장 가까운 정수배로 맞추고
 * 개발 서버에서 경고한다. 새 코드는 `itemIconAt(icons, id, scale)`을 쓴다
 */
export function itemIcon(
  icons: ItemIcons | undefined, id: number, px: number,
): CSSProperties {
  return itemIconAt(icons, id, scaleFor(px, ICON.cell, 'itemIcon'))
}
