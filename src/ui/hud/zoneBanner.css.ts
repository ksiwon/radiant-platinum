import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

const appear = keyframes({
  '0%': { opacity: 0, transform: 'translate(-50%, -8px)' },
  '12%': { opacity: 1, transform: 'translate(-50%, 0)' },
  '80%': { opacity: 1, transform: 'translate(-50%, 0)' },
  '100%': { opacity: 0, transform: 'translate(-50%, -8px)' },
})

export const banner = style({
  position: 'fixed',
  top: 24,
  left: '50%',
  padding: '8px 22px',
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 999,
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  fontSize: 15,
  letterSpacing: '0.04em',
  pointerEvents: 'none',
  zIndex: 100,
  animation: `${appear} 2.6s ease forwards`,
})
