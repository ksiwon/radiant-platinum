// 도구 아이콘 — 468칸짜리 아틀라스 한 장을 잘라 쓴다.
//
// 파일 468개를 받는 것보다 훨씬 싸고, 목록을 굴릴 때 새로 뜨는 칸이 없다.
//
// ⚠️ **칸 크기를 바꾸려면 시트도 같이 늘려야 한다.** 칸은 32픽셀인데 배경
// 위치만 옮기고 칸을 28픽셀로 줄이면 그림의 오른쪽 아래가 잘린다. 그래서
// 배율 하나로 `background-size`와 위치를 함께 민다 — 목록에서는 작게,
// 설명칸에서는 크게 같은 그림을 쓴다.
import type { CSSProperties } from 'react'
import type { ItemIcons } from '../../data/schema'
import { ITEM_ICON_ATLAS } from '../../data/gameData'
import { atlasUrl } from '../../data/providers/atlas'

/** 아이콘 한 칸을 `px` 크기로. 자료를 아직 못 받았으면 빈 칸이다 */
export function itemIcon(
  icons: ItemIcons | undefined, id: number, px: number,
): CSSProperties {
  if (!icons) return { width: px, height: px }
  // ⚠️ 칸은 **도구 번호**다. 롬 밖의 둘(468·469)도 아틀라스에 제 칸이 있다 —
  // 굽는 쪽이 표 뒤에 두 칸을 더 그린다 (`tools/extract/itemIcons.js`)
  const col = id % icons.cols
  const rowAt = Math.floor(id / icons.cols)
  return {
    width: px,
    height: px,
    backgroundImage: `url(${atlasUrl(ITEM_ICON_ATLAS)})`,
    backgroundSize: `${String(icons.cols * px)}px ${String(icons.rows * px)}px`,
    backgroundPosition: `-${String(col * px)}px -${String(rowAt * px)}px`,
  }
}
