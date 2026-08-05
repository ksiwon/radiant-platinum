// 도감 화면.
//
// 왼쪽 줄에 번호·볼·이름 셋이 늘 같은 자리에 있어야 210줄을 훑을 때 눈이 안
// 흔들린다. 그래서 번호와 볼은 폭을 고정한다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const number = style({
  width: 40,
  flex: '0 0 auto',
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.7,
  fontSize: 15,
})

/** 잡은 것에만 볼이 찬다. 본 것은 빈 동그라미다 */
export const ball = style({
  width: 12,
  height: 12,
  flex: '0 0 auto',
  borderRadius: '50%',
  border: '2px solid currentColor',
  opacity: 0.55,
  selectors: {
    '&[data-caught="yes"]': {
      background: vars.hud.warn,
      borderColor: vars.hud.warn,
      opacity: 1,
    },
  },
})

export const detail = style({
  padding: '20px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minHeight: 0,
  overflowY: 'auto',
})

export const title = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  fontSize: 24,
  fontWeight: 700,
})

export const category = style({
  fontSize: 15,
  fontWeight: 500,
  opacity: 0.75,
})

export const measures = style({
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '4px 16px',
  fontSize: 16,
  opacity: 0.9,
})

export const measureValue = style({
  fontVariantNumeric: 'tabular-nums',
})

export const entry = style({
  fontSize: 17,
  lineHeight: '28px',
  whiteSpace: 'pre-line',
  paddingTop: 6,
  borderTop: `1px solid ${vars.panel.border}`,
})
