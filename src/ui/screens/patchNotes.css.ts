// 패치노트 — 덮는 창이되 내용 크기(880×560). 판마다 탭 하나, 본문은 왼쪽 「판의 얼굴」과 오른쪽 줄 목록이다.
//
// 줄마다 상자 딱지를 달지 않는다 — 갈래는 12px 글자 하나(36px 칸)다. 창의 틀(머리 · 바닥 · 단추)은 `appWindow.css`에서 온다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, TEXT } from '../theme/scale'
import { RULE } from '../theme/window.css'

export const WIDTH = 880
export const HEIGHT = 560

/** 탭 줄 */
export const tabs = style({
  flex: '0 0 auto',
  padding: `0 ${String(GAP.wide)}px`,
  borderBottom: RULE,
})

export const split = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '244px minmax(0, 1fr)',
})

/** 판의 얼굴 — 판 이름 · 날짜 · lead · 맨 아래 갈래별 건수 */
export const hero = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  padding: `${String(GAP.wide)}px ${String(GAP.wide)}px ${String(GAP.base)}px`,
  borderRight: RULE,
  minHeight: 0,
})

export const version = style({ margin: 0, fontSize: TEXT.big, fontWeight: 700, color: vars.ink.strong })
export const date = style({ fontSize: TEXT.small, color: vars.ink.dim, fontVariantNumeric: 'tabular-nums' })
export const lead = style({ margin: 0, fontSize: TEXT.small, lineHeight: 1.6, color: vars.ink.normal })

export const counts = style({
  marginTop: 'auto',
  paddingTop: GAP.base,
  borderTop: RULE,
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 오른쪽 목록 — 긴 판은 안에서 스크롤한다 (끝 6px 페이드) */
export const listBox = style({ position: 'relative', minHeight: 0 })

export const list = style({
  position: 'absolute',
  inset: 0,
  margin: 0,
  padding: `${String(GAP.base)}px ${String(GAP.wide)}px`,
  listStyle: 'none',
  overflowY: 'auto',
  scrollbarWidth: 'thin',
})

export const group = style({
  margin: `${String(GAP.base)}px 0 ${String(GAP.tight)}px`,
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.dim,
  selectors: { '&:first-child': { marginTop: 0 } },
})

export const item = style({
  display: 'grid',
  gridTemplateColumns: '36px minmax(0, 1fr)',
  alignItems: 'baseline',
  padding: `${String(GAP.tight)}px 0`,
  fontSize: TEXT.base,
  lineHeight: 1.62,
  color: vars.ink.normal,
})

export const kind = style({ fontSize: TEXT.tiny, fontWeight: 700, color: vars.ink.dim })

export const fadeEnd = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 6,
  pointerEvents: 'none',
  background: `linear-gradient(180deg, transparent, ${vars.window.faceBottom})`,
})
