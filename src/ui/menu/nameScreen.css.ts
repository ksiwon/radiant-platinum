// 이름 짓기 창 — 대사창과 같은 결로 가운데에 하나만 뜬다.
//
// 「같은 결」이 주석이 아니라 코드다 — 창은 `theme/window.css`에서 온다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { WINDOW } from '../theme/window.css'

export const card = style({
  ...WINDOW,
  minWidth: 380,
  maxWidth: '80vw',
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base + 2,
  padding: `${GAP.loose - 2}px ${GAP.loose + 2}px`,
})

export const prompt = style({
  margin: 0,
  fontSize: TEXT.list,
  lineHeight: 1.5,
  color: vars.ink.strong,
})

export const row = style({
  display: 'flex',
  gap: GAP.small + 2,
  alignItems: 'center',
})

/** 글 쓰는 칸. 창 안에 파인 자리라 테두리가 창 테두리보다 얇다 */
export const input = style({
  flex: 1,
  minWidth: 0,
  padding: `${GAP.small + 2}px ${GAP.base}px`,
  fontSize: TEXT.list,
  fontFamily: 'inherit',
  color: vars.ink.strong,
  background: vars.bar.trackTop,
  border: `${EDGE.bar}px solid ${vars.window.edgeDim}`,
  borderRadius: RADIUS.cell,
  ':focus': { outline: `2px solid ${vars.pick.edge}`, outlineOffset: 1 },
})

export const ok = style({
  padding: `${GAP.small + 2}px ${GAP.wide + 2}px`,
  fontSize: TEXT.list,
  fontFamily: 'inherit',
  fontWeight: 700,
  color: vars.pick.text,
  background: vars.pick.face,
  border: `${EDGE.bar}px solid ${vars.pick.edge}`,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
})

/** 안 짓고 넘어가는 줄. 버튼보다 약하게 둔다 — 원작의 B에 해당한다 */
export const skip = style({
  alignSelf: 'flex-end',
  padding: `${GAP.tight}px 2px`,
  fontSize: TEXT.small,
  fontFamily: 'inherit',
  color: vars.ink.dim,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
})
