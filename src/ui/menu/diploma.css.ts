// 상장 — 벽에 거는 종이 한 장.
//
// ⚠️ **다른 메뉴의 어두운 판을 안 쓴다.** 그러면 「도감을 다 채웠습니다」
// 알림창이 되어 버리는데, 이건 받아서 거는 물건이다. 크림색 종이 · 두 겹
// 테두리 · 가운데 정렬 — 그 셋이 상장을 만든다.
import { keyframes, style } from '@vanilla-extract/css'
import { RADIUS } from '../theme/scale'
import { vars } from '../theme/contract.css'

const rise = keyframes({
  from: { opacity: 0, transform: 'scale(0.96) translateY(10px)' },
  to: { opacity: 1, transform: 'none' },
})

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  background: vars.scrim.deep,
})

export const paper = style({
  width: 'min(520px, calc(100vw - 80px))',
  padding: '34px 40px 26px',
  textAlign: 'center',
  color: vars.paper.text,
  background: `linear-gradient(180deg, ${vars.paper.face} 0%, ${vars.paper.faceDim} 100%)`,
  border: `3px double ${vars.paper.edge}`,
  borderRadius: RADIUS.bar,
  animation: `${rise} 0.24s cubic-bezier(.2,.85,.3,1)`,
})

export const crest = style({
  fontSize: 13,
  fontWeight: 800,
  color: vars.paper.gilt,
  marginBottom: 18,
})

export const body = style({
  margin: '0 0 22px',
  fontSize: 17,
  lineHeight: 1.9,
  whiteSpace: 'pre-line',
})

export const player = style({
  fontSize: 19,
  fontWeight: 800,
  paddingTop: 14,
  borderTop: `1px solid ${vars.paper.edge}`,
})

export const maker = style({
  marginTop: 14,
  fontSize: 12,
  color: vars.paper.textDim,
})

export const hint = style({
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.ink.onDarkDim,
})
