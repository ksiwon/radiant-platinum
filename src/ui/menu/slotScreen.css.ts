// 슬롯머신 화면 — 원작 두 판을 나란히 (PARITY §7.6)
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { OVERLAY_Z } from './menuChrome.css'
import { WINDOW } from '../theme/window.css'

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: OVERLAY_Z,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  background: vars.scrim.black,
  userSelect: 'none',
})

export const stage = style({
  display: 'flex',
  gap: 16,
  alignItems: 'center',
})

export const screen = style({ position: 'relative' })

export const canvas = style({
  display: 'block',
  imageRendering: 'pixelated',
})

/** 원작 글 창 — 위 화면 아래쪽 네 줄 (`Unk_ov101_021D8588` — 타일 (2,19)에서 26×4) */
export const message = style({
  position: 'absolute',
  left: '7%',
  right: '7%',
  bottom: '4%',
  padding: '0.6em 1em',
  whiteSpace: 'pre-line',
  lineHeight: 1.5,
  fontFamily: vars.font.pixel,
  ...WINDOW,
})

export const legend = style({
  color: vars.ink.faint,
  fontSize: 13,
  fontFamily: vars.font.pixel,
})

export const failed = style({ color: vars.state.bad, fontSize: 13 })
