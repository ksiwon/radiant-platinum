// 나무열매 태그 — 열매에 붙은 종이 한 장.
//
// 맛 다섯은 **막대**로 본다. 숫자만 늘어놓으면 어느 맛이 센지를 세어야 알고,
// 포핀을 만들 때 보는 것은 그 균형이다.
import { style } from '@vanilla-extract/css'
import { BAR_FILL, BAR_TRACK, WINDOW } from '../theme/window.css'
import { vars } from '../theme/contract.css'

export const tag = style({
  margin: 'auto',
  width: 'min(460px, calc(100vw - 72px))',
  padding: '22px 26px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  ...WINDOW,
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
  ...BAR_TRACK,
})

export const barFill = style({
  ...BAR_FILL,
  vars: { '--lit': vars.hp.greenLit, '--body': vars.state.good },
  display: 'block',
})

export const flavorValue = style({
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.8,
})

export const desc = style({
  margin: 0,
  paddingTop: 12,
  borderTop: `1px solid ${vars.window.rule}`,
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
})
