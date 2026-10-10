// 공용 부품들의 스타일 (SYSTEM §2.2). 부품 하나에 파일 하나씩 두지 않고 한 파일에 모은다 —
// 대부분 열 줄 안팎이고 같은 토큰을 읽는다. 크기가 큰 `ChoiceMenu` · `MonViewport`는 따로다.
//
// 값은 전부 `theme/`에서 온다. 여기서 색이나 숫자를 새로 정하지 않는다 (화면 파일의 규칙과 같다).
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME, frames } from '../theme/scale'
import {
  BAR_FILL, BAR_TRACK, KEYCAP, KEYCAP_DARK, RULE, STATUS_TAG,
} from '../theme/window.css'
import { DIALOG_ARROW, DIALOG_BOX, DIALOG_LINE } from '../field/messageBox.css'

// ─────────────────────────────────────────────────────────────────
// 딱지 · 키캡
// ─────────────────────────────────────────────────────────────────

/** 상태 이상 딱지. 색 셋은 쓰는 쪽(`StatusTag`)이 `STATUS_VARS`로 준다 */
export const statusTag = style(STATUS_TAG)

/** 키캡 하나. 글 속에 섞이므로 사이를 한 칸쯤 띄운다 */
export const keycap = style({ ...KEYCAP, fontFamily: 'inherit', margin: '0 2px' })
export const keycapDark = style({ ...KEYCAP, ...KEYCAP_DARK, fontFamily: 'inherit', margin: '0 2px' })

// ─────────────────────────────────────────────────────────────────
// 탭 — 글자 아래 금 밑줄 하나가 미끄러진다 (§0 L3)
// ─────────────────────────────────────────────────────────────────

export const tabList = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'stretch',
  gap: GAP.wide,
  minWidth: 0,
})

export const tab = style({
  appearance: 'none',
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.tight,
  height: 40,
  padding: `0 ${GAP.tight}px`,
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: TEXT.list,
  fontWeight: 600,
  color: vars.ink.dim,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: { '&:focus-visible': { outline: `${EDGE.bar}px solid ${vars.pick.edge}`, outlineOffset: -2 } },
})

export const tabOn = style({ color: vars.ink.strong, fontWeight: 700 })

/** 쪽 색 점. 색은 `--mark`로 온다 (`vars.page.*`). 탭 표식과 원 빛에만 쓴다 */
export const tabMark = style({
  width: 8,
  height: 8,
  borderRadius: RADIUS.round,
  background: 'var(--mark)',
  flex: '0 0 auto',
})

/**
 * 밑줄. 탭이 아니라 **목록 칸 안의 `aria-hidden` 요소 하나**이고 `transform`과 `width`로 미끄러진다.
 * 자리는 `PageTabs`가 고른 탭의 `offsetLeft` · `offsetWidth`로 인라인 변수에 준다
 */
export const tabBar = style({
  position: 'absolute',
  left: 0,
  bottom: 0,
  height: 3,
  width: 'var(--bar-w, 0px)',
  transform: 'translateX(var(--bar-x, 0px))',
  background: vars.pick.edge,
  pointerEvents: 'none',
  transition: `transform ${TIME.slide} ease-out, width ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

// ─────────────────────────────────────────────────────────────────
// 글 띠 · 대사창
// ─────────────────────────────────────────────────────────────────

/**
 * 창 **안** 아래의 롬 글 띠 (`MessageDock`) — Galmuri11 17 / 26, 세 줄까지, 넘치면 자란다.
 *
 * DOM에서는 **맨 끝**(foot 뒤)에 두고 보이는 자리는 `order`로 정한다 — party 하네스 계약
 * (`drive.mjs:3559`)이 그 순서를 읽는다. `MenuScreen`의 foot이 `order: 2`, 이 띠가 `order: 1`이다
 */
export const dock = style({
  order: 1,
  flex: '0 0 auto',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  minHeight: LINE.dock * 2 + GAP.small * 2,
  padding: `${GAP.small}px ${GAP.wide}px`,
  borderTop: RULE,
  fontFamily: vars.font.pixel,
  fontSize: TEXT.list,
  lineHeight: `${String(LINE.dock)}px`,
  color: vars.ink.strong,
})

export const dockText = style({
  flex: '1 1 auto',
  minWidth: 0,
  whiteSpace: 'pre-line',
  overflowWrap: 'anywhere',
})

export const dockIcon = style({ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' })
export const dockTrailing = style({ flex: '0 0 auto', marginLeft: 'auto' })

/** 필드 대사창과 같은 두 줄 창 (`MessageWindow`) — Galmuri11 19 / 30. 위치는 쓰는 쪽이 정한다 */
export const windowBox = style({ ...DIALOG_BOX, position: 'relative' })
export const windowLine = style({ ...DIALOG_LINE })
export const windowArrow = style({ ...DIALOG_ARROW })
export const windowSide = style({
  position: 'absolute',
  right: GAP.base,
  bottom: GAP.small,
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.small,
})

// ─────────────────────────────────────────────────────────────────
// 개수 · 값
// ─────────────────────────────────────────────────────────────────

const arrowBlink = keyframes({
  '0%': { borderColor: `transparent transparent ${vars.pick.edge}` },
  '50%': { borderColor: `transparent transparent ${vars.pick.trace}` },
})
const arrowBlinkDown = keyframes({
  '0%': { borderColor: `${vars.pick.edge} transparent transparent` },
  '50%': { borderColor: `${vars.pick.trace} transparent transparent` },
})

export const counter = style({
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: GAP.tight,
})

const countArrowBase = {
  width: 0,
  height: 0,
  borderStyle: 'solid',
  borderWidth: '0 7px 9px',
  borderColor: `transparent transparent ${vars.pick.edge}`,
} as const

/** 위 화살표 — 올릴 수 있을 때만 깜박이고, 끝에서는 꺼진 박자(`pick.trace`)로 선다 */
export const countUp = style({
  ...countArrowBase,
  animation: `${arrowBlink} ${TIME.blink} steps(1, end) infinite`,
})
export const countDown = style({
  ...countArrowBase,
  borderWidth: '9px 7px 0',
  borderColor: `${vars.pick.edge} transparent transparent`,
  animation: `${arrowBlinkDown} ${TIME.blink} steps(1, end) infinite`,
})
export const countOff = style({ animation: 'none', borderColor: `transparent transparent ${vars.pick.trace}` })
export const countOffDown = style({ animation: 'none', borderColor: `${vars.pick.trace} transparent transparent` })

export const countValue = style({
  fontSize: TEXT.big,
  fontWeight: 700,
  lineHeight: 1,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})

/** 값 줄 (`ValueStrip`). 칸 폭이 같아서 값이 열에 맞는다 */
export const valueStrip = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'stretch',
  height: LINE.row,
})

export const valueCell = style({
  appearance: 'none',
  flex: '0 0 auto',
  width: 160,
  boxSizing: 'border-box',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: TEXT.list,
  color: vars.ink.dim,
  textAlign: 'center',
  cursor: 'pointer',
})

export const valueCellOn = style({ color: vars.emphasis.one, fontWeight: 700 })

export const valueBar = style({
  position: 'absolute',
  left: 0,
  bottom: 0,
  height: 3,
  width: 160,
  transform: 'translateX(var(--bar-x, 0px))',
  background: vars.pick.edge,
  pointerEvents: 'none',
  transition: `transform ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

// ─────────────────────────────────────────────────────────────────
// 타입 · 분류 · 기술
// ─────────────────────────────────────────────────────────────────

/** 롬 타입 그림. 칸 크기와 배율은 `pixelSprite`가 인라인으로 준다 */
export const typeBadge = style({
  display: 'inline-block',
  flex: '0 0 auto',
  verticalAlign: 'middle',
  backgroundRepeat: 'no-repeat',
  imageRendering: 'pixelated',
})

/** 그림이 없을 때의 글자 조각 — `--tint`가 타입 색이다 */
export const typeChip = style({
  display: 'inline-block',
  flex: '0 0 auto',
  padding: '1px 6px',
  borderRadius: RADIUS.bar,
  background: `var(--tint, ${vars.window.edge})`,
  color: vars.ink.onTint,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  lineHeight: 1.3,
  whiteSpace: 'nowrap',
})

export const classBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.tight,
  flex: '0 0 auto',
  verticalAlign: 'middle',
})
export const classText = style({ fontSize: TEXT.small, color: vars.ink.normal })

/** 기술 사실 (`MoveFacts`). 이름표는 흐리고 값은 진하다. 값은 tabular다 */
export const facts = style({ display: 'grid', gap: GAP.tight, minWidth: 0 })
export const factsRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  columnGap: GAP.wide,
  rowGap: GAP.tight,
})
export const factsColumn = style({ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: GAP.base, rowGap: GAP.tight })
export const factPair = style({ display: 'inline-flex', alignItems: 'baseline', gap: GAP.tight })
export const factLabel = style({ fontSize: TEXT.small, color: vars.ink.dim })
export const factValue = style({
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})
export const factText = style({
  fontSize: TEXT.small,
  color: vars.ink.normal,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
})

/** 메뉴의 기술 한 줄 (`MoveLine`) */
export const moveLine = style({
  appearance: 'none',
  display: 'grid',
  gridTemplateColumns: `minmax(0, 1fr) repeat(var(--cols, 1), max-content)`,
  alignItems: 'center',
  columnGap: GAP.base,
  width: '100%',
  boxSizing: 'border-box',
  minHeight: LINE.row,
  padding: `0 ${GAP.small}px`,
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: TEXT.list,
  textAlign: 'left',
  color: 'inherit',
})
export const moveName = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  minWidth: 0,
})
export const moveNameText = style({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
export const moveNum = style({
  fontSize: TEXT.small,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  minWidth: 32,
})
export const moveEmpty = style({ color: vars.ink.faint })

// ─────────────────────────────────────────────────────────────────
// 포켓몬 이름줄 · 성별 · 이름표
// ─────────────────────────────────────────────────────────────────

export const identity = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: GAP.tight + 2,
  minWidth: 0,
  fontSize: TEXT.list,
  color: vars.ink.strong,
})
export const identityDark = style({ color: vars.ink.onDark })
export const identityBall = style({ alignSelf: 'center', flex: '0 0 auto', display: 'inline-flex' })
export const identityName = style({
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
export const identityLevel = style({
  fontSize: TEXT.small,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.dim,
  flex: '0 0 auto',
})
export const identityLevelDark = style({ color: vars.ink.onDarkDim })
export const shinyStar = style({ color: vars.pick.edge, fontSize: TEXT.small, flex: '0 0 auto' })

/**
 * ♂♀. **Galmuri11이다** — Pretendard 서브셋에 이 글자가 없다. 어두운 판 위에서는 성별 색 없이
 * `ink.onDark`로 찍는다 (`state.male`이 어두운 판 위에서 대비 3.87:1이다. SYSTEM §0)
 */
export const genderMark = style({
  fontFamily: vars.font.pixel,
  fontWeight: 700,
  lineHeight: 1,
  flex: '0 0 auto',
})
export const genderMale = style({ color: vars.state.male })
export const genderFemale = style({ color: vars.state.female })
export const genderOnDark = style({ color: vars.ink.onDark })

const platePop = keyframes({ from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' } })

/** 어두운 판 위의 이름표 (`NamePlate`) */
export const namePlate = style({
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: GAP.tight,
  color: vars.ink.onDark,
  fontSize: TEXT.title,
  fontWeight: 700,
  animation: `${platePop} ${TIME.page} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})
export const namePlateLine = style({ display: 'inline-flex', alignItems: 'baseline', gap: GAP.small })
export const namePlateFrom = style({ color: vars.ink.onDarkDim, fontWeight: 400 })
export const namePlateArrow = style({ color: vars.ink.onDarkDim })
export const namePlateExtra = style({ fontSize: TEXT.small, fontWeight: 400, color: vars.ink.onDarkDim })

// ─────────────────────────────────────────────────────────────────
// 막대 · 능력치
// ─────────────────────────────────────────────────────────────────

export const hpBar = style({ display: 'flex', alignItems: 'center', gap: GAP.small, minWidth: 0 })
export const hpTrack = style({ position: 'relative', flex: '1 1 auto', minWidth: 0, ...BAR_TRACK })
export const hpFill = style({ ...BAR_FILL })
export const hpNumbers = style({
  flex: '0 0 auto',
  fontSize: TEXT.small,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.normal,
})

export const statTable = style({ display: 'grid', gap: 2, minWidth: 0 })
export const statRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) max-content',
  alignItems: 'center',
  columnGap: GAP.small,
  fontSize: TEXT.base,
})
export const statRowBars = style({
  gridTemplateColumns: 'minmax(0, 96px) max-content minmax(0, 1fr)',
})
export const statName = style({ display: 'inline-flex', alignItems: 'center', gap: GAP.tight, color: vars.ink.normal })
export const statValue = style({ fontVariantNumeric: 'tabular-nums', fontWeight: 700, textAlign: 'right' })
export const statTrack = style({ position: 'relative', height: 8, ...BAR_TRACK })
export const statFill = style({ ...BAR_FILL, vars: { '--lit': vars.bar.expLit, '--body': vars.bar.exp } })

/** 성격 ▲▼ — 글꼴에 이 글자가 없어서 CSS 세모다. 올리는 쪽이 `state.bad`, 내리는 쪽이 파랑이 아니라 `ink.dim`이다 */
const natureBase = { width: 0, height: 0, borderStyle: 'solid', flex: '0 0 auto' } as const
export const natureUp = style({
  ...natureBase,
  borderWidth: '0 4px 6px',
  borderColor: `transparent transparent ${vars.state.bad}`,
})
export const natureDown = style({
  ...natureBase,
  borderWidth: '6px 4px 0',
  borderColor: `${vars.ink.dim} transparent transparent`,
})

// ─────────────────────────────────────────────────────────────────
// 포켓몬 상세 · 그림 아래 그늘 · 스크롤
// ─────────────────────────────────────────────────────────────────

export const monDetail = style({ display: 'grid', gap: GAP.base, minWidth: 0 })
export const monDetailHead = style({ display: 'flex', alignItems: 'center', gap: GAP.base, minWidth: 0 })
export const monDetailArt = style({ flex: '0 0 auto', imageRendering: 'pixelated', backgroundRepeat: 'no-repeat' })
export const monDetailLines = style({ display: 'grid', gap: GAP.tight, minWidth: 0 })
export const monDetailMoves = style({ display: 'grid', gap: 0 })
export const monDetailAbility = style({ fontSize: TEXT.small, color: vars.ink.normal })

/** 그림 밑 타원 그늘. 그림자(`boxShadow`)가 아니라 땅에 닿은 자리를 보이는 면이다 */
export const groundShadow = style({
  display: 'block',
  flex: '0 0 auto',
  borderRadius: RADIUS.round,
  background: vars.window.shade,
  pointerEvents: 'none',
})

/** 홈과 손잡이. 브라우저 스크롤막대 대신 쓴다 (`ScrollKnob`) */
export const knobTrack = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  width: 6,
  borderRadius: RADIUS.bar,
  background: vars.window.rule,
  pointerEvents: 'none',
})
export const knob = style({
  position: 'absolute',
  left: 0,
  right: 0,
  borderRadius: RADIUS.bar,
  background: vars.pick.edge,
})

/** 스크롤 목록 — 브라우저 막대는 숨기고 위아래 6px는 페이드한다 */
export const scrollList = style({
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarWidth: 'none',
  maskImage: 'linear-gradient(transparent 0, black 6px, black calc(100% - 6px), transparent 100%)',
  selectors: { '&::-webkit-scrollbar': { display: 'none' } },
})

// ─────────────────────────────────────────────────────────────────
// 배지 줄 · 대기 다이얼
// ─────────────────────────────────────────────────────────────────

/** 배지 줄. 칸이 늘 같은 정사각이고 한 기준선에 선다 (DECISIONS 사용자 지적 ①) */
export const badgeRail = style({ display: 'inline-flex', alignItems: 'center', gap: GAP.tight })
export const badgeCell = style({
  display: 'grid',
  placeItems: 'center',
  boxSizing: 'border-box',
  flex: '0 0 auto',
  overflow: 'hidden',
})
export const badgeOff = style({ filter: 'brightness(0)', opacity: 0.14 })

/** 16 VBlank마다 한 걸음, 128 VBlank에 한 바퀴 — 실측 (MENU_MEASURE) */
const DIAL_STEP = '0.2675s'
const DIAL_TURN = '2.14s'
const dialStep = keyframes({ '0%': { opacity: 1 }, '100%': { opacity: 0.18 } })

/** 점 여덟이 도는 다이얼. 주기는 실측 2.14s다 (`WaitDial`) */
export const dial = style({ position: 'relative', width: 24, height: 24, flex: '0 0 auto' })
export const dialDot = style({
  position: 'absolute',
  left: 10,
  top: 10,
  width: 4,
  height: 4,
  borderRadius: RADIUS.round,
  background: vars.ink.dim,
  transform: 'rotate(var(--a)) translateY(-9px)',
})
export const dialRunning = style({
  animation: `${dialStep} ${DIAL_TURN} steps(8, end) infinite`,
  animationDelay: `calc(var(--i) * ${DIAL_STEP} - ${DIAL_TURN})`,
})

// ─────────────────────────────────────────────────────────────────
// 아이콘 뜀 (`iconHopFrames`) — 원작 프레임 박자
// ─────────────────────────────────────────────────────────────────

const hopFrames = keyframes({
  '0%': { transform: 'translateY(var(--hop-up))' },
  '50%': { transform: 'translateY(var(--hop-down))' },
})

/**
 * 파티 · 교체 · 박스 아이콘이 뛴다. 한 번에 위로 3, 아래로 1원본px 둘뿐이고(`steps(1)`) 사이를
 * 보간하지 않는다. 기간과 거리는 `iconHopStyle`이 인라인 변수로 준다.
 * 원작 프레임 움직임이라 `prefers-reduced-motion`에서도 남긴다 (§3)
 */
export const iconHop = style({
  animationName: hopFrames,
  animationTimingFunction: 'steps(1, end)',
  animationIterationCount: 'infinite',
  animationDuration: frames(24),
})
