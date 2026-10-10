// 뜨는 창의 스타일 — 갈래 창(`ChoiceMenu`)과 예/아니오(`YesNo`)가 같이 쓴다 (SYSTEM §2.2 · 4.24).
//
// 살갗은 `POPOVER`(WINDOW_SMALL + 꼭지) 한 벌이다. 줄은 목록 줄(`row`)과 같은 키이고 고른 줄은 금 띠
// 하나(`pickBand`)가 미끄러진다 — 줄마다 판을 깔지 않는다 (§0 L5).
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { caret, popover } from '../theme/window.css'

const enter = keyframes({
  from: { opacity: 0, transform: 'translateX(var(--enter-x, 0px))' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

/** 뜨는 창. 자리는 `ChoiceMenu`가 `left`/`top`을 인라인으로 준다 (원인 옆에 맞춘 뒤 본문 안으로 당긴다) */
export const root = style([popover, {
  zIndex: 30,
  minWidth: 176,
  maxWidth: 220,
  padding: GAP.small,
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
  // 원인 쪽에서 6px 밀려 들어온다 — 입력을 막지 않는다 (키는 열리자마자 먹는다)
  animation: `${enter} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
}])

/** 원인 옆에 앉을 때 — 자리는 `left`/`top` 인라인이다. 원인이 없으면 부모가 `absolute` 그대로 자리를 준다 */
export const rootFixed = style({ position: 'fixed' })

export const list = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
})

export const scrolling = style({
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarWidth: 'thin',
})

export const item = style({
  position: 'relative',
  zIndex: 1,
  flex: '0 0 auto',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  height: LINE.row,
  padding: `0 ${GAP.small}px 0 22px`,
  fontSize: TEXT.list,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
})

export const itemOn = style({ color: vars.pick.text, fontWeight: 700 })
/** 스크롤 목록의 고른 줄 — 띠가 없으니 줄 자체가 금 면이다 (즉시 옮겨 간다) */
export const itemPicked = style({
  background: vars.pick.face,
  boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}`,
  borderRadius: RADIUS.cell,
})
export const itemOff = style({ opacity: 0.42, cursor: 'default' })

export { caret }
