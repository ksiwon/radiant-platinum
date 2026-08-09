// 포켓몬 아이콘·박스 벽지 — 아틀라스 한 장을 잘라 쓴다 (`itemIcon.ts`와 같은 수법).
//
// ⚠️ **위치와 시트 크기를 함께 민다.** 배경 위치만 옮기고 `background-size`를
// 안 늘리면 그림이 안 바뀐 채 잘리기만 한다. 도구 아이콘에서 한 번 겪은 자리다.
//
// 아이콘 색인은 **종족 번호 그대로**다 (0 = 빈 칸). 도감 순서가 아니다 —
// 롬의 `pl_poke_icon.narc`가 종족 순서로 놓여 있다.
import type { CSSProperties } from 'react'
import type { BoxWallpapers, PokeIcons } from '../../data/schema'
import { BOX_WALLPAPER_ATLAS, POKE_ICON_ATLAS } from '../../data/gameData'
import { atlasUrl } from '../../data/providers/atlas'

/** 아이콘 한 칸을 `px` 크기로. 자료를 아직 못 받았으면 빈 칸이다 */
export function pokeIcon(
  icons: PokeIcons | undefined, species: number, px: number,
): CSSProperties {
  if (!icons || species < 0 || species >= icons.count) return { width: px, height: px }
  const col = species % icons.cols
  const row = Math.floor(species / icons.cols)
  return {
    width: px,
    height: px,
    backgroundImage: `url(${atlasUrl(POKE_ICON_ATLAS)})`,
    backgroundSize: `${String(icons.cols * px)}px ${String(icons.rows * px)}px`,
    backgroundPosition: `-${String(col * px)}px -${String(row * px)}px`,
  }
}

/**
 * 벽지 한 장을 `k`배로.
 *
 * 칸이 네모가 아니라(168×160) 배수 하나로 가로세로를 함께 민다. 없는 번호는
 * 0번으로 돌린다 — 벽지가 안 깔리면 박스가 통째로 비어 보인다
 */
export function boxWallpaper(
  walls: BoxWallpapers | undefined, index: number, k: number,
): CSSProperties {
  if (!walls) return {}
  const at = ((index % walls.count) + walls.count) % walls.count
  const col = at % walls.cols
  const row = Math.floor(at / walls.cols)
  const w = walls.width * k, h = walls.height * k
  return {
    backgroundImage: `url(${atlasUrl(BOX_WALLPAPER_ATLAS)})`,
    backgroundSize: `${String(walls.cols * w)}px ${String(walls.rows * h)}px`,
    backgroundPosition: `-${String(col * w)}px -${String(row * h)}px`,
  }
}
