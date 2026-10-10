// 종이 한 장 — 모험노트 · 메일(편지지 그림이 없을 때) · 낱말 종이의 바탕.
//
// 종이색 바탕 · 왼쪽 빨간 여백선 · 줄지 · 철한 구멍이 공책을 만든다. 색은 `paper.*` 토큰뿐이고 새 토큰이 없다.
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, RADIUS } from '../theme/scale'

/** 줄지 간격. 줄지와 글줄이 **같은 값**을 써야 글이 줄 위에 앉는다 (모험노트 · 편지가 이 값으로 줄을 세운다) */
export const PAPER_ROW = 36

export const paper = style({
  position: 'relative',
  boxSizing: 'border-box',
  background: `linear-gradient(180deg, ${vars.paper.face} 0%, ${vars.paper.faceDim} 100%)`,
  color: vars.paper.text,
  border: `${String(EDGE.bar)}px solid ${vars.paper.edge}`,
  borderRadius: RADIUS.cell,
  // 줄지 · 여백선의 위치는 쓰는 쪽이 변수로 준다
  vars: { '--paper-top': '40px', '--paper-margin': '64px' },
})

export const lined = style({})
globalStyle(`${lined}::before`, {
  content: '""',
  position: 'absolute',
  inset: 0,
  borderRadius: RADIUS.cell,
  background:
    `repeating-linear-gradient(transparent 0 ${String(PAPER_ROW - 1)}px,`
    + ` ${vars.paper.rule} ${String(PAPER_ROW - 1)}px ${String(PAPER_ROW)}px)`,
  backgroundPosition: `0 var(--paper-top)`,
  pointerEvents: 'none',
})

export const margined = style({})
globalStyle(`${margined}::after`, {
  content: '""',
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 'var(--paper-margin)',
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
  justifyContent: 'space-around',
  alignItems: 'center',
  pointerEvents: 'none',
})

export const ring = style({
  width: 13,
  height: 13,
  borderRadius: RADIUS.round,
  background: vars.paper.textDim,
})

/** 줄지 · 여백선 위에 오는 내용 */
export const layer = style({ position: 'relative', zIndex: 1 })

/** 안쪽 좌표로 얹는 쓰임(편지) — 내용이 종이 안쪽 전체를 기준으로 선다 */
export const layerFill = style({ position: 'absolute', inset: 0, zIndex: 1 })
