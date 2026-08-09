import { style } from '@vanilla-extract/css'
import { vars } from '../../ui/theme/contract.css'

export const wrap = style({
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  overflowY: 'auto',
  padding: 'clamp(20px, 4vh, 48px) clamp(16px, 4vw, 56px)',
  background: 'linear-gradient(180deg, #0a1020 0%, #121a2c 60%, #0a1020 100%)',
  color: vars.panel.text,
  fontFamily: vars.font.ui,
})

export const sheet = style({
  maxWidth: 760,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
})

export const title = style({
  margin: 0,
  fontSize: 24,
  letterSpacing: '0.02em',
})

/** 지금 판이 어디까지인지. **첫 화면에서 감추지 않는다** */
export const banner = style({
  padding: '12px 14px',
  borderRadius: 10,
  fontSize: 13,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
  border: '1px solid rgba(255, 196, 90, 0.4)',
  background: 'rgba(120, 84, 18, 0.28)',
})

export const step = style({
  padding: '14px 16px',
  borderRadius: 12,
  border: `1px solid ${vars.panel.border}`,
  background: 'rgba(12, 17, 30, 0.7)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
})

export const stepHead = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontSize: 15,
  fontWeight: 700,
})

export const stepNote = style({
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 400,
})

export const body = style({
  fontSize: 13,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
})

export const ok = style({ color: '#8fe0a4' })
export const bad = style({ color: '#ff9a9a' })

export const row = style({ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' })

export const button = style({
  appearance: 'none',
  padding: '8px 14px',
  fontFamily: vars.font.ui,
  fontSize: 13,
  color: vars.panel.text,
  background: 'rgba(30, 40, 66, 0.9)',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 999,
  cursor: 'pointer',
  selectors: {
    '&:disabled': { opacity: 0.4, cursor: 'default' },
    '&:hover:not(:disabled)': { background: 'rgba(46, 60, 96, 0.95)' },
  },
})

export const groups = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  gap: '4px 12px',
  fontSize: 12.5,
  alignItems: 'baseline',
})

export const bar = style({
  height: 6,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.12)',
  overflow: 'hidden',
})

export const barFill = style({
  height: '100%',
  background: 'linear-gradient(90deg, #6ea8ff, #8fe0a4)',
  transition: 'width 120ms linear',
})

export const list = style({
  margin: 0,
  paddingLeft: 18,
  fontSize: 12.5,
  lineHeight: 1.8,
  opacity: 0.86,
})
