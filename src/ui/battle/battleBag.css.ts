// 배틀 가방의 모양 (PLAN §7.8 · 설계서 `bag.md` §5)
//
// ⚠️ **창은 한 장이다.** 한때 주머니 탭 넷이 각각 창이고 목록 줄 여섯이 각각 창이고 오른쪽 상세가 또 창이어서
// 열한 장이 떠 있었다 — 「상자를 늘어놓은」 꼴이다. 지금은 창 한 장(`window`) 안에서 탭은 글 넷과 금 밑줄 하나,
// 줄은 장부 줄(이름 · 점선 · 개수), 상세는 가로선 아래 한 칸이다. 안 고른 줄에는 판이 없다 (`menuChrome` 규칙 ②).
//
// 왼쪽 352px은 배틀 무대가 `scrim.over`로 비친다 — 전에는 `scrim.deep`로 다 덮었다. 도구를 고르고 나면 **같은 덮개
// 위에서** 왼쪽에 파티 카드(`PartyCards`)가 서고 오른쪽 창은 위쪽이 고른 도구 한 줄로 접힌다.
//
// 덮개는 교체 화면(`switchScreen.css`)의 `sheet`를 더 안 빌린다 — 그 파일은 P4가 다시 그리므로 두 화면이 같은 덮개를
// 공유하면 한쪽이 바뀔 때 조용히 갈린다. 파티 카드(`PartyCards`)의 칸 모양은 그쪽 것 그대로 쓴다
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { PICKED, RULE, WINDOW } from '../theme/window.css'

/** 왼쪽에 무대를 비워 두는 폭 */
const LEFT = 352
/** 줄 높이. 원작 큰 단추 대신 키가 큰 줄이다 */
const ROW = 40
/** 탭 줄 높이 */
const TAB = 48

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
})

/** 무대 위에 통째로 덮는다. 왼쪽 352px은 비워 무대가 비친다 */
export const sheet = style({
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: `${String(LEFT - GAP.loose)}px minmax(0, 1fr)`,
  padding: GAP.loose,
  background: vars.scrim.over,
  zIndex: 3,
})

/** 대상 단에서 파티 카드가 서는 왼쪽 칸. 도구 단에서는 비워 둔다 */
export const left = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  paddingRight: GAP.base,
})

/** 창 한 장 — 탭 · 목록 · 쪽 · 상세 · 바닥이 세로로 선다 */
export const panel = style({
  ...WINDOW,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  animation: `${rise} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

// ── 주머니 넷 ────────────────────────────────────────────────────────────────
// 원작 배틀 가방은 **넷**이다 (`enum BattlePocketIndex`): 회복 · 상태 · 볼 · 배틀용. PP 도구는 따로 있는 게
// 아니라 회복 칸에 같이 들어간다 — `sBattlePocketIndexes`가 PP 비트를 `RECOVER_HP_PP`로 보낸다
//
// 탭은 판이 아니라 글 넷을 같은 폭으로 나눈 것이다. 고른 탭 밑에 금 밑줄 3px이 미끄러진다

export const tabs = style({
  position: 'relative',
  flex: '0 0 auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  height: TAB,
  borderBottom: RULE,
})

const tabBase = style({
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: TEXT.list,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  selectors: { '&:focus-visible': { outline: `${String(EDGE.bar)}px solid ${vars.pick.edge}`, outlineOffset: -2 } },
})

export const tab = styleVariants({
  off: [tabBase, { color: vars.ink.dim, fontWeight: 600 }],
  on: [tabBase, { color: vars.ink.strong, fontWeight: 700 }],
})

/** 밑줄 하나. 탭 칸 폭(1/4)으로 `transform`만 미끄러진다 */
export const tabMark = style({
  position: 'absolute',
  left: 0,
  bottom: 0,
  width: '25%',
  height: 3,
  background: vars.pick.edge,
  pointerEvents: 'none',
  transition: `transform ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

// ── 도구 목록 ────────────────────────────────────────────────────────────────

export const list = style({
  flex: '0 0 auto',
  display: 'flex',
  flexDirection: 'column',
  padding: `${GAP.small}px ${GAP.base}px`,
  // 여섯 줄이 안 차도 쪽이 흔들리지 않게 높이를 못 박는다
  height: ROW * 6 + GAP.small * 2,
})

/** 고를 수 있는 한 줄. 판이 없고 글자가 늘어선다 — 고른 줄만 띠가 깔린다 */
export const row = style({
  position: 'relative',
  appearance: 'none',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  flex: '0 0 auto',
  width: '100%',
  height: ROW,
  padding: `0 ${GAP.base}px 0 ${GAP.loose - 2}px`,
  border: 'none',
  borderRadius: RADIUS.cell,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: TEXT.list,
  textAlign: 'left',
  cursor: 'pointer',
})

/** 고른 줄 — 금 띠와 안쪽 선. 줄을 옮기지 않는다 */
export const rowOn = style({
  background: PICKED.background,
  boxShadow: PICKED.boxShadow,
  color: PICKED.color,
  fontWeight: 700,
})

export const icon = style({ flex: '0 0 auto', imageRendering: 'pixelated', backgroundRepeat: 'no-repeat' })

export const label = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 이름과 개수 사이를 잇는 점선. 고른 줄 안에서는 `pick.trace`로 바뀐다 */
export const lead = style({
  flex: '1 1 auto',
  minWidth: GAP.base,
  alignSelf: 'center',
  borderBottom: `${String(EDGE.rule)}px dotted ${vars.window.rule}`,
  selectors: { [`${rowOn} &`]: { borderBottomColor: vars.pick.trace } },
})

export const count = style({
  flex: '0 0 auto',
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 커서 삼각형 — 금 띠 안에 있어서 글자색을 물려받는다 */
export const caretAt = style({
  position: 'absolute',
  left: GAP.small,
  top: '50%',
  width: 0,
  height: 0,
  borderLeft: '7px solid currentColor',
  borderTop: '5px solid transparent',
  borderBottom: '5px solid transparent',
  transform: 'translateY(-50%)',
})

/** 빈 갈래 — 글자 한 줄이 아니라 가운데에 흐리게 선다 */
export const empty = style({
  flex: '1 1 auto',
  display: 'grid',
  placeItems: 'center',
  fontSize: TEXT.small,
  color: vars.ink.faint,
})

/** 쪽 표시 줄 — 점은 쪽 수만큼, 지금 쪽만 금이다. 왼쪽에 마지막에 쓴 도구 */
export const pager = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  height: 24,
  padding: `0 ${GAP.wide}px`,
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

export const lastUsed = style({ marginRight: 'auto', color: vars.ink.faint })

export const dots = style({ display: 'inline-flex', gap: GAP.tight })
export const dot = styleVariants({
  off: { width: 6, height: 6, borderRadius: RADIUS.round, background: vars.pick.trace },
  on: { width: 6, height: 6, borderRadius: RADIUS.round, background: vars.pick.edge },
})

// ── 상세: 고른 도구 ──────────────────────────────────────────────────────────

/** 같은 창 안 가로선 아래. 위에 붙고 나머지는 비운다 */
export const detail = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  padding: `${GAP.base}px ${GAP.wide}px`,
  borderTop: RULE,
})

/** 아이콘 64(2×)와 그 밑 그늘 · 이름 · 상태 줄 */
export const hero = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.wide,
  minWidth: 0,
})

export const art = style({
  flex: '0 0 auto',
  width: 64,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: GAP.tight,
})

export const heroText = style({ display: 'flex', flexDirection: 'column', gap: GAP.tight, minWidth: 0, flex: '1 1 auto' })

export const heroHead = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.small,
  minWidth: 0,
})

export const heroName = style({
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const heroSub = style({
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 상태 줄 — 앞에 점 하나(8px)와 16px 글. 판이 아니다 */
export const state = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.normal,
})

export const stateDot = styleVariants({
  ok: { width: 8, height: 8, flex: '0 0 auto', borderRadius: RADIUS.round, background: vars.state.good },
  none: { width: 8, height: 8, flex: '0 0 auto', borderRadius: RADIUS.round, background: vars.hp.empty },
})

export const text = style({
  fontSize: TEXT.small,
  lineHeight: 1.6,
  whiteSpace: 'pre-line',
})

// ── 대상 단: 고른 도구 한 줄(잠김) ───────────────────────────────────────────

export const picked = style({
  flex: '0 0 auto',
  padding: `${GAP.small}px ${GAP.base}px`,
})

// ── 기술 칸 고르기 — PP에이드·PP회복만 여기까지 온다 ──────────────────────────

export const moves = style({ display: 'flex', flexDirection: 'column' })

/** 기술 한 줄 — 이름 ··· PP n/n 장부 줄. 가득 찬 칸은 흐리다 */
export const move = style({
  position: 'relative',
  appearance: 'none',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  width: '100%',
  height: LINE.row,
  padding: `0 ${GAP.base}px 0 ${GAP.loose - 2}px`,
  border: 'none',
  borderRadius: RADIUS.cell,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: TEXT.list,
  textAlign: 'left',
  cursor: 'pointer',
  selectors: { '&:disabled': { opacity: 0.42, cursor: 'default' } },
})

export const moveOn = style({
  background: PICKED.background,
  boxShadow: PICKED.boxShadow,
  color: PICKED.color,
  fontWeight: 700,
})

export const pp = style({
  marginLeft: 'auto',
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 바닥의 키 안내. 단마다 누를 것이 달라서 화면이 직접 적는다 */
export const foot = style({
  flex: '0 0 auto',
  marginTop: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  height: 28,
  padding: `0 ${GAP.wide}px`,
  borderTop: RULE,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})
