// 배틀팩토리 — 빌린 여섯을 고르는 판과 바꾸는 판 (`facilities` 설계 §4.1).
//
// ⚠️ **원작은 두 화면이다** — 위 화면에 여섯이 늘어서고 아래 화면이 그 하나의 값을 보여 준다. 한 화면에서는 그 배치가
// 성립하지 않으므로 **왼쪽 목록 · 오른쪽 상세**로 옮긴다 (PARITY §12.4). 왼쪽은 물음 · 목록 · 고른 순서 판, 가르는 것은
// 판이 아니라 세로선 하나다.
//
// 줄마다 테두리 판을 깔지 않는다 — 고른 줄은 금 띠 하나(`pickBand`)가 90ms로 미끄러진다 (L5). 고른 순서만 줄 끝의 키캡 모양
// 숫자로 남는다.
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, LINE, TEXT } from '../theme/scale'
import { KEYCAP, RULE } from '../theme/window.css'

/** 왼쪽 열의 폭 — 물음 두 줄 · 여섯 줄 목록 · 고른 순서 판이 든다 */
const LEFT = 376

/** 고른 순서 판의 줄 높이 */
const TRAY_ROW = 40

export const board = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `minmax(0, ${String(LEFT)}px) minmax(0, 1fr)`,
})

/** 왼쪽 열 — 목록은 위, 고른 순서 판은 바닥에 붙는다 */
export const left = style({
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
})

/**
 * 물음 — 아래 대사창에서 **왼쪽 위 한 구획**으로 올렸다. 글은 롬 뱅크 364 그대로이고 두 줄까지다.
 * 물음 창과 선택지 창을 따로 `WINDOW`로 깔지 않는다 (L2)
 */
export const prompt = style({
  flex: '0 0 auto',
  boxSizing: 'border-box',
  minHeight: 72,
  display: 'flex',
  alignItems: 'center',
  padding: `${GAP.base}px ${GAP.wide}px`,
  borderBottom: RULE,
  fontSize: TEXT.list,
  fontWeight: 700,
  lineHeight: 1.4,
  whiteSpace: 'pre-line',
  color: vars.ink.strong,
})

/** 목록 칸 — 금 띠가 이 안에서 미끄러진다 */
export const rows = style({
  position: 'relative',
  flex: '0 0 auto',
  margin: `${GAP.small}px ${GAP.small}px 0`,
})

/**
 * 한 줄. 왼쪽 22px은 커서 자리라 띠가 앉아도 글자가 안 밀린다. 고른 줄의 글은 `pick.text`로 선다 —
 * 띠(`pickBand`)가 줄 **뒤**에 깔리므로 줄은 위층(`zIndex`)이다
 */
export const row = style({
  position: 'relative',
  zIndex: 1,
  boxSizing: 'border-box',
  height: LINE.rowTall,
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  padding: `0 ${GAP.small}px 0 22px`,
  fontSize: TEXT.list,
})
export const rowOn = style([row, { color: vars.pick.text, fontWeight: 700 }])

export const icon = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

export const monName = style({
  flex: '0 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 이름 **옆**, 같은 줄에 붙는 도구 이름 */
export const monSub = style({
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: TEXT.small,
  fontWeight: 400,
  opacity: 0.72,
})

/** 고른 순서 — 키캡 모양 숫자. 판이나 테두리를 줄에 따로 두르지 않는다 */
export const order = style({
  ...KEYCAP,
  marginLeft: 'auto',
  flex: '0 0 auto',
  borderColor: vars.state.good,
  color: vars.state.good,
  fontFamily: 'inherit',
})

/** 「중지」 · 「돌아간다」 줄 — 아이콘 자리를 비운다 */
export const tailText = style({ flex: '1 1 auto', marginLeft: 32 + GAP.small })

/**
 * 고른 순서 판 — 원작 위 화면의 이름 세 줄(`WINDOW_SELECTED_MON_NAME_1~3`)이다. 목록과 선 한 줄로 가른다.
 * 바꾸기에서는 이 자리가 **내 셋**이 된다
 */
export const tray = style({
  flex: '0 0 auto',
  padding: `${GAP.small}px ${GAP.small}px`,
  borderTop: RULE,
})

export const trayRow = style({
  boxSizing: 'border-box',
  height: TRAY_ROW,
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  padding: `0 ${GAP.small}px 0 ${GAP.small}px`,
  fontSize: TEXT.list,
  minWidth: 0,
})

export const trayNum = style({
  flex: '0 0 auto',
  width: 24,
  textAlign: 'center',
  fontSize: TEXT.small,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: vars.state.good,
})

/** 빈 자리 「—」 */
export const trayEmpty = style({ color: vars.ink.faint })

/** 바꾸기에서 보낼 줄 — `이름 → [후보 아이콘] 이름`. 커서가 후보를 옮기면 따라 바뀐다 */
export const trayArrow = style({ flex: '0 0 auto', color: vars.ink.dim })

// ─────────────────────────────────────────────────────────────────
// 오른쪽 상세 — 그림 · 이름 · 도구 · 특성 · 기술 · 능력치
// ─────────────────────────────────────────────────────────────────

export const detail = style({
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  padding: `${GAP.base}px ${GAP.wide}px`,
  borderLeft: RULE,
  scrollbarWidth: 'thin',
})

// `MonDetail`(공용)의 칸 사이를 조인다 — 그림 160 + 도구 설명 + 기술 넷 + 능력치가 한 화면에 들어야 한다
globalStyle(`${detail} > [data-mon-detail]`, { gap: GAP.small })

/** 자료가 오기 전 — 상세 칸 가운데에 롬 한 줄(뱅크 364의 「잠시 기다려 주십시오」) */
export const waiting = style({
  flex: '1 1 auto',
  display: 'grid',
  placeItems: 'center',
  fontSize: TEXT.base,
  color: vars.ink.dim,
})

/** 기술 칸 — 이름표 줄 + 기술 넷. 열 폭을 못 박아 이름표와 값이 같은 열에 선다 */
export const moves = style({
  display: 'grid',
  gap: 0,
  borderTop: RULE,
  paddingTop: GAP.tight,
})

const MOVE_COLS = `minmax(0, 1fr) repeat(3, 56px)`

export const moveHead = style({
  display: 'grid',
  gridTemplateColumns: MOVE_COLS,
  columnGap: GAP.base,
  padding: `0 ${GAP.small}px`,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})
export const moveHeadNum = style({ textAlign: 'right' })

globalStyle(`${moves} > div:not(${moveHead})`, { gridTemplateColumns: MOVE_COLS })

/** 능력치 — 2열 × 3행 막대 */
export const stats = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  columnGap: GAP.wide,
  borderTop: RULE,
  paddingTop: GAP.small,
})

/** 도구 아이콘 */
export const itemIcon = style({
  display: 'inline-block',
  verticalAlign: 'middle',
  marginRight: GAP.small,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})
