import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const overlay = style({
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(0, 0, 0, 0.45)',
  zIndex: 200,
  cursor: 'pointer',
})

export const card = style({
  minWidth: 320,
  padding: '22px 28px',
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 12,
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  textAlign: 'center',
})

export const title = style({ fontSize: 18, marginBottom: 8 })
export const detail = style({ fontSize: 14, opacity: 0.8 })
export const hint = style({ marginTop: 14, fontSize: 12, opacity: 0.5 })
