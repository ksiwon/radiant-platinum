// 배틀 교체 화면의 모양 (`.audit/menu-ui/switch.md` §4 · SYSTEM 4.17)
//
// 「출전 대기 줄」이다. 배틀 무대 위로 **가로 띠 하나**가 올라오고, 그 아래 **신상 창 하나**가 고른 마리의 속사정을
// 보이고, 맨 아래는 배틀의 글 창 자리 그대로 롬 문장을 띄운다. 창은 셋뿐이다 — 칸마다 창을 깔지 않는다(칸 사이는
// 세로 `RULE`뿐이다).
//
// 세로 자리 (창 960×640 기준 · SYSTEM 4.17 — 더블의 상대 판이 y24~196이라 단식과 한 배치다)
//   덮개  y200~  (y260에서 `scrim.deep`)    띠 창  y204~352    신상 창  y360~556    글 창  y564~628
//
// ⚠️ **창은 여기서 안 그린다** (DESIGN.md §3) — `WINDOW` · `BAR_*` · `STATUS_TAG`는 `theme/window`의 한 벌이다.
// 모양이 정해진 칸의 이름(`bar` · `fill` · `hint`)은 시험이 읽으므로 그대로 둔다.
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT, TIME } from '../theme/scale'
import { BAR_FILL, BAR_TRACK, PICKED, RULE, WINDOW } from '../theme/window.css'
import { BATTLE_LINE } from './battleScreen.css'

/** 좌우 여백과 세로 자리 */
const SIDE = 32
const RAIL_TOP = 204
/** 파티 띠의 높이. 배틀 가방 대상 단도 같은 띠를 놓아 이 값을 읽는다 */
export const RAIL_H = 148
const SHEET_TOP = 360
const SHEET_H = 196
const LINE_TOP = 564
const LINE_H = 64

/** 띠 창 안쪽 여백 — 금 띠와 칸 계산이 같은 값을 쓴다 */
const RAIL_PAD = 6
/** 띠의 칸 수. 파티가 적어도 여섯 자리가 늘 선다 */
export const RAIL_CELLS = 6

const rise = keyframes({
  from: { transform: 'translateY(16px)', opacity: 0 },
  to: { transform: 'translateY(0)', opacity: 1 },
})
const veil = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/**
 * 판 전체. 위 200px은 덮지 않는다 — 배틀 HUD의 상대 체력판이 그대로 보여야 교체를 정할 수 있다.
 * 덮개는 `scrim.over`에서 시작해 y260에서 `scrim.deep`이 된다
 */
export const sheet = style({
  position: 'absolute',
  inset: 0,
  zIndex: 3,
  background: `linear-gradient(180deg, transparent 0 ${String(RAIL_TOP - 4)}px, ${vars.scrim.over} ${String(RAIL_TOP - 4)}px,`
    + ` ${vars.scrim.deep} 260px, ${vars.scrim.deep} 100%)`,
  animation: `${veil} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 띠를 놓는 자리 (가방 대상 고르기는 제 자리에 따로 놓는다) */
export const railSlot = style({
  position: 'absolute',
  left: SIDE,
  right: SIDE,
  top: RAIL_TOP,
  height: RAIL_H,
  animation: `${rise} ${TIME.fade} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

// ── 띠 창 ─────────────────────────────────────────────────────────────────

/** 띠 창 — `WINDOW` 한 장. 칸 여섯은 창이 아니라 세로 `RULE`로만 가른다 */
export const rail = style({
  ...WINDOW,
  position: 'relative',
  boxSizing: 'border-box',
  width: '100%',
  height: RAIL_H,
  padding: RAIL_PAD,
  display: 'grid',
  gridTemplateColumns: `repeat(${String(RAIL_CELLS)}, minmax(0, 1fr))`,
})

/**
 * 고른 칸의 금 띠 하나 — 칸 사이를 미끄러진다. 칸마다 테두리를 켜고 끄지 않는다.
 * `--at`이 칸 번호이고 `left`가 `TIME.slide` 동안 옮겨 간다
 */
export const slide = style({
  ...PICKED,
  border: 'none',
  position: 'absolute',
  top: RAIL_PAD,
  bottom: RAIL_PAD,
  left: `calc(${String(RAIL_PAD)}px + (100% - ${String(RAIL_PAD * 2)}px) / ${String(RAIL_CELLS)} * var(--at, 0))`,
  width: `calc((100% - ${String(RAIL_PAD * 2)}px) / ${String(RAIL_CELLS)})`,
  borderRadius: RADIUS.cell,
  pointerEvents: 'none',
  transition: `left ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

/**
 * 위의 커서 삼각 (아래를 가리킨다). 칸 **밖**에 서야 튀어나와 보인다 — 배틀 명령 칸과 같은 이유다.
 * 가운데 맞춤은 칸 가운데에서 삼각 폭의 절반을 뺀 자리다
 */
export const caretDown = style({
  position: 'absolute',
  top: -14,
  left: `calc(${String(RAIL_PAD)}px + (100% - ${String(RAIL_PAD * 2)}px) / ${String(RAIL_CELLS)} * (var(--at, 0) + 0.5) - 8px)`,
  width: 0,
  height: 0,
  borderLeft: '8px solid transparent',
  borderRight: '8px solid transparent',
  borderTop: `10px solid ${vars.pick.edge}`,
  pointerEvents: 'none',
  transition: `left ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

/** 이번에 바꿀 자리 표시 (더블) — 그 칸 위에 작은 아래 화살표. 띠 창 바깥이라 어두운 판 위다 */
export const replacingMark = style({
  position: 'absolute',
  top: -16,
  width: 0,
  height: 0,
  borderLeft: '6px solid transparent',
  borderRight: '6px solid transparent',
  borderTop: `8px solid ${vars.ink.onDark}`,
  pointerEvents: 'none',
})

/** 파티 한 칸. 창이 아니라 글이 놓이는 자리다 */
export const card = style({
  appearance: 'none',
  position: 'relative',
  zIndex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '8px 10px 6px',
  border: 'none',
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    '&:disabled': { cursor: 'default' },
    // 칸 사이의 선 — 칸 위아래를 조금 비우고 왼쪽에만 긋는다
    '& + &::before': {
      content: '""', position: 'absolute', left: 0, top: 14, bottom: 14, borderLeft: RULE,
    },
  },
})

/** 고른 칸의 글자 — 금 띠 위라 `pick.text`다 */
export const cardOn = style({ color: vars.pick.text })

/** 못 내보내는 칸 (쓰러졌거나 이미 나와 있다) — 아이콘만 죽인다. 바탕은 창 그대로다 */
export const cardOut = style({})
export const iconOut = style({ filter: 'grayscale(1) brightness(0.8)' })

/** 빈 자리 — 여섯 자리 구조가 늘 보여서 띠가 줄었다 늘었다 하지 않는다. `button`이 아니다 */
export const socket = style({
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  selectors: {
    '&::before': {
      content: '""', position: 'absolute', left: 0, top: 14, bottom: 14, borderLeft: RULE,
    },
    '&:first-child::before': { display: 'none' },
  },
})
export const socketMark = style({
  width: 40,
  height: 40,
  boxSizing: 'border-box',
  borderRadius: RADIUS.round,
  border: `2px dashed ${vars.window.rule}`,
})

/** 나와 있는 마리 — 칸 왼쪽 위의 볼 점과 글 */
export const ball = style({
  position: 'absolute',
  left: 10,
  top: 10,
  width: 12,
  height: 12,
  boxSizing: 'border-box',
  borderRadius: RADIUS.round,
  border: `1px solid ${vars.ball.band}`,
  background: `linear-gradient(180deg, ${vars.ball.top} 0 42%, ${vars.ball.band} 42% 58%, ${vars.ball.bottom} 58%)`,
})
export const here = style({
  position: 'absolute',
  left: 26,
  top: 8,
  fontSize: 11,
  fontWeight: 700,
  color: vars.state.good,
})

/**
 * 포켓몬 아이콘 (`pokeIcon.monIconAt`) — 32 × 2 = 64. 크기와 위치는 인라인으로 온다 (정수배)
 */
export const icon = style({
  flex: '0 0 auto',
  alignSelf: 'center',
  marginTop: -4,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

export const nameRow = style({ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 })

export const name = style({
  fontSize: 16,
  fontWeight: 800,
  color: vars.ink.strong,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
export const nameOn = style({ color: vars.pick.text })

export const level = style({
  marginLeft: 'auto',
  fontSize: 12,
  fontWeight: 700,
  color: vars.ink.dim,
  flex: '0 0 auto',
})

/**
 * 막대의 홈. 짙은 테두리 안에 흰 바탕 — 원작 구조다 (DESIGN.md §1.3)
 *
 * ⚠️ **`display: block`이 있어야 막대다.** 칸 안이 `<button>` 속이라 홈도 채움도 `<span>`인데, 인라인 span은
 * 너비·높이를 안 받는다 — 한때 홈이 양쪽 테두리 2px씩만 남아 짙은 세로 막대기 하나로 보였고, 채움의 `width: N%`는
 * 통째로 안 먹었다. 높이는 배틀 체력판 `barTrack`처럼 테두리를 뺀 안쪽 높이다(content-box)
 */
export const bar = style({
  display: 'block',
  height: 8,
  ...BAR_TRACK,
})

export const fill = style({
  ...BAR_FILL,
  display: 'block',
  transition: 'width 180ms linear',
})

export const numbers = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
  minHeight: 16,
})
export const numbersOn = style({ color: vars.pick.text })
export const push = style({ marginLeft: 'auto', display: 'inline-flex' })

/**
 * 상대에게 얼마나 통하는가 (귀띔이지 판정이 아니다).
 *
 * 키는 `movePreview`의 `MoveMatch`와 같다 — 글도 그쪽 `MATCH_LABEL`을 쓴다. 기술 메뉴와 말끝이 갈리지 않게
 * 한 표에서 받는다
 */
const hintBase = { fontWeight: 800, fontSize: 11, flex: '0 0 auto' } as const

export const hint = styleVariants({
  super: { ...hintBase, color: vars.match.superEff },
  resisted: { ...hintBase, color: vars.match.resisted },
  immune: { ...hintBase, color: vars.match.immune },
})

/** 띠 칸 모서리의 상성 표시 자리 — 없어도 높이를 지켜 칸끼리 글줄이 안 어긋난다 */
export const cornerHint = style({ minHeight: 14, lineHeight: '14px' })

// ── 신상 창 ───────────────────────────────────────────────────────────────

/** 신상 창 — `WINDOW` 한 장, 세 열을 세로 `RULE`로 가른다 */
export const profile = style({
  ...WINDOW,
  position: 'absolute',
  left: SIDE,
  right: SIDE,
  top: SHEET_TOP,
  height: SHEET_H,
  boxSizing: 'border-box',
  padding: '8px 12px',
  display: 'grid',
  gridTemplateColumns: '192px minmax(0, 1fr) 224px',
  animation: `${rise} ${TIME.fade} ease-out 0.04s both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

export const col = style({
  minWidth: 0,
  minHeight: 0,
  padding: '0 14px',
  selectors: { '& + &': { borderLeft: RULE } },
})

/** 내용만 0.10초 크로스페이드 — 창은 안 움직인다 */
const crossfade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
export const fade = style({
  animation: `${crossfade} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

export const colA = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingLeft: 0,
})

/** 앞모습 — 80 × 2 = 160. 정수배라 도트 폭이 고르다 */
export const art = style({
  position: 'relative',
  width: 160,
  height: 160,
  flex: '0 0 auto',
  marginTop: -4,
  display: 'grid',
  placeItems: 'center',
})
export const artImg = style({ position: 'relative', width: 160, height: 160, imageRendering: 'pixelated' })
export const artGone = style({ filter: 'grayscale(1) brightness(0.85)' })
/** 바닥 타원 — `GroundShadow`가 그린다. 그림 뒤에 깔린다 */
export const plinth = style({ position: 'absolute', left: 30, bottom: 2 })

export const who = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'center',
  gap: 6,
  maxWidth: '100%',
  fontSize: 18,
  fontWeight: 800,
  color: vars.ink.strong,
})
export const whoName = style({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
export const whoLevel = style({ fontSize: 12, fontWeight: 700, color: vars.ink.dim, fontVariantNumeric: 'tabular-nums' })
export const chips = style({ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 })

/** B열 맨 위의 탭 줄 */
export const tabsRow = style({ height: 26, display: 'flex', alignItems: 'flex-start' })

// ── 기술 쪽 ──

/** 이름표 한 줄과 기술 줄이 같은 칸 나눔을 쓴다 */
const MOVE_COLS = '44px minmax(0, 1fr) 34px 36px 36px 92px 46px'
export const moveHead = style({
  display: 'grid',
  gridTemplateColumns: MOVE_COLS,
  columnGap: 6,
  alignItems: 'end',
  height: 14,
  fontSize: 11,
  color: vars.ink.faint,
})

/** 줄 — 상자 없이 줄 사이 `RULE`만. 기술 설명을 보는 줄(Q/E)은 금 띠다 */
export const move = style({
  position: 'relative',
  height: 34,
  boxSizing: 'border-box',
  display: 'grid',
  gridTemplateColumns: MOVE_COLS,
  columnGap: 6,
  alignItems: 'center',
  borderTop: RULE,
  fontSize: 12,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})
export const moveOn = style({ ...PICKED, border: 'none', borderRadius: RADIUS.cell })
export const moveName = style({
  fontSize: 16,
  fontWeight: 700,
  color: vars.ink.strong,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
export const num = style({ textAlign: 'right' })
export const pp = style({ textAlign: 'right', color: vars.ink.normal, fontWeight: 700 })
/** 상성 표시 칸. 더블에서 둘이 갈리면 두 줄로 쌓는다 */
export const moveMatch = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  minWidth: 0,
  lineHeight: 1.15,
})
export const matchSplit = style({
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 10,
})
/** 비어 있는 기술 칸 — 롬의 「---」 한 줄이다 */
export const moveBlank = style({ color: vars.ink.faint, gridColumn: '2 / -1' })

// ── 능력치 쪽 ──

export const stats = style({ display: 'grid', gridTemplateColumns: '1fr auto', fontSize: 14 })
export const statKey = style({ height: 25, display: 'flex', alignItems: 'center', borderTop: RULE, color: vars.ink.dim })
export const statValue = style({
  height: 25,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  borderTop: RULE,
  fontWeight: 800,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})
export const expRow = style({
  marginTop: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: vars.ink.dim,
})
export const expNumber = style({ fontWeight: 800, color: vars.ink.strong, fontVariantNumeric: 'tabular-nums' })
export const expBar = style({ display: 'block', flex: 1, height: 6, ...BAR_TRACK })

// ── C열 ──

export const hpBig = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
  color: vars.ink.dim,
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
})
export const hpLabel = style({ fontSize: 12, fontWeight: 800, marginRight: 4 })
export const hpNow = style({ fontSize: 28, fontWeight: 800, lineHeight: 1, color: vars.ink.strong })
export const hpTrack = style({ display: 'block', margin: '6px 0 8px' })

export const block = style({ borderTop: RULE, padding: '6px 0 4px' })
export const blockHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 14,
  fontWeight: 800,
  color: vars.ink.strong,
})
export const blockLabel = style({ fontSize: 11, color: vars.ink.faint, fontWeight: 600 })
export const blockText = style({
  margin: '2px 0 0',
  fontSize: 12,
  lineHeight: 1.45,
  color: vars.ink.dim,
  whiteSpace: 'pre-line',
})
/** 도구 줄 — 아이콘 32 (정수 1배) + 이름. 줄 높이를 아이콘이 못 키운다 */
export const itemRow = style({ display: 'flex', alignItems: 'center', gap: 8, height: 24 })
export const itemIcon = style({
  flex: '0 0 auto',
  margin: '-4px 0',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

// ── 글 창 ─────────────────────────────────────────────────────────────────

/** 글 창 — 배틀 `log`와 같은 자리 · 같은 재질 · 같은 글자(`BATTLE_LINE`) */
export const line = style({
  ...WINDOW,
  position: 'absolute',
  left: SIDE,
  right: SIDE,
  top: LINE_TOP,
  height: LINE_H,
  boxSizing: 'border-box',
  padding: '0 20px 0 24px',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.loose,
})
export const say = style({ ...BATTLE_LINE, flex: 1, minWidth: 0 })
/** 두 줄 문장 — 창에 맞춰 한 단 줄인다 */
export const sayTwo = style({ fontSize: TEXT.base, lineHeight: 1.3 })
export const keys = style({ fontSize: 14, color: vars.ink.dim, whiteSpace: 'nowrap' })

export const empty = style({
  position: 'absolute',
  left: SIDE,
  right: SIDE,
  top: SHEET_TOP,
  height: SHEET_H,
  display: 'grid',
  placeItems: 'center',
  ...WINDOW,
  fontSize: TEXT.small,
  color: vars.ink.faint,
})
