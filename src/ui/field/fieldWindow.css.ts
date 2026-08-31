// 필드 창의 살갗과 그 위에 뜨는 예/아니오 — **두 파일이 같은 것을 그렸다** (REPAIR §9)
//
// 대사창(`messageBox`)과 파트너 고르기(`chooseStarter`)가 같은 창을 그린다.
// 원작도 그렇다 — 둘 다 `STANDARD_WINDOW_SYSTEM`의 창틀 하나를 쓴다.
//
// ⚠️ **살갗 자체는 여기 없다.** 창 한 벌은 `ui/theme/window.css`에 있고
// (DESIGN.md §3) 여기는 그것을 필드의 자리에 앉히는 일만 한다. 소지금 창도
// 이제 같은 창이다 — 전에는 모서리와 그림자가 저 혼자 달랐다.
import { style } from '@vanilla-extract/css'
import { GAP, LINE, TEXT } from '../theme/scale'
import { WINDOW } from '../theme/window.css'

/** 창 하나의 살갗. 자리와 여백은 쓰는 쪽이 정한다 */
export const SKIN = WINDOW

/**
 * 예/아니오 차림표 (`ScrCmd_ShowYesNoMenu`).
 *
 * 원작은 창 자리를 명령 인자로 받지만 우리 화면은 해상도가 다르므로 대사창 위
 * 오른쪽에 붙인다. 자리가 달라도 고르는 값은 같다
 */
export const menu = style({
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 10px)',
  minWidth: 128,
  ...SKIN,
  padding: `${GAP.small}px ${GAP.base}px`,
  fontSize: TEXT.list,
  lineHeight: `${LINE.message}px`,
})
