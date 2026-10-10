// 기술 되살리기 — 왼쪽 무대(포켓몬 · 고른 기술) · 오른쪽 목록 · 아래 롬 글띠 (moves §4.4).
//
// 세로선으로 가르지 않는다: 왼쪽은 판이 아니라 포켓몬과 고른 기술이 크게 선 「무대」이고, 오른쪽은 줄 목록이다.
// 창 틀(머리 · 바닥 안내 · 글띠)은 `MenuScreen`이 쥔다. 여기 있는 것은 본문뿐이다.
// 9° 판은 배틀 명령 구역에만 있고 메뉴는 `MoveLine` 식의 줄이다 (4.9).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, LINE, RADIUS, TEXT } from '../theme/scale'
import { row, rowOn } from '../theme/window.css'

/** 목록이 한 번에 보이는 줄 수 (원작 `maxDisplay`) */
export const VISIBLE_ROWS = 7
/** 기술 줄 하나의 높이. 타입 그림 2배(32)가 서는 줄이다 */
const ROW = LINE.rowTall

/** 본문. 물음이 서면 예/아니오가 오른쪽 아래에 앉는다 */
export const body = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 436px',
  columnGap: GAP.loose,
  padding: `${GAP.base}px ${GAP.wide}px ${GAP.small}px`,
})

/** 예/아니오 — 글띠 위 오른쪽 */
export const yesNo = style({
  position: 'absolute',
  right: GAP.wide,
  bottom: GAP.small,
})

// ── 왼쪽 ────────────────────────────────────────────────────────────────────

export const stage = style({
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
})

/** 포켓몬 160 + 옆 글 */
export const mon = style({
  display: 'flex',
  gap: GAP.wide,
  alignItems: 'flex-start',
  flex: '0 0 auto',
})

export const portrait = style({
  position: 'relative',
  flex: '0 0 auto',
  width: 160,
  height: 160,
})

/** 80×80을 정수 2배로 — 도트가 뭉개지지 않는다 */
export const portraitArt = style({
  position: 'relative',
  display: 'block',
  width: 160,
  height: 160,
  imageRendering: 'pixelated',
})

export const monText = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  paddingTop: GAP.small,
  fontSize: TEXT.base,
  color: vars.ink.normal,
})

/** 지금 아는 기술을 한 줄 글로 — 타입색 점 + 이름, 「·」로 잇는다 */
export const known = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: GAP.small,
  rowGap: GAP.tight,
  color: vars.ink.dim,
  fontSize: TEXT.small,
})

export const knownItem = style({ display: 'inline-flex', alignItems: 'center', gap: GAP.tight })

export const knownDot = style({
  width: 8,
  height: 8,
  borderRadius: RADIUS.round,
  background: 'var(--type)',
  flex: '0 0 auto',
})

/** 고른 기술 — 타입 그림 + 이름 + 값 */
export const picked = style({
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  paddingTop: GAP.base,
  borderTop: `1px solid ${vars.window.rule}`,
})

export const pickedHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

// ── 오른쪽 ──────────────────────────────────────────────────────────────────

/** 목록 상자. `ScrollKnob`이 오른쪽 가장자리에 앉으므로 `relative`다 */
export const listBox = style({
  position: 'relative',
  minHeight: 0,
  height: VISIBLE_ROWS * ROW + (VISIBLE_ROWS - 1) * 2,
  overflow: 'hidden',
})

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  paddingRight: GAP.base,
})

/** 줄. 공용 `row`/`rowOn`의 높이만 이 목록 것으로 키운다 */
export const line = style([row, { height: ROW }])
export const lineOn = style([rowOn, { height: ROW }])

export const lineFace = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  height: '100%',
})

export const lineName = style({
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 줄 오른쪽 끝 — PP · 「그만둔다」 */
export const lineTail = style({
  flex: '0 0 auto',
  marginLeft: 'auto',
  fontVariantNumeric: 'tabular-nums',
  fontSize: TEXT.small,
})
