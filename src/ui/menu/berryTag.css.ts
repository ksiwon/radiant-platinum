// 나무열매 태그 — 가운데 창 760×500. 왼쪽이 가방 열매 주머니의 열매(큰 줄 44), 오른쪽이 고른 열매의 태그다.
//
// 맛 다섯은 **스파이더 그래프**다 (원작 `BerryTag_InitGraph`). 숫자만 늘어놓으면 어느 맛이 센지를 세어야 알고,
// 포핀을 만들 때 보는 것은 그 균형이다. 색은 토큰(`bar.exp`)뿐이다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, TEXT, TIME } from '../theme/scale'
import { RULE, row as windowRow, rowOn } from '../theme/window.css'

export const WIDTH = 760
/** 본문 높이 — 창 500에서 머리 44 · 바닥 28 · 테두리를 뺀 값 */
const BODY_H = 420
/** 열매 그림 — 64×64를 정수 2배로 */
export const ART = 128
/** 그래프 반지름(상한 값 40일 때). 꼭짓점 이름 · 값이 그 바깥에 선다 */
export const RADIUS_PX = 62
/** 그래프 상자 한 변 — 반지름에 이름 칸 여유 */
export const BOX = 232

export const body = style({
  height: BODY_H,
  display: 'grid',
  gridTemplateColumns: '224px minmax(0, 1fr)',
})

export const rail = style({
  padding: GAP.small,
  borderRight: RULE,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarWidth: 'thin',
})

const tall = {
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
  height: LINE.rowTall,
  paddingLeft: GAP.base + 2,
} as const
export const row = style([windowRow, tall])
export const rowPicked = style([rowOn, tall])

export const label = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 이름 바로 옆 개수 */
export const stock = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

export const main = style({
  minWidth: 0,
  padding: `${String(GAP.base + 2)}px ${String(GAP.loose)}px ${String(GAP.base)}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small + 2,
})

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/** 열매가 바뀌면 오른쪽 글이 새로 서며 페이드한다 (`key`) */
export const swap = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small + 2,
  minHeight: 0,
  animation: `${fadeIn} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

export const head = style({ display: 'flex', alignItems: 'baseline', gap: GAP.base })
export const no = style({ fontSize: TEXT.small, color: vars.ink.dim, fontVariantNumeric: 'tabular-nums' })
export const name = style({ fontSize: TEXT.big, fontWeight: 700, color: vars.ink.strong })

export const mid = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base,
  minHeight: BOX,
})

/** 열매 그림 칸 — 도트 정수 2배(128), 그림이 칸을 넘지 않는다 */
export const art = style({
  flex: '0 0 auto',
  width: ART,
  height: ART,
  overflow: 'hidden',
})

/** 그림이 안 구워졌을 때의 도구 아이콘 4배 — 같은 칸 안에 선다 */
export const artFallback = style({ display: 'grid', placeItems: 'center', width: ART, height: ART })

/** 왼쪽 묶음 — 그림 아래에 크기 · 경도 */
export const side = style({
  flex: '0 0 auto',
  width: 176,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: GAP.base,
})

export const facts = style({
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  gap: '6px 16px',
  margin: 0,
  fontSize: TEXT.base,
})
export const factLabel = style({ color: vars.ink.dim })
export const factValue = style({
  margin: 0,
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})

export const graph = style({ flex: '0 0 auto', width: BOX, height: BOX })

export const ring = style({ fill: 'none', stroke: vars.window.rule, strokeWidth: EDGE.rule })
export const spoke = style({ stroke: vars.window.rule, strokeWidth: EDGE.rule })
/** 채움 — 꼭짓점이 90ms 선형으로 옮겨 간다(원작이 네 틱에 걸쳐 보간한다). 값은 `d`로 온다 */
export const shape = style({
  fill: `color-mix(in srgb, ${vars.bar.expLit} 45%, transparent)`,
  stroke: vars.bar.exp,
  strokeWidth: EDGE.bar,
  strokeLinejoin: 'round',
  transition: `d ${TIME.slide} linear`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})
export const flavorName = style({
  fontSize: 13,
  fontWeight: 700,
  fill: vars.ink.dim,
})
export const flavorValue = style({
  fontSize: TEXT.small,
  fontWeight: 700,
  fill: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})

export const desc = style({
  margin: 0,
  paddingTop: GAP.small + 2,
  borderTop: RULE,
  fontSize: TEXT.base,
  lineHeight: 1.62,
  whiteSpace: 'pre-line',
  color: vars.ink.normal,
})

export const none = style({ margin: 0, fontSize: TEXT.base, color: vars.ink.dim })
