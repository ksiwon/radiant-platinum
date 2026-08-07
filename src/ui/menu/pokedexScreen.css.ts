// 도감 화면.
//
// 왼쪽 줄에 번호·볼·이름 셋이 늘 같은 자리에 있어야 210줄을 훑을 때 눈이 안
// 흔들린다. 그래서 번호와 볼은 폭을 고정한다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const number = style({
  width: 34,
  flex: '0 0 auto',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: vars.font.mono,
  fontSize: 13,
  opacity: 0.65,
})

/** 잡은 것에만 볼이 찬다. 본 것은 빈 동그라미다 */
export const ball = style({
  width: 10,
  height: 10,
  flex: '0 0 auto',
  borderRadius: '50%',
  border: '2px solid currentColor',
  opacity: 0.5,
  selectors: {
    '&[data-caught="yes"]': {
      background: vars.hud.warn,
      borderColor: vars.hud.warn,
      opacity: 1,
    },
  },
})

export const title = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontSize: 21,
  fontWeight: 700,
})

export const category = style({
  fontSize: 13,
  fontWeight: 500,
  opacity: 0.7,
})

export const measures = style({
  display: 'flex',
  gap: 18,
  marginTop: 6,
  fontSize: 14,
  opacity: 0.85,
})

export const measureValue = style({
  marginLeft: 6,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 700,
})

export const entry = style({
  clear: 'both',
  marginTop: 12,
  paddingTop: 10,
  borderTop: `1px solid ${vars.panel.border}`,
  fontSize: 15,
  lineHeight: 1.62,
  whiteSpace: 'pre-line',
})

/**
 * 도감 그림.
 *
 * ⚠️ **잡은 종만 뜬다.** 본 것만으로 그림까지 주면 도감을 채우는 뜻이 없어진다 —
 * 원작도 설명문을 잡은 뒤에야 연다. 오른쪽 위에 크게 띄운다: 이 화면의 주인공은
 * 목록이 아니라 지금 고른 한 마리다
 */
export const art = style({
  float: 'right',
  width: 112,
  height: 112,
  marginLeft: 12,
  marginBottom: 6,
  imageRendering: 'pixelated',
  objectFit: 'contain',
  filter: 'drop-shadow(0 5px 9px rgba(0, 0, 0, 0.55))',
})
