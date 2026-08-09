// 이름 짓기 창 — 대사창과 같은 결로 가운데에 하나만 뜬다
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const card = style({
  minWidth: 380,
  maxWidth: '80vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '22px 26px',
  borderRadius: 14,
  background: vars.panel.bg,
  border: `2px solid ${vars.panel.border}`,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
})

export const prompt = style({
  margin: 0,
  fontSize: 18,
  lineHeight: 1.5,
  color: vars.panel.text,
})

export const row = style({
  display: 'flex',
  gap: 10,
  alignItems: 'center',
})

export const input = style({
  flex: 1,
  minWidth: 0,
  padding: '10px 12px',
  fontSize: 18,
  fontFamily: 'inherit',
  color: vars.panel.text,
  background: vars.panel.bg,
  border: `2px solid ${vars.panel.border}`,
  borderRadius: 8,
  ':focus': { outline: `2px solid ${vars.hud.accent}`, outlineOffset: 1 },
})

export const ok = style({
  padding: '10px 18px',
  fontSize: 17,
  fontFamily: 'inherit',
  color: vars.panel.text,
  background: vars.panel.bg,
  border: `2px solid ${vars.panel.border}`,
  borderRadius: 8,
  cursor: 'pointer',
})

/** 안 짓고 넘어가는 줄. 버튼보다 약하게 둔다 — 원작의 B에 해당한다 */
export const skip = style({
  alignSelf: 'flex-end',
  opacity: 0.7,
  padding: '4px 2px',
  fontSize: 14,
  fontFamily: 'inherit',
  color: vars.panel.text,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
})
