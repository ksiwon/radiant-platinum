// 시작 메뉴 아이콘 한 칸 (`itemIcon()`과 같은 꼴의 칸 자르개).
//
// 원작 시작 메뉴의 컬러 아이콘이다 (`start_menu` NARC의 `icons`). 시트는 왼쪽 열이 컬러, 오른쪽 열이
// 회색이고 칸 사이에 한 줄이 비어 있다 (`data/gameData`의 `startMenuIconSheet`). 고른 줄의 아이콘만
// 컬러(`lit`)이고 나머지는 회색이다 — 다른 화면의 머리 아이콘은 늘 컬러다.
//
// ⚠️ **아이콘이 없으면 글자 아이콘을 지어내지 않는다.** 그림이 안 왔거나(P0b가 굽기 전 · 설치본에 빠짐)
// 못 읽으면 빈 칸이다. 그 대신 한 번 콘솔에 경고를 남긴다 — 비어 있는 것을 눈으로만 잡게 두지 않는다
// (SYSTEM §6.1 ④: e2e가 이 경고를 센다).
import type { CSSProperties } from 'react'
import { startMenuIconSheet } from '../../data/gameData'
import { gameLocale } from '../../state/optionsStore'
import { pixelSpriteAt } from '../common/pixelSprite'
import { ICON, type PixelScale } from '../theme/scale'

/** 아이콘 칸의 이름. 시트의 줄 차례가 이 차례다 (P0b ①) */
export type MenuIconKey =
  | 'pokedex' | 'party' | 'bag' | 'trainerCard' | 'save' | 'options' | 'exit' | 'chat' | 'retire'

const ROW: Record<MenuIconKey, number> = {
  pokedex: 0, party: 1, bag: 2, trainerCard: 3, save: 4, options: 5, exit: 6, chat: 7, retire: 8,
}
/** 가방만 남·여가 다르다 — 여자 가방이 9번 줄이다 */
const GIRL_BAG_ROW = 9

/** 이 아이콘이 시트의 몇 번째 줄인가 (시험이 칸 표를 맞대 본다) */
export function menuIconRow(key: MenuIconKey, gender: 'boy' | 'girl'): number {
  return key === 'bag' && gender === 'girl' ? GIRL_BAG_ROW : ROW[key]
}

let warnedMissing = false

/**
 * 아이콘 한 칸. `lit`이 참이면 컬러, 거짓이면 회색이다. `scale`은 기본 1배(32px)다.
 *
 * 그림이 아직 안 왔으면 칸 상자만 선다. 첫 그림 전에는 그것이 정상이라 여기서 경고하지 않는다 —
 * 로더(`loadStartMenuIcons`)가 `null`을 돌려준 **뒤에도** 비는 것이 문제이고, 그 알림은 부르는 쪽이
 * `warnMenuIconsMissing`으로 낸다
 */
export function menuIcon(
  key: MenuIconKey, gender: 'boy' | 'girl', lit: boolean, scale: PixelScale = 1, locale = gameLocale(),
): CSSProperties {
  return pixelSpriteAt(startMenuIconSheet(locale), lit ? 0 : 1, menuIconRow(key, gender), scale)
}

/** 로더가 `null`을 돌려줬을 때 한 번만 알린다 (`loadStartMenuIcons`) */
export function warnMenuIconsMissing(): void {
  if (warnedMissing) return
  warnedMissing = true
  console.warn('시작 메뉴 아이콘 그림(data/startMenuIcons.png)을 못 받았다 — 아이콘 칸을 비운다')
}

/** 아이콘 칸 하나의 크기 (배율 적용) */
export function menuIconSize(scale: PixelScale = 1): number {
  return ICON.cell * scale
}
