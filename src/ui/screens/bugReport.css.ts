// 버그 제보 창 — 타이틀 위에 서는 창 하나.
//
// ⚠️ **새 창 문법을 들이지 않는다.** 「이런 게임은 어떠세요?」·패치노트와 같은
// 자리에서 같은 방식으로 열리므로 몸도 같아야 한다 (DESIGN.md §3).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { WINDOW, WINDOW_SMALL, scrim } from '../theme/window.css'

export const over = style([scrim, { zIndex: 20 }])

export const panel = style({
  ...WINDOW,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  width: 'min(560px, calc(100vw - 32px))',
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

export const intro = style({
  margin: 0,
  fontSize: TEXT.small,
  lineHeight: 1.6,
  color: vars.ink.dim,
})

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
})

export const row = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
})

export const label = style({
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.normal,
})

/**
 * 글자 칸 — 창 안에 파인 자리.
 *
 * ⚠️ **이름 짓기 칸(`nameScreen.css`)과 같은 몸이다.** 이 게임에 글을 치는 자리가
 * 그 둘뿐인데 서로 다르게 생기면, 둘 다 「어디서 온 칸인지」 알 수 없게 된다
 */
const field = {
  width: '100%',
  boxSizing: 'border-box',
  padding: `${GAP.small}px ${GAP.base}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.small,
  color: vars.ink.strong,
  background: vars.bar.trackTop,
  border: `${EDGE.bar}px solid ${vars.window.edgeDim}`,
  borderRadius: RADIUS.cell,
  ':focus': { outline: `2px solid ${vars.pick.edge}`, outlineOffset: 1 },
} as const

export const input = style(field)

export const textarea = style({
  ...field,
  minHeight: 132,
  resize: 'vertical',
  lineHeight: 1.5,
})

/**
 * 무엇이 함께 가는지 — **접어 두지 않는다.**
 *
 * ⚠️ 이 게임은 「서버로 아무것도 안 간다」를 첫 화면에서 약속하고 있다
 * (COPYRIGHT.md §11). 그 약속에 구멍을 하나 내는 화면이라면, 그 구멍의 크기를
 * 누르기 **전에** 같은 화면에서 말해야 한다
 */
export const what = style({
  margin: 0,
  fontSize: TEXT.tiny,
  lineHeight: 1.6,
  color: vars.ink.faint,
})

export const fail = style({
  margin: 0,
  fontSize: TEXT.small,
  lineHeight: 1.5,
  color: vars.hp.red,
})

export const done = style({
  margin: 0,
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
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

const button = {
  ...WINDOW_SMALL,
  appearance: 'none',
  padding: `7px ${GAP.base}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
} as const

export const close = style({
  ...button,
  selectors: { '&:hover': { borderColor: vars.pick.edge } },
})

export const send = style({
  ...button,
  fontWeight: 700,
  selectors: {
    '&:hover:not(:disabled)': { borderColor: vars.pick.edge },
    '&:disabled': { opacity: 0.45, cursor: 'not-allowed' },
  },
})
