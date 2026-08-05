import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const wrap = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 24,
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  zIndex: 10,
})

export const title = style({
  fontSize: 42,
  fontWeight: 700,
  letterSpacing: 2,
  textShadow: '0 2px 12px rgba(0,0,0,0.6)',
})

export const button = style({
  padding: '12px 48px',
  fontSize: 18,
  fontFamily: vars.font.ui,
  color: vars.panel.text,
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 8,
  cursor: 'pointer',
  ':hover': { borderColor: vars.hud.accent },
})

export const hint = style({
  fontSize: 13,
  opacity: 0.7,
})

/** 시험용 손잡이. 진짜 메뉴와 헷갈리면 안 되므로 작고 흐리게 둔다 */
export const devButton = style({
  padding: '6px 18px',
  fontSize: 12,
  fontFamily: vars.font.ui,
  color: vars.panel.text,
  background: 'transparent',
  border: `1px dashed ${vars.panel.border}`,
  borderRadius: 6,
  opacity: 0.55,
  cursor: 'pointer',
  ':hover': { opacity: 1 },
})

/** 리포트 요약. 원작 메인 메뉴도 이 넷을 보여준다 */
export const summary = style({
  display: 'grid',
  gridTemplateColumns: 'auto auto',
  columnGap: 32,
  rowGap: 6,
  margin: 0,
  padding: '14px 24px',
  fontSize: 15,
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 10,
})

globalStyle(`${summary} dt`, { opacity: 0.65 })
globalStyle(`${summary} dd`, {
  margin: 0,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
})
