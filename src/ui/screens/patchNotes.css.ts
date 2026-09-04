// 패치노트 창 — 타이틀 위에 서는 창 하나.
//
// ⚠️ **새 창 문법을 들이지 않는다.** 「이런 게임은 어떠세요?」와 같은 자리에서
// 같은 방식으로 열리므로 몸도 같아야 한다 (`otherGames.css`와 나란히 읽을 것).
// 여기만 다른 판을 쓰면 X를 누르는 순간 다른 게임이 된다 (DESIGN.md §3).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { WINDOW, WINDOW_SMALL, scrim } from '../theme/window.css'

export const over = style([scrim, { zIndex: 20 }])

export const panel = style({
  ...WINDOW,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  width: 'min(560px, calc(100vw - 32px))',
  // 테두리와 여백을 폭 안에 넣는다 — `otherGames.css`가 같은 줄을 들고 있는 이유다
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

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.wide,
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

export const head = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.small,
})

export const version = style({
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const date = style({
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})

export const lead = style({
  margin: `${GAP.tight}px 0 0`,
  fontSize: TEXT.small,
  lineHeight: 1.5,
  color: vars.ink.dim,
})

export const items = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  margin: `${GAP.small}px 0 0`,
  padding: 0,
  listStyle: 'none',
})

/**
 * 한 줄 — 딱지와 글, 두 칸.
 *
 * ⚠️ **표(grid)로 둔다.** 딱지를 글 흐름에 흘려 두면 글이 접힐 때 둘째 줄이
 * 딱지 밑으로 파고들어 왼쪽 줄이 흐트러진다
 */
export const item = style({
  display: 'grid',
  gridTemplateColumns: '3.6em 1fr',
  gap: GAP.small,
  fontSize: TEXT.small,
  lineHeight: 1.5,
})

export const tag = style({
  ...WINDOW_SMALL,
  alignSelf: 'start',
  padding: '1px 0',
  borderRadius: RADIUS.bar,
  fontSize: TEXT.tiny,
  textAlign: 'center',
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
