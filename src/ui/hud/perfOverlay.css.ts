import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const overlay = style({
  position: 'fixed',
  top: 8,
  left: 8,
  padding: '6px 10px',
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 6,
  color: vars.panel.text,
  fontFamily: vars.font.mono,
  fontSize: 12,
  lineHeight: 1.5,
  pointerEvents: 'none',
  whiteSpace: 'pre',
  zIndex: 100,
})

/** 머리줄이 곧 여닫는 단추다 */
export const head = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  pointerEvents: 'auto',
  cursor: 'pointer',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
})

/** 접혔는지 폈는지 */
export const mark = style({ marginLeft: 'auto', opacity: 0.55 })

export const good = style({ color: vars.hud.accent })
export const bad = style({ color: vars.hud.warn })
