// 「더보기」 — 타이틀 위에 서는 창 하나.
//
// ⚠️ **새 창 문법을 들이지 않는다.** 이 창이 여는 셋(패치노트·버그 제보·이런
// 게임은 어떠세요?)과 같은 몸이어야 한다 — 여기만 다르면 한 걸음 들어갈 때마다
// 다른 게임이 된다 (DESIGN.md §3).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW, WINDOW_SMALL, scrim } from '../theme/window.css'

export const over = style([scrim, { zIndex: 20 }])

export const panel = style({
  ...WINDOW,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  // 고를 것 넷뿐이라 다른 창보다 좁다. 넓히면 글자 넷이 허공에 뜬다
  width: 'min(420px, calc(100vw - 32px))',
  boxSizing: 'border-box',
  maxHeight: 'calc(100vh - 48px)',
  overflowY: 'auto',
  padding: `${GAP.wide}px ${GAP.wide}px ${GAP.base}px`,
  fontFamily: vars.font.ui,
})

export const title = style({
  margin: 0,
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
})

/** 고를 것 하나 — 타이틀 단추와 같은 몸이다 */
export const item = style({
  ...WINDOW_SMALL,
  position: 'relative',
  appearance: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  padding: `${GAP.small + 2}px ${GAP.base}px ${GAP.small + 2}px ${GAP.loose}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.list,
  textAlign: 'left',
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
})

/** 커서가 올라간 칸. 마우스 hover와 키보드 커서를 **같은 표시**로 둔다 */
export const itemOn = style({ ...PICKED })

export const caret = style({
  position: 'absolute',
  left: GAP.small + 2,
  color: vars.pick.edge,
  fontSize: TEXT.small,
})

/** 안 본 것이 있다는 점 — 「패치노트」 칸에만 붙는다 */
export const dot = style({
  width: 6,
  height: 6,
  borderRadius: RADIUS.round,
  background: vars.pick.edge,
})

export const foot = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base,
  flexWrap: 'wrap',
})

export const hint = style({
  flex: '1 1 auto',
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})

export const close = style({
  ...WINDOW_SMALL,
  appearance: 'none',
  padding: `7px ${GAP.base}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
  selectors: { '&:hover': { borderColor: vars.pick.edge } },
})
