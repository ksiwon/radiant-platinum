// 가방 그림과 주머니 아이콘을 아틀라스에서 잘라 온다 (DESIGN.md §5).
//
// `itemIcon()`과 같은 길이다 — 그림 한 장을 배경으로 깔고 `background-size`와
// 위치를 배율 하나로 같이 민다. 크기를 화면이 정하므로 왼쪽 칸에서는 크게,
// 주머니 줄에서는 작게 같은 그림을 쓴다.
import type { CSSProperties } from 'react'
import type { BagSprite } from '../../data/schema'
import { BAG_POCKET_ATLAS, BAG_SPRITE_ATLAS } from '../../data/gameData'
import { atlasUrl } from '../../data/providers/atlas'

/** 남·여 두 줄 중 어느 줄인가. `trainer.gender`가 `boy`/`girl`이다 */
type BagBody = 'boy' | 'girl'

/**
 * 그 주머니가 열린 가방 한 장.
 *
 * ⚠️ 칸을 고르는 것은 **주머니 번호 그대로**다. 그림 차례와 주머니 차례가
 * 다른 것은 굽는 쪽이 이미 풀어 놨다 (`tools/extract/bagSprite.js`의
 * `FRAME_OF_POCKET`) — 읽는 쪽이 또 뒤집으면 두 번 뒤집힌다
 */
export function bagArt(
  meta: BagSprite | undefined, pocket: number, body: BagBody, px: number,
): CSSProperties {
  if (!meta) return { width: px, height: px }
  const row = body === 'girl' ? 1 : 0
  return {
    width: px,
    height: px,
    backgroundImage: `url(${atlasUrl(BAG_SPRITE_ATLAS)})`,
    backgroundSize: `${String(meta.cols * px)}px ${String(meta.rows * px)}px`,
    backgroundPosition: `-${String(pocket * px)}px -${String(row * px)}px`,
  }
}

/**
 * 주머니 아이콘 한 칸.
 *
 * 주머니마다 두 칸이다 — 안 고른 것이 `2p`, 고른 것이 `2p+1`
 * (`BagUI_DrawPocketSelectorIcon`의 `pocketType * 32 (+16)`)
 */
export function pocketIcon(
  meta: BagSprite | undefined, pocket: number, on: boolean, px: number,
): CSSProperties {
  if (!meta) return { width: px, height: px }
  const cell = pocket * 2 + (on ? 1 : 0)
  return {
    width: px,
    height: px,
    backgroundImage: `url(${atlasUrl(BAG_POCKET_ATLAS)})`,
    backgroundSize: `${String(meta.iconCols * px)}px ${String(px)}px`,
    backgroundPosition: `-${String(cell * px)}px 0`,
  }
}
