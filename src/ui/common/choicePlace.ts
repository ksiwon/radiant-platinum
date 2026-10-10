// 뜨는 창의 자리 셈 (SYSTEM §2.2 `ChoiceMenu` — 「원인의 위끝에 맞추고, 본문 밖으로 나가면 당긴다」).
//
// 순수 함수다. DOM이 재서 넘긴 사각형만 받으므로 시험이 브라우저 없이 돈다. 갈래 창이 원인 줄 **옆**에 붙는다
// (결정 4.4) — 오른쪽에 자리가 없으면 왼쪽으로 뒤집는다.
import { NIB } from '../theme/scale'

export interface Box { left: number, top: number, width: number, height: number }

export type PopSide = 'right' | 'left'

export interface Placement {
  left: number
  top: number
  /** 실제로 앉은 쪽 — 자리가 없으면 `want`와 다를 수 있다 */
  side: PopSide
  /** 꼭지가 창 위끝에서 얼마나 내려오는가 (원인 줄의 가운데를 가리킨다) */
  nibAt: number
}

/** 꼭지가 창 모서리에 너무 붙지 않게 두는 여백(px) */
const NIB_MARGIN = 12

/**
 * @param anchor 원인 줄의 사각형
 * @param size 뜨는 창의 크기
 * @param bounds 넘지 말아야 하는 본문의 사각형 (창 · 화면)
 * @param want 앉고 싶은 쪽
 */
export function placeChoice(anchor: Box, size: { width: number, height: number }, bounds: Box, want: PopSide): Placement {
  const room = {
    right: bounds.left + bounds.width - (anchor.left + anchor.width + NIB),
    left: anchor.left - NIB - bounds.left,
  }
  const side: PopSide = room[want] >= size.width ? want : room[want === 'right' ? 'left' : 'right'] >= size.width
    ? (want === 'right' ? 'left' : 'right') : want
  const left = side === 'right' ? anchor.left + anchor.width + NIB : anchor.left - NIB - size.width
  // 원인의 위끝에 맞추고, 본문 아래로 나가면 위로 당긴다. 위로도 못 맞추면 본문의 위끝에 붙인다
  const maxTop = bounds.top + bounds.height - size.height
  const top = Math.max(bounds.top, Math.min(anchor.top, maxTop))
  // 꼭지는 원인 줄의 가운데 — 창 안에 머문다
  const center = anchor.top + anchor.height / 2 - top
  const nibAt = Math.max(NIB_MARGIN, Math.min(size.height - NIB_MARGIN, center))
  return { left, top, side, nibAt }
}
