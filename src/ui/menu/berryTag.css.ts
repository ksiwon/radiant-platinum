// 나무열매 태그 — 열매에 붙은 종이 한 장.
//
// 맛 다섯은 **막대**로 본다. 숫자만 늘어놓으면 어느 맛이 센지를 세어야 알고,
// 포핀을 만들 때 보는 것은 그 균형이다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const tag = style({
  margin: 'auto',
  width: 'min(460px, calc(100vw - 72px))',
  padding: '22px 26px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  background: 'linear-gradient(165deg, #3a4a2e 0%, #26301e 100%)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 12,
  boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
})

export const head = style({ display: 'flex', alignItems: 'baseline', gap: 12 })
export const no = style({
  fontFamily: vars.font.mono,
  fontSize: 13,
  opacity: 0.6,
})
export const name = style({ fontSize: 24, fontWeight: 800 })

export const facts = style({
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '6px 16px',
  margin: 0,
  fontSize: 15,
})

export const flavors = style({ display: 'flex', flexDirection: 'column', gap: 5 })

export const flavorRow = style({
  display: 'grid',
  gridTemplateColumns: '58px 1fr 34px',
  alignItems: 'center',
  gap: 10,
  fontSize: 13,
})

export const flavorName = style({ opacity: 0.78 })

export const bar = style({
  height: 8,
  borderRadius: 4,
  background: 'rgba(0,0,0,0.35)',
  overflow: 'hidden',
})

export const barFill = style({
  display: 'block',
  height: '100%',
  background: 'linear-gradient(90deg, #a8d46a, #e0c94a)',
})

export const flavorValue = style({
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.8,
})

export const desc = style({
  margin: 0,
  paddingTop: 12,
  borderTop: `1px solid ${vars.panel.border}`,
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
})
