// 가이드맵 화면 (PARITY §5 · `applications/town_map`).
//
// ⚠️ **지도는 정수배로만 키운다.** 늘려서 그릴 때 보간을 켜면 도트가 뭉개져 도로가 흐려진다 — 원작은 픽셀 그대로다.
// 전체는 3배, Tab의 확대는 4배다 (`flyMap.ZOOM`). 2.2배 같은 소수 배율은 없다.
//
// 지도 그림 위의 것(표식 · 이름표 · 커서 · 구역 · 주인공)은 **영역 안 화면 px**로 컴포넌트가 인라인으로 앉힌다 (`flyMap`).
// 여기서는 모양만 적는다. 오른쪽 칸은 위에서 아래로 이름 → 설명 → 행동 줄 → 목록 → 지금 있는 곳이고,
// 목록이 남는 높이를 먹고 **바닥 안내 줄 밑으로 안 들어간다** (본문이 `minmax(0, 1fr)` 줄이라 목록이 줄어든다).
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { caret, KEYCAP, pickHalo, RULE } from '../theme/window.css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { scrollList } from '../common/parts.css'

/** 지도 칸 폭. 정수배 지도(3배 648)가 이 안에서 가운데로 잘린다 */
export const MAP_COLUMN = 598

// ── 본문 ────────────────────────────────────────────────────────────────────

/** 왼쪽 지도 · 오른쪽 칸. 줄 높이를 본문 높이로 못 박는다 — 오른쪽 칸이 그 안에서 줄어든다 */
export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `${String(MAP_COLUMN)}px minmax(0, 1fr)`,
  gridTemplateRows: 'minmax(0, 1fr)',
})

// ── 지도 ────────────────────────────────────────────────────────────────────

/** 바깥 여백(위 · 아래)과 그림이 오기 전 바탕은 바다색이다 (`map.sea`) */
export const viewport = style({
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  background: vars.map.sea,
})

/** 지도와 그 위의 것들이 함께 움직이는 좌표계. 이동(pan)은 연출일 뿐이다 */
export const pan = style({
  position: 'absolute',
  left: 0,
  top: 0,
  transition: `transform ${TIME.page} ease-out`,
  willChange: 'transform',
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

/** 그림. 크기 · 배경 위치는 컴포넌트가 준다 */
export const art = style({
  position: 'absolute',
  inset: 0,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 고른 칸이 속한 구역 — 이름 붙은 칸이 통째로 밝아진다 */
export const tint = style({ position: 'absolute', background: vars.pick.face })

/** 날 수 있는 곳 표식 — 크기는 모양이 정한다 */
const markBase = style({
  position: 'absolute',
  borderRadius: RADIUS.bar,
  boxShadow: `0 0 0 1px ${vars.bar.edge}`,
})

export const mark = styleVariants({
  town: [markBase, { background: vars.map.town }],
  city: [markBase, { background: vars.map.city }],
  /** 아직 안 가 본 곳. 원작도 잠긴 표식을 회색으로 둔다 */
  locked: [markBase, { background: vars.map.locked }],
})

/** 이름표 — 열린 곳에만 붙는다. 바깥 3px 외곽선이라 주황 길 위에서도 읽힌다 */
export const label = style({
  position: 'absolute',
  fontSize: TEXT.tiny,
  fontWeight: 700,
  lineHeight: '14px',
  color: vars.ink.strong,
  whiteSpace: 'nowrap',
  WebkitTextStroke: `3px ${vars.window.faceTop}`,
  paintOrder: 'stroke fill',
  pointerEvents: 'none',
})

/**
 * 커서 — 한 칸을 감싸는 금 고리(`pickHalo`)에 어두운 고리를 한 겹 더 두른다.
 *
 * ⚠️ 금 고리 하나로는 **안 보인다.** 지도가 주황·초록이라 같은 색조에 묻힌다 — 바깥에 어두운 선을 더 깔아 어디에나 뜨게 한다
 */
export const cursor = style([pickHalo, {
  position: 'absolute',
  borderRadius: RADIUS.bar,
  pointerEvents: 'none',
  transition: `left ${TIME.slide} ease-out, top ${TIME.slide} ease-out`,
  '::after': {
    content: '""',
    position: 'absolute',
    inset: `-${String(2 * EDGE.bar)}px`,
    border: `${String(EDGE.bar)}px solid ${vars.bar.edge}`,
    borderRadius: RADIUS.bar,
  },
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
}])

const ping = keyframes({
  '0%': { transform: 'scale(0.7)', opacity: 0.95 },
  '100%': { transform: 'scale(1.7)', opacity: 0 },
})

/** 주인공 표식 둘레의 파문 — 깜빡임 대신, 튀지 않는다. 움직임을 줄인 설정에서는 옅은 고리만 남는다 */
export const ring = style({
  position: 'absolute',
  borderRadius: RADIUS.round,
  border: `${String(EDGE.bar)}px solid ${vars.window.faceTop}`,
  pointerEvents: 'none',
  animation: `${ping} 1.6s ease-out infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.6 } },
})

/** 주인공 머리 그림(도트 2배). 크기와 자리는 인라인이다 */
export const me = style({ position: 'absolute', pointerEvents: 'none', imageRendering: 'pixelated' })

/** 머리 그림을 못 받았을 때의 자리 표식 — 지어낸 그림 대신 금 점이다 */
export const meDot = style({
  position: 'absolute',
  borderRadius: RADIUS.round,
  background: vars.pick.edge,
  border: `${String(EDGE.bar)}px solid ${vars.bar.edge}`,
  pointerEvents: 'none',
})

// ── 오른쪽 칸 ───────────────────────────────────────────────────────────────

export const side = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  borderLeft: RULE,
  padding: `${String(GAP.wide)}px ${String(GAP.wide)}px 0`,
})

export const name = style({
  flex: '0 0 auto',
  minHeight: 32,
  fontSize: TEXT.big,
  fontWeight: 700,
  lineHeight: 1.15,
  color: vars.ink.strong,
})

/** 이름 없는 칸 — 바다 · 산. 이름 자리에 「—」를 둔다 */
export const nameNone = style({ color: vars.ink.faint })

export const desc = style({
  flex: '0 0 auto',
  marginTop: GAP.small,
  // 롬 설명은 세 줄까지다 (16 / 1.62)
  minHeight: 78,
  fontSize: TEXT.base,
  lineHeight: 1.62,
  whiteSpace: 'pre-line',
  color: vars.ink.normal,
})

/** 행동 줄 — 날기 자리가 아닌 칸에서도 자리를 잡는다(아래가 안 흔들린다) */
export const act = style({
  flex: '0 0 auto',
  height: 44,
  marginTop: GAP.base,
  display: 'flex',
  alignItems: 'center',
})

/** 날 수 있다 — 이 화면에서 금 띠는 이것 하나다 */
export const go = style({
  boxSizing: 'border-box',
  width: '100%',
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: `0 ${String(GAP.base)}px`,
  borderRadius: RADIUS.cell,
  background: vars.pick.face,
  boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}`,
  color: vars.pick.text,
  fontSize: TEXT.list,
  fontWeight: 700,
})

export const keycap = style({ ...KEYCAP, fontFamily: 'inherit' })

/** 띠 없는 행동 줄 — 보기 전용의 「날 수 있는 곳」 · 닫힌 자리의 「아직 가 본 적이 없다」 */
export const note = styleVariants({
  open: { color: vars.ink.dim },
  locked: { color: vars.ink.faint },
})

export const noteLine = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  fontSize: TEXT.base,
})

/** 지도 표식과 같은 색 네모 — 목록의 범례이기도 하다 */
export const swatch = styleVariants({
  town: { background: vars.map.town },
  city: { background: vars.map.city },
  locked: { background: vars.map.locked },
})

const swatchBase = style({
  flex: '0 0 auto',
  width: 10,
  height: 10,
  borderRadius: RADIUS.bar,
  boxShadow: `0 0 0 1px ${vars.bar.edge}`,
})

export const dot = styleVariants({
  town: [swatchBase, swatch.town],
  city: [swatchBase, swatch.city],
  locked: [swatchBase, swatch.locked],
})

/** 목록 머리 — 글 + 남는 폭 실선. 숫자는 tabular다 */
export const listHead = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  margin: `${String(GAP.wide)}px 0 ${String(GAP.tight)}px`,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.ink.dim,
  '::after': { content: '""', flex: 1, height: 1, background: vars.window.rule },
})

export const listCount = style({ fontVariantNumeric: 'tabular-nums' })

/** 목록 칸 — 남는 높이를 먹고 넘치면 스크롤한다. 손잡이(`ScrollKnob`)의 기준이다 */
export const listBox = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
})

export const list = style([scrollList, {
  flex: '1 1 auto',
  minHeight: 0,
  paddingRight: GAP.base,
}])

/** 줄 — 32. 고른 줄은 굵은 글씨와 커서만이고 띠는 안 깐다(금 띠는 행동 줄 하나뿐이다) */
export const row = style({
  position: 'relative',
  boxSizing: 'border-box',
  flex: '0 0 auto',
  height: LINE.row,
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  padding: `0 ${String(GAP.small)}px 0 22px`,
  fontSize: TEXT.list,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
})

export const rowOn = style([row, { fontWeight: 700, color: vars.pick.text }])

export const rowCaret = caret

export const rowName = style({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })

/** 지금 서 있는 곳의 줄 끝 머리 그림(도트 1배) */
export const rowHere = style({ marginLeft: 'auto', flex: '0 0 auto', imageRendering: 'pixelated' })

/** 바닥 고정 — 위 실선 한 줄. 목록이 이 밑으로 안 들어간다 */
export const now = style({
  flex: '0 0 auto',
  height: 40,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  margin: `0 -${String(GAP.wide)}px`,
  padding: `0 ${String(GAP.wide)}px`,
  borderTop: RULE,
  fontSize: TEXT.small,
  color: vars.ink.dim,
})

export const nowIcon = style({ flex: '0 0 auto', imageRendering: 'pixelated' })

export const nowName = style({ fontSize: TEXT.base, fontWeight: 700, color: vars.ink.strong })
