// 확인 지점 화면 — 메뉴 껍데기를 그대로 쓰고 여기서는 차이만 적는다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 시험용이라는 표시. 게임 화면과 헷갈리면 안 된다 */
export const badge = style({
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.08em',
  padding: '3px 10px',
  borderRadius: 999,
  background: '#f0b429',
  color: '#241a02',
})

export const rowNote = style({
  marginLeft: 'auto',
  fontSize: 13,
  opacity: 0.7,
  fontVariantNumeric: 'tabular-nums',
})

/** 오른쪽 칸 아래에 붙는 조건 목록 */
export const setup = style({
  marginTop: 18,
  paddingTop: 14,
  borderTop: `1px solid ${vars.panel.border}`,
  fontSize: 15,
  lineHeight: '24px',
  opacity: 0.9,
})

export const setupKey = style({
  display: 'inline-block',
  minWidth: 68,
  opacity: 0.65,
})
