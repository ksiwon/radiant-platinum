// 낱말 고르기 틀 — 종이 | 무리 | 낱말 세 칸 (`EasyChatFrame`).
//
// 판을 칸마다 깔지 않는다. 가르는 것은 칸 사이의 세로선 하나다. 낱말 목록은 스크롤 목록이라 고른 줄이 즉시 옮겨 가고
// (§0 L5) 위치는 `ScrollKnob`이 보인다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT } from '../theme/scale'
import { RULE, caret as windowCaret, row as windowRow, rowDim, rowOn } from '../theme/window.css'

export const body = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'var(--sheet-w) 148px minmax(0, 1fr)',
  columnGap: GAP.base,
  padding: `${String(GAP.base)}px ${String(GAP.wide)}px`,
  // 뜨는 창(예/아니오)이 이 칸 기준으로 앉는다
  position: 'relative',
})

/** 종이 칸 — 위쪽에 서고 아래에 단추 줄 같은 것이 붙는다 */
export const sheetCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  alignSelf: 'start',
  minWidth: 0,
})

export const col = style({
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
})

/** 칸 머리 — 「무리」 · 「단어」와 오른쪽 위치 글 */
export const colHead = style({
  flex: '0 0 auto',
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `0 ${String(GAP.small)}px`,
  marginBottom: GAP.tight,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.ink.faint,
  borderBottom: RULE,
  fontVariantNumeric: 'tabular-nums',
})

export const list = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  margin: 0,
  padding: 0,
  listStyle: 'none',
})

/** 낱말 목록의 스크롤 칸. 브라우저 스크롤막대는 숨기고 `ScrollKnob`이 위치를 보인다 */
export const scroller = style({
  position: 'absolute',
  inset: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarWidth: 'none',
  selectors: { '&::-webkit-scrollbar': { display: 'none' } },
})

export const row = style([windowRow, { display: 'flex', alignItems: 'center', gap: GAP.small }])
export const rowPicked = style([rowOn, { display: 'flex', alignItems: 'center', gap: GAP.small }])
/** 포커스가 다른 칸에 있어도 지금 무리에 남는 옅은 띠 — 테두리 · 커서가 없다 */
export const rowKept = style([windowRow, {
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  background: vars.pick.face,
}])
export const rowOff = style([rowDim, { display: 'flex', alignItems: 'center', gap: GAP.small }])

export const caret = style([windowCaret, { left: GAP.small }])

export const label = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 무리 이름 옆 개수 */
export const count = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 목록 끝 6px 페이드 — 더 있다는 표시 */
export const fadeEnd = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 6,
  pointerEvents: 'none',
  background: `linear-gradient(180deg, transparent, ${vars.window.faceBottom})`,
})

/** 낱말 칸 왼쪽의 세로선 */
export const wordsCol = style({
  paddingLeft: GAP.base,
  borderLeft: RULE,
})

/** 줄 높이는 창의 목록 줄과 같아야 커서가 안 흔들린다 */
export const ROW_H = LINE.row

/** 종이 아래 줄(결정 · 그만둔다) — 격자라 띠가 안 미끄러지고 칸의 테두리가 바뀐다 */
export const doGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: GAP.small,
})

export const doCell = style({
  boxSizing: 'border-box',
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: TEXT.list,
  fontWeight: 700,
  borderRadius: RADIUS.cell,
  border: `${String(EDGE.bar)}px solid ${vars.window.edgeDim}`,
  background: vars.window.faceTop,
  color: vars.ink.normal,
})

export const doCellOn = style({
  background: vars.pick.face,
  borderColor: vars.pick.edge,
  boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}`,
  color: vars.pick.text,
})

/** 예/아니오 뜨는 창의 자리 — 결정 칸 옆. 위치는 `anchor`가 정한다 */
export const askSlot = style({ position: 'relative' })

/** 예/아니오 위의 물음 — 롬 글 */
export const askText = style({
  padding: `0 ${String(GAP.small)}px ${String(GAP.small)}px`,
  fontSize: 15,
  fontWeight: 700,
  color: vars.ink.strong,
  borderBottom: RULE,
  marginBottom: GAP.tight,
})

/** 묻는 화면의 작은 종이 — 철한 구멍 셋, 여백선은 구멍 오른쪽 */
export const sheet = style({
  width: '100%',
  boxSizing: 'border-box',
  padding: '20px 24px 16px 72px',
})
