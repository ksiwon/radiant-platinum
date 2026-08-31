// 모험노트 — 종이 한 장.
//
// ⚠️ **다른 메뉴의 상자를 안 쓴다.** 이 화면은 고르는 목록이 아니라 주인공이
// 적어 둔 종이라, 어두운 판에 흰 글을 얹으면 그 자리에서 「설정 화면」이 된다.
// 종이색 바탕 · 왼쪽 빨간 여백선 · 줄지 · 철한 구멍 넷이 공책을 만든다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { RADIUS, TIME } from '../theme/scale'
import { vars } from '../theme/contract.css'

/** 줄 간격. 줄지와 글줄이 **같은 값**을 써야 글이 줄 위에 앉는다 */
const ROW = 30
/** 왼쪽 여백선 자리. 철한 구멍과 글 사이 */
const MARGIN = 64

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(10px) rotate(-0.4deg)' },
  to: { opacity: 1, transform: 'none' },
})

export const paper = style({
  position: 'relative',
  margin: 'auto',
  width: 'min(620px, calc(100vw - 72px))',
  minHeight: 360,
  padding: `26px 30px 30px ${String(MARGIN + 18)}px`,
  // 아주 옅게 누런 종이. 가운데가 밝고 가장자리가 죽는다
  background: `linear-gradient(180deg, ${vars.paper.face} 0%, ${vars.paper.faceDim} 100%)`,
  color: vars.paper.text,
  border: `2px solid ${vars.paper.edge}`,
  borderRadius: RADIUS.cell,
  animation: `${rise} ${TIME.fade} ease-out`,
})

/** 줄지와 여백선. 종이 위에 한 겹으로 깐다 */
globalStyle(`${paper}::before`, {
  content: '""',
  position: 'absolute',
  inset: 0,
  borderRadius: RADIUS.cell,
  background:
    `repeating-linear-gradient(transparent 0 ${String(ROW - 1)}px,`
    + ` ${vars.paper.rule} ${String(ROW - 1)}px ${String(ROW)}px)`,
  backgroundPosition: `0 ${String(ROW + 26)}px`,
  pointerEvents: 'none',
})

globalStyle(`${paper}::after`, {
  content: '""',
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: MARGIN,
  width: 1,
  background: vars.state.bad,
  pointerEvents: 'none',
})

/** 철한 구멍. 왼쪽 여백에 세로로 늘어선다 */
export const rings = style({
  position: 'absolute',
  top: 22,
  bottom: 22,
  left: 22,
  width: 20,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  alignItems: 'center',
})

export const ring = style({
  width: 13,
  height: 13,
  borderRadius: RADIUS.round,
  background: vars.paper.textDim,
})

export const sheet = style({
  position: 'relative',
  zIndex: 1,
})

export const dateRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  height: ROW,
})

export const date = style({
  fontSize: 24,
  fontWeight: 800,
  color: vars.paper.text,
})

export const weekday = style({
  fontSize: 16,
  fontWeight: 700,
  color: vars.paper.textDim,
})

/** 「…에서 시작!」 — 원작도 이 한 줄만 머리글과 본문 사이에 둔다 */
export const from = style({
  margin: 0,
  height: ROW,
  lineHeight: `${String(ROW)}px`,
  fontSize: 17,
  fontWeight: 700,
  color: vars.paper.text,
})

export const lines = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
})

export const line = style({
  height: ROW,
  lineHeight: `${String(ROW)}px`,
  fontSize: 16,
  color: vars.paper.text,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

export const blank = style({
  position: 'relative',
  zIndex: 1,
  margin: 0,
  paddingTop: ROW * 3,
  textAlign: 'center',
  fontFamily: vars.font.ui,
  fontSize: 16,
  color: vars.paper.textDim,
})
