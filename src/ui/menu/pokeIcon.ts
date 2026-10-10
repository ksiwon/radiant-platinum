// 포켓몬 아이콘·박스 벽지 — 아틀라스 한 장을 잘라 쓴다 (`itemIcon.ts`와 같은 수법).
//
// ⚠️ **위치와 시트 크기를 함께 민다.** 배경 위치만 옮기고 `background-size`를
// 안 늘리면 그림이 안 바뀐 채 잘리기만 한다. 그 계산은 `common/pixelSprite` 한 곳이다 —
// 한때 박스 파티 아이콘이 칸 계산과 배율이 따로 놀아서 **잘리고 엉뚱한 마리가 나왔다**
// (DECISIONS 사용자 지적 ③).
//
// ⚠️ **칸 번호는 종족 번호가 아니다.** 앞 495칸까지만 종족 순서와 같고
// (494 = 알), 그 뒤 45칸이 폼 아이콘이다 — 안농 스물일곱 글자·도롱마담 옷감·
// 로토무 다섯 가전이 거기 있다. 어느 칸인지는 `engine/pokemon/form.iconSlot`이
// 답한다 (`PokeIconSpriteIndex`).
import type { CSSProperties } from 'react'
import type { BoxWallpapers, PokeIcons } from '../../data/schema'
import { BOX_WALLPAPER_ATLAS, POKE_ICON_ATLAS } from '../../data/gameData'
import { atlasUrl } from '../../data/providers/atlas'
import type { SpriteSheet } from '../../data/spriteSheet'
import { iconSlot } from '../../engine/pokemon/form'
import { pixelSprite, scaleFor } from '../common/pixelSprite'
import { ICON, type PixelScale } from '../theme/scale'

/** 포켓몬 아이콘 시트 */
export function pokeSheet(icons: PokeIcons): SpriteSheet {
  return { path: POKE_ICON_ATLAS, cellW: icons.size, cellH: icons.size, cols: icons.cols, rows: icons.rows }
}

/** 벽지 시트 — 칸이 네모가 아니다(168×160) */
export function wallSheet(walls: BoxWallpapers): SpriteSheet {
  return { path: BOX_WALLPAPER_ATLAS, cellW: walls.width, cellH: walls.height, cols: walls.cols, rows: walls.rows }
}

/** 그 개체의 아이콘 한 칸을 `px` 크기로. 자료를 아직 못 받았으면 빈 칸이다 */
export function monIcon(
  icons: PokeIcons | undefined,
  mon: { species: number, form: number, isEgg: boolean },
  px: number,
): CSSProperties {
  return pokeIcon(icons, iconSlot(mon.species, mon.form, mon.isEgg), px)
}

/** 그 개체의 아이콘을 정수 배율로 */
export function monIconAt(
  icons: PokeIcons | undefined,
  mon: { species: number, form: number, isEgg: boolean },
  scale: PixelScale,
): CSSProperties {
  return pokeIconAt(icons, iconSlot(mon.species, mon.form, mon.isEgg), scale)
}

/** 아이콘 칸 하나를 정수 배율로. 시트 밖의 번호는 **빈 칸이다** — 밀면 다른 포켓몬이 뜬다 */
export function pokeIconAt(
  icons: PokeIcons | undefined, slot: number, scale: PixelScale,
): CSSProperties {
  if (!icons || slot < 0 || slot >= icons.count) {
    return { width: ICON.cell * scale, height: ICON.cell * scale }
  }
  return pixelSprite(pokeSheet(icons), slot, scale)
}

/**
 * 아이콘 칸 하나를 `px` 크기로 (`px`는 32의 정수배). 개체가 있으면 `monIcon`을 쓴다.
 * 새 코드는 `pokeIconAt(icons, slot, scale)`을 쓴다
 */
export function pokeIcon(
  icons: PokeIcons | undefined, slot: number, px: number,
): CSSProperties {
  return pokeIconAt(icons, slot, scaleFor(px, ICON.cell, 'pokeIcon'))
}

/**
 * 벽지 한 장을 `k`배로 (정수).
 *
 * 칸이 네모가 아니라(168×160) 배수 하나로 가로세로를 함께 민다. 없는 번호는
 * 0번으로 돌린다 — 벽지가 안 깔리면 박스가 통째로 비어 보인다
 */
export function boxWallpaper(
  walls: BoxWallpapers | undefined, index: number, k: number,
): CSSProperties {
  if (!walls) return {}
  const at = ((index % walls.count) + walls.count) % walls.count
  return pixelSprite(wallSheet(walls), at, scaleFor(k, 1, 'boxWallpaper'))
}

/**
 * 벽지 썸네일 — **줄이는 것이 허용되는 유일한 자리**다 (박스 필름 띠, SYSTEM §0). 폭 `width`px에 맞춰
 * 부드럽게 줄이므로 도트 보간을 끄지 않는다(`image-rendering: auto`). 칸 비율은 그대로다
 */
export function wallThumb(
  walls: BoxWallpapers | undefined, index: number, width: number,
): CSSProperties {
  if (!walls) return {}
  const at = ((index % walls.count) + walls.count) % walls.count
  const k = width / walls.width
  const col = at % walls.cols
  const row = Math.floor(at / walls.cols)
  const url = atlasUrl(BOX_WALLPAPER_ATLAS)
  return {
    width,
    height: walls.height * k,
    ...(url === '' ? {} : { backgroundImage: `url(${url})` }),
    backgroundSize: `${String(walls.cols * walls.width * k)}px ${String(walls.rows * walls.height * k)}px`,
    backgroundPosition: `-${String(col * walls.width * k)}px -${String(row * walls.height * k)}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'auto',
  }
}
