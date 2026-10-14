// 오래 한 판 경고 — 왼쪽 아래 창 한 벌. 이름표(`zoneBanner`)와 같은 작은 창을 쓴다 (DESIGN.md §2 · 알약 금지)
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, TEXT } from '../theme/scale'
import { WINDOW_SMALL } from '../theme/window.css'

export const box = style({
  ...WINDOW_SMALL,
  position: 'fixed',
  left: GAP.loose,
  bottom: GAP.loose,
  maxWidth: 440,
  padding: `${GAP.base}px ${GAP.loose}px`,
  fontFamily: vars.font.pixel,
  fontSize: TEXT.small,
  lineHeight: 1.5,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
})

export const title = style({ fontSize: TEXT.base, fontWeight: 700 })

export const actions = style({ display: 'flex', gap: GAP.base, justifyContent: 'flex-end' })

export const button = style({
  font: 'inherit',
  fontWeight: 700,
  color: 'inherit',
  background: 'transparent',
  border: 'none',
  padding: `${GAP.small / 2}px ${GAP.small}px`,
  cursor: 'pointer',
  selectors: {
    '&:hover': { color: vars.pick.text },
    '&:disabled': { opacity: 0.42, cursor: 'default' },
  },
})
