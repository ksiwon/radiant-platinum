// 기술 되살리기 — 오른쪽에 고른 기술의 값과 설명.
//
// 목록은 메뉴 공용 틀을 쓴다. 여기 있는 것은 오른쪽 칸뿐이다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const head = style({
  display: 'flex',
  gap: 16,
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
})

export const power = style({ opacity: 0.85, fontWeight: 600 })

export const desc = style({
  marginTop: 12,
  paddingTop: 10,
  borderTop: `1px solid ${vars.panel.border}`,
  fontSize: 15,
  lineHeight: 1.62,
  whiteSpace: 'pre-line',
})
