// 모험노트 — 창 얼굴 위에 종이 한 장.
//
// 판을 더 깔지 않는다 (L2 예외 「물건으로 그린 판: 종이」). 종이의 줄지 · 여백선 · 구멍은 `PaperSheet`가 그리고,
// 여기는 종이 안의 줄과 오른쪽 가장자리의 날짜 책갈피만 안다. 줄 간격 36 · 구멍 지름 13 같은 값은 지역 상수다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT, TIME } from '../theme/scale'
import { PAPER_ROW } from './paperSheet.css'

/** 종이 폭. 책갈피가 오른쪽에 서도 창(928)에 든다 */
const PAPER_W = 700
/** 발자국 줄이 앉는 왼쪽 자리 — 줄 글에서 이만큼 안쪽이다 */
const TRAIL_X = 22

export const body = style({
  flex: '1 1 auto',
  minHeight: 0,
  position: 'relative',
  display: 'flex',
  justifyContent: 'center',
  padding: `${String(GAP.base)}px ${String(GAP.wide)}px`,
})

const turn = keyframes({
  from: { opacity: 0, transform: 'translateX(var(--turn, 8px))' },
  to: { opacity: 1, transform: 'none' },
})
const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/** 종이. 바탕은 `PaperSheet`이고 여기는 크기와 쪽 넘김 움직임이다 */
export const paper = style({
  width: PAPER_W,
  alignSelf: 'stretch',
  padding: '22px 36px 24px 88px',
  animation: `${turn} ${TIME.page} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: `${fade} ${TIME.page} ease-out` } },
})

export const dateRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.base,
  height: PAPER_ROW,
})

export const date = style({ fontSize: TEXT.big, fontWeight: 700, color: vars.paper.text })

export const weekday = style({ fontSize: TEXT.base, fontWeight: 700, color: vars.paper.textDim })

/** 「…에서 시작!」 — 원작도 이 한 줄만 머리글과 본문 사이에 둔다 */
export const from = style({
  margin: 0,
  height: PAPER_ROW,
  lineHeight: `${String(PAPER_ROW)}px`,
  fontSize: TEXT.list,
  fontWeight: 700,
})

export const trail = style({
  position: 'relative',
  listStyle: 'none',
  margin: `0 0 0 ${String(TRAIL_X)}px`,
  padding: 0,
})

/** 장소 일 묶음 — 세로선이 점들을 잇는다 */
export const place = style({
  '::before': {
    content: '""',
    position: 'absolute',
    left: -17,
    top: PAPER_ROW / 2,
    bottom: PAPER_ROW / 2,
    width: EDGE.bar,
    background: vars.paper.gilt,
    opacity: 0.5,
  },
})

export const line = style({
  position: 'relative',
  height: PAPER_ROW,
  lineHeight: `${String(PAPER_ROW)}px`,
  fontSize: TEXT.list,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

/** 장소 일 앞의 금 점 (속이 빈 원) */
export const dot = style({
  '::before': {
    content: '""',
    position: 'absolute',
    left: -22,
    top: 13,
    width: 10,
    height: 10,
    boxSizing: 'border-box',
    borderRadius: RADIUS.round,
    background: vars.paper.face,
    border: `${String(EDGE.bar)}px solid ${vars.paper.gilt}`,
  },
})

/** 장소 일과 포켓몬 · 트레이너 일 사이 */
export const gap = style({ height: PAPER_ROW / 2 })

export const blank = style({
  margin: 0,
  paddingTop: PAPER_ROW * 3,
  textAlign: 'center',
  fontSize: TEXT.base,
  color: vars.paper.textDim,
})

/** 날짜 책갈피 — 존재하는 쪽만 종이 오른쪽에 세로로 선다. 읽기 전용(`aria-hidden`) */
export const tabs = style({
  position: 'absolute',
  right: GAP.wide + 6,
  top: 40,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
})

const tabBase = {
  boxSizing: 'border-box',
  height: PAPER_ROW,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `0 ${String(GAP.small)}px`,
  fontSize: TEXT.small,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  background: vars.window.faceTop,
  color: vars.ink.dim,
  border: `${String(EDGE.bar)}px solid ${vars.window.edgeDim}`,
  borderLeft: 'none',
  borderRadius: `0 ${String(RADIUS.cell)}px ${String(RADIUS.cell)}px 0`,
} as const

/** 롬 날짜 「8월 13일」은 「8/13」보다 길다 — 폭 96, 고른 것은 조금 더 길다 */
export const tab = style({ ...tabBase, width: 96 })
export const tabOn = style({
  ...tabBase,
  width: 104,
  background: vars.pick.face,
  borderColor: vars.pick.edge,
  color: vars.pick.text,
})
