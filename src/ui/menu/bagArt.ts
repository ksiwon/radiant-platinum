// 가방 그림과 주머니 아이콘을 아틀라스에서 잘라 온다 (DESIGN.md §5).
//
// `itemIcon()`과 같은 길이다 — 자르는 계산은 `common/pixelSprite` 한 곳이고, 칸 상자 · 시트 · 위치가
// 같은 정수 배율로 정해진다. 크기를 화면이 정하므로 왼쪽 칸에서는 크게, 주머니 줄에서는 작게
// 같은 그림을 쓴다.
import type { CSSProperties } from 'react'
import type { BagSprite } from '../../data/schema'
import { BAG_POCKET_ATLAS, BAG_SPRITE_ATLAS } from '../../data/gameData'
import type { SpriteSheet } from '../../data/spriteSheet'
import { pixelSpriteAt, pixelSprite, scaleFor } from '../common/pixelSprite'
import type { PixelScale } from '../theme/scale'

/** 남·여 두 줄 중 어느 줄인가. `trainer.gender`가 `boy`/`girl`이다 */
type BagBody = 'boy' | 'girl'

/** 가방 그림 시트 — 가로가 주머니 여덟, 세로가 남·여 */
export function bagSheet(meta: BagSprite): SpriteSheet {
  return { path: BAG_SPRITE_ATLAS, cellW: meta.size, cellH: meta.size, cols: meta.cols, rows: meta.rows }
}

/** 주머니 아이콘 시트 — 한 줄이고 주머니마다 안 고른 것·고른 것 둘씩이다 */
export function pocketSheet(meta: BagSprite): SpriteSheet {
  return { path: BAG_POCKET_ATLAS, cellW: meta.icon, cellH: meta.icon, cols: meta.iconCols, rows: 1 }
}

/** 가방 한 장을 정수 배율로 (64 → 1배, 128 → 2배) */
export function bagArtAt(
  meta: BagSprite | undefined, pocket: number, body: BagBody, scale: PixelScale,
): CSSProperties {
  if (!meta) return { width: 64 * scale, height: 64 * scale }
  return pixelSpriteAt(bagSheet(meta), pocket, body === 'girl' ? 1 : 0, scale)
}

/**
 * 그 주머니가 열린 가방 한 장 (`px`는 64의 정수배).
 *
 * ⚠️ 칸을 고르는 것은 **주머니 번호 그대로**다. 그림 차례와 주머니 차례가
 * 다른 것은 굽는 쪽이 이미 풀어 놨다 (`tools/extract/bagSprite.js`의
 * `FRAME_OF_POCKET`) — 읽는 쪽이 또 뒤집으면 두 번 뒤집힌다
 */
export function bagArt(
  meta: BagSprite | undefined, pocket: number, body: BagBody, px: number,
): CSSProperties {
  return bagArtAt(meta, pocket, body, scaleFor(px, 64, 'bagArt'))
}

/** 주머니 아이콘 한 칸을 정수 배율로 (16 → 1배, 32 → 2배) */
export function pocketIconAt(
  meta: BagSprite | undefined, pocket: number, on: boolean, scale: PixelScale,
): CSSProperties {
  if (!meta) return { width: 16 * scale, height: 16 * scale }
  // 주머니마다 두 칸이다 — 안 고른 것이 `2p`, 고른 것이 `2p+1`
  // (`BagUI_DrawPocketSelectorIcon`의 `pocketType * 32 (+16)`)
  return pixelSprite(pocketSheet(meta), pocket * 2 + (on ? 1 : 0), scale)
}

/** 주머니 아이콘 한 칸 (`px`는 16의 정수배) */
export function pocketIcon(
  meta: BagSprite | undefined, pocket: number, on: boolean, px: number,
): CSSProperties {
  return pocketIconAt(meta, pocket, on, scaleFor(px, 16, 'pocketIcon'))
}
