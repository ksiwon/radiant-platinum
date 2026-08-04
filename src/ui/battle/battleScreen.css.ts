import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const screen = style({
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  display: 'grid',
  gridTemplateRows: '1fr auto',
  fontFamily: vars.font.ui,
  color: vars.panel.text,
  // 3D 배틀 씬이 들어오기 전까지의 임시 배경. 씬이 생기면 투명해진다
  background: 'linear-gradient(180deg, #16233a 0%, #24354f 55%, #1a2436 100%)',
  userSelect: 'none',
})

/** 양쪽 포켓몬이 서는 판 */
export const field = style({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: '1fr 1fr',
  alignItems: 'center',
  padding: '24px 32px',
  gap: 12,
})

export const foeSlot = style({ gridColumn: 2, gridRow: 1, justifySelf: 'end' })
export const mineSlot = style({ gridColumn: 1, gridRow: 2, justifySelf: 'start' })

export const card = style({
  minWidth: 260,
  padding: '10px 14px',
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 10,
})

export const cardHead = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 6,
})

export const monName = style({ fontSize: 16, fontWeight: 600 })
export const monLevel = style({ fontSize: 13, opacity: 0.75 })

export const barTrack = style({
  height: 8,
  borderRadius: 4,
  background: 'rgba(255, 255, 255, 0.14)',
  overflow: 'hidden',
})

export const barFill = style({
  height: '100%',
  borderRadius: 4,
  background: vars.hud.accent,
  transition: 'width 320ms ease-out, background 200ms linear',
})

/** HP가 낮을 때. 원작처럼 색으로 먼저 알린다 */
export const barLow = style({ background: '#ffd166' })
export const barCritical = style({ background: vars.hud.warn })

export const hpText = style({
  marginTop: 4,
  fontSize: 12,
  fontFamily: vars.font.mono,
  opacity: 0.8,
  textAlign: 'right',
})

export const statusTag = style({
  marginLeft: 6,
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 11,
  background: 'rgba(255, 255, 255, 0.16)',
})

/** 아래쪽 텍스트 + 명령 */
export const console_ = style({
  display: 'grid',
  gridTemplateColumns: '1fr 320px',
  gap: 12,
  padding: '0 16px 16px',
  minHeight: 168,
})

export const textBox = style({
  padding: '14px 18px',
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 10,
  fontSize: 15,
  lineHeight: 1.7,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  gap: 2,
  overflow: 'hidden',
})

export const textLine = style({ opacity: 0.55 })
export const textLast = style({ opacity: 1 })

export const menu = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridAutoRows: 'minmax(44px, auto)',
  gap: 8,
})

export const button = style({
  appearance: 'none',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 8,
  background: vars.panel.bg,
  color: vars.panel.text,
  font: 'inherit',
  fontSize: 14,
  padding: '6px 10px',
  cursor: 'pointer',
  textAlign: 'left',
  display: 'grid',
  alignContent: 'center',
  gap: 2,
  transition: 'border-color 120ms linear, transform 80ms ease-out',
  selectors: {
    '&:hover:enabled': { borderColor: vars.hud.accent },
    '&:active:enabled': { transform: 'translateY(1px)' },
    '&:disabled': { opacity: 0.4, cursor: 'default' },
  },
})

export const buttonWide = style({ gridColumn: '1 / -1' })
export const buttonSub = style({ fontSize: 11, opacity: 0.7, fontFamily: vars.font.mono })

globalStyle(`${button} > *`, { pointerEvents: 'none' })

const pulse = keyframes({
  '0%, 100%': { opacity: 0.35 },
  '50%': { opacity: 1 },
})

export const waiting = style({
  padding: 12,
  fontSize: 13,
  animation: `${pulse} 1.1s ease-in-out infinite`,
})
