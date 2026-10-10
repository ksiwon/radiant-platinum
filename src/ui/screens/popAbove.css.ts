// 위로 뜨는 창 (`PopAbove`)의 자리와 움직임. 살갗과 꼭지는 `theme/window.css`의 `popover` · `popoverSide`다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, TIME } from '../theme/scale'
import { popover } from '../theme/window.css'

const enter = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
})

/** 뜨는 창 — 원인 칸에서 6px 올라오며 페이드(`TIME.open`). 입력을 막지 않는다 */
export const root = style([popover, {
  position: 'fixed',
  zIndex: 21,
  boxSizing: 'border-box',
  padding: GAP.small,
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
  animation: `${enter} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
}])
