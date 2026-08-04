import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const wrap = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 24,
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  zIndex: 10,
})

export const title = style({
  fontSize: 42,
  fontWeight: 700,
  letterSpacing: 2,
  textShadow: '0 2px 12px rgba(0,0,0,0.6)',
})

export const button = style({
  padding: '12px 48px',
  fontSize: 18,
  fontFamily: vars.font.ui,
  color: vars.panel.text,
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 8,
  cursor: 'pointer',
  ':hover': { borderColor: vars.hud.accent },
})

export const hint = style({
  fontSize: 13,
  opacity: 0.7,
})
