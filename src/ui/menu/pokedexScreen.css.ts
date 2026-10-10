// 도감 화면 (pokedex.md §4).
//
// 왼쪽이 도감 쪽 다섯(설명 · 분포 · 울음소리 · 크기 · 모습), 오른쪽이 목록이다. 가르는 것은 판이 아니라 세로선 하나다.
// 목록을 늘 옆에 두어서 ↑↓로 종을 넘기며 같은 쪽에 선 채 분포나 크기를 견줄 수 있다.
//
// ⚠️ **3D 구멍(`MonViewport`) 위에 DOM을 겹치지 않는다.** 구멍 뒤에서 3D가 그려지므로, 그 사각형과 겹치는 DOM은
// 3D를 가린다 — 고리 · 그림자 · 글자 전부 구멍 **밖**에 둔다 (발밑 원판은 3D 쪽이 그린다).
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { RULE, WINDOW, pickHalo } from '../theme/window.css'
import { TAG_H } from './pokedex/sizeMath'

/**
 * 이름표 한 쌍의 폭. 두 실루엣의 가로 가운데는 493종 · 두 성별에서 가장 가까울 때도 140.98px 떨어져 있어서(실측
 * `sizeMath.test`), 이 폭이면 둘이 가로로도 안 겹친다
 */
export const TAG_W = 140

/** 목록 칸 폭 */
const LIST_W = 400
/** 목록 머리 높이 */
const HEAD_H = 36

const reduceMotion = { '(prefers-reduced-motion: reduce)': { animation: 'none', transition: 'none' } } as const

// ── 틀 ───────────────────────────────────────────────────────────────────────

export const body = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `minmax(0, 1fr) ${String(LIST_W)}px`,
})

/** 왼쪽 도감 쪽 */
export const pane = style({
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: `${GAP.small}px ${GAP.wide}px ${GAP.small}px`,
})

/** 쪽 띠 — 열리지 않은 쪽은 흐리다. 흐림은 칸 번호별 변수(`--tab-1`…)로 건다 (`PageTabs`가 탭을 `button`으로 그린다) */
const tabDim = Object.fromEntries(
  [1, 2, 3, 4, 5].map((n) => [
    `& [role="tab"]:nth-of-type(${String(n)})`,
    { opacity: `var(--tab-${String(n)}, 1)` },
  ]),
)
export const tabsRow = style({
  flex: '0 0 auto',
  paddingBottom: GAP.small,
  borderBottom: RULE,
  selectors: tabDim,
})

const pageIn = keyframes({
  from: { opacity: 0, transform: 'translateX(8px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

/** 쪽 본문. 쪽이 바뀌면 `key`가 바뀌어 8px + 페이드로 들어온다 */
export const pageBody = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: GAP.base,
  animation: `${pageIn} ${TIME.page} ease-out`,
  '@media': reduceMotion,
})

/** 쪽 안 작은 글 — 쪽이 안 열리는 까닭 같은 것 */
export const quiet = style({
  margin: 'auto',
  color: vars.ink.dim,
  fontSize: TEXT.base,
  textAlign: 'center',
  whiteSpace: 'pre-line',
})

// ── ① 설명 ───────────────────────────────────────────────────────────────────

export const infoTop = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'flex-start',
  gap: GAP.wide,
})

/** 3D 구멍을 세우는 자리. 안은 비워 둔다 */
export const stage = style({
  flex: '0 0 auto',
  display: 'grid',
  placeItems: 'center',
})

export const card = style({
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  paddingTop: GAP.small,
})

export const number = style({
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

export const name = style({
  fontSize: TEXT.big,
  fontWeight: 800,
  lineHeight: 1.15,
  color: vars.ink.strong,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const category = style({
  fontSize: TEXT.base,
  color: vars.ink.dim,
})

export const types = style({
  display: 'flex',
  gap: GAP.small,
  minHeight: 32,
  alignItems: 'center',
})

export const measures = style({
  display: 'flex',
  gap: GAP.loose,
  marginTop: GAP.tight,
})

export const measure = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
})

export const measureLabel = style({
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
})

export const measureValue = style({
  fontSize: TEXT.title,
  fontWeight: 800,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
})

export const entry = style({
  flex: '1 1 auto',
  minHeight: 0,
  marginTop: GAP.base,
  paddingTop: GAP.base,
  borderTop: RULE,
  fontSize: 18,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
  overflowY: 'auto',
  scrollbarWidth: 'thin',
})

// ── ② 분포 ───────────────────────────────────────────────────────────────────

/** 하늘 띠 — 시간대마다 BDSP 하늘 두 색 그러데이션 한 겹이고, 바뀔 때 겹이 0.18s에 교차한다 (그러데이션 색은 보간이 안 되어서 겹으로 간다) */
export const skyLayer = styleVariants({
  Morning: { background: `linear-gradient(180deg, ${vars.dex.skyMorningTop}, ${vars.dex.skyMorningBottom})` },
  Day: { background: `linear-gradient(180deg, ${vars.dex.skyDayTop}, ${vars.dex.skyDayBottom})` },
  Night: { background: `linear-gradient(180deg, ${vars.dex.skyNightTop}, ${vars.dex.skyNightBottom})` },
})

export const skyFace = style({
  position: 'absolute',
  inset: 0,
  opacity: 0,
  transition: `opacity ${TIME.fade} linear`,
  selectors: { '&[data-on="yes"]': { opacity: 1 } },
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

export const skyBand = style({
  position: 'relative',
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP.loose,
  height: 40,
  overflow: 'hidden',
  borderRadius: RADIUS.cell,
})

export const skyTime = style({
  position: 'relative',
  zIndex: 1,
  fontSize: TEXT.base,
  fontWeight: 600,
  color: vars.ink.strong,
  opacity: 0.6,
  selectors: { '&[data-on="yes"]': { opacity: 1, fontWeight: 800 } },
})
/** 밤 하늘 위의 글자는 밝다 */
export const skyTimeNight = style({ color: vars.ink.onDark })

export const mapRow = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: GAP.wide,
  paddingTop: GAP.base,
})

/** 타운맵 그림. 정수 2배로 자른 채 놓고 그 위에 칸을 얹는다 */
export const map = style({
  position: 'relative',
  flex: '0 0 auto',
  overflow: 'hidden',
  borderRadius: RADIUS.cell,
  border: `${String(EDGE.bar)}px solid ${vars.window.edge}`,
  boxSizing: 'content-box',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  backgroundColor: vars.map.sea,
})

/** 그림을 어둡게 눌러 금 칸이 떠오르게 한다 */
export const mapScrim = style({
  position: 'absolute',
  inset: 0,
  background: `color-mix(in srgb, ${vars.window.faceMid} 52%, transparent)`,
  pointerEvents: 'none',
})

export const spot = style({
  position: 'absolute',
  boxSizing: 'border-box',
  background: vars.pick.edge,
  boxShadow: `inset 0 0 0 1px ${vars.pick.text}`,
  pointerEvents: 'none',
})

export const cave = style({
  position: 'absolute',
  boxSizing: 'border-box',
  width: 12,
  height: 12,
  marginLeft: -6,
  marginTop: -6,
  borderRadius: RADIUS.round,
  border: `3px solid ${vars.pick.edge}`,
  background: vars.window.faceTop,
  boxShadow: `0 0 0 1px ${vars.pick.text}`,
  pointerEvents: 'none',
})

/** 「서식지 불명」 — 글이 안 읽히면 그늘이 아니라 판을 준다. 지도 가운데에 선다 */
export const unknownArea = style({
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  padding: `${String(GAP.small)}px ${String(GAP.loose)}px`,
  borderRadius: RADIUS.cell,
  background: vars.window.faceTop,
  border: `${String(EDGE.bar)}px solid ${vars.window.edge}`,
  fontSize: TEXT.title,
  fontWeight: 800,
  color: vars.ink.strong,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
})

// ── ③ 울음소리 ───────────────────────────────────────────────────────────────

/** 동심원 고리 셋 — 바깥으로 갈수록 옅다. 구멍 밖(고리의 안쪽 반지름 ≥ 구멍 대각)에만 그려서 3D를 안 가린다 */
export const cryStage = style({
  position: 'relative',
  flex: '0 0 auto',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  height: 232,
})

export const ring = style({
  position: 'absolute',
  left: '50%',
  top: '50%',
  borderRadius: RADIUS.round,
  border: `${String(EDGE.bar)}px solid ${vars.window.edge}`,
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
})

export const wave = style({
  flex: '0 0 auto',
  display: 'block',
  width: '100%',
  height: 96,
  marginTop: GAP.small,
  borderTop: RULE,
  borderBottom: RULE,
  color: vars.ink.normal,
})

export const bench = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  alignItems: 'stretch',
  gap: GAP.wide,
  paddingTop: GAP.base,
})

/** 볼 판: 가로가 코러스 음량 또는 좌우, 세로 위쪽이 보통 · 아래쪽이 두 옥타브 낮게 */
export const pad = style({
  position: 'relative',
  flex: '1 1 auto',
  minWidth: 0,
  borderRadius: RADIUS.cell,
  border: `${String(EDGE.bar)}px solid ${vars.window.edge}`,
  touchAction: 'none',
  cursor: 'pointer',
  backgroundImage: [
    `linear-gradient(${vars.window.rule}, ${vars.window.rule})`,
  ].join(', '),
  backgroundSize: '100% 1px',
  backgroundPosition: '0 50%',
  backgroundRepeat: 'no-repeat',
  selectors: { '&[data-tuning="yes"]': { outline: `${String(EDGE.bar)}px solid ${vars.pick.edge}` } },
})

const BALL = 28
/** 볼 판 위의 몬스터볼 — 위 빨강 · 가운데 검은 띠 · 아래 흰색. 좌표는 `--x` `--y` (0~1) */
export const padBall = style({
  position: 'absolute',
  width: BALL,
  height: BALL,
  left: `calc(var(--x, 0.5) * (100% - ${String(BALL)}px))`,
  top: `calc(var(--y, 0) * (100% - ${String(BALL)}px))`,
  borderRadius: RADIUS.round,
  border: `2px solid ${vars.ball.band}`,
  boxSizing: 'border-box',
  background: `linear-gradient(180deg, ${vars.ball.top} 0 42%, ${vars.ball.band} 42% 58%, ${vars.ball.bottom} 58% 100%)`,
  transition: `left ${TIME.slide} ease-out, top ${TIME.slide} ease-out`,
  pointerEvents: 'none',
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

export const benchSide = style({
  flex: '0 0 auto',
  width: 150,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: GAP.small,
})

const modeBase = style({
  padding: `${String(GAP.tight)}px ${String(GAP.base)}px`,
  borderRadius: RADIUS.cell,
  fontSize: TEXT.base,
  fontWeight: 600,
  color: vars.ink.dim,
  textAlign: 'center',
})
export const mode = styleVariants({
  off: [modeBase],
  on: [modeBase, {
    background: vars.pick.face,
    boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}`,
    color: vars.pick.text,
    fontWeight: 800,
  }],
})

/** 반복 표시 — 켜면 금 */
export const loopMark = style({
  alignSelf: 'flex-end',
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  borderRadius: RADIUS.cell,
  fontSize: TEXT.title,
  color: vars.ink.faint,
  selectors: { '&[data-on="yes"]': { color: vars.pick.text, background: vars.pick.face, boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}` } },
})

// ── ④ 크기 ───────────────────────────────────────────────────────────────────

export const sizeHead = style({
  flex: '0 0 auto',
  fontSize: TEXT.small,
  fontWeight: 800,
  color: vars.ink.dim,
  marginBottom: GAP.tight,
})

/** 키 비교 무대 — 위가 비어 있고 아래가 풀밭 띠다. 가운데 맞춤 */
export const heightBox = style({
  position: 'relative',
  flex: '0 0 auto',
  alignSelf: 'center',
  overflow: 'hidden',
  borderRadius: RADIUS.cell,
})

export const grass = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  background: vars.dex.ground,
})

/**
 * 실루엣 — **불투명한 한 색**이다. 마스크로 그림의 모양만 따고 색은 한 토큰이라, 땅 위에 겹친 발도 비치지 않는다.
 * 그림은 `--art`(주소), 자리와 크기는 인라인
 */
export const silhouette = style({
  position: 'absolute',
  background: vars.ink.strong,
  WebkitMaskImage: 'var(--art)',
  maskImage: 'var(--art)',
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  imageRendering: 'pixelated',
  pointerEvents: 'none',
})

/**
 * 이름표 한 쌍 — **실루엣의 가로 가운데 아래, 풀밭 띠 위**에 서고 실루엣과 겹치지 않는다. 자리는 인라인 `left`(가운데 px)와
 * `top`(땅선 아래)이다. 폭은 `TAG_W` 고정이고 글은 가운데 맞춤이다
 */
export const tag = style({
  position: 'absolute',
  width: TAG_W,
  height: TAG_H,
  marginLeft: -TAG_W / 2,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 1,
  textAlign: 'center',
  color: vars.ink.strong,
})

export const tagName = style({
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: TEXT.base,
  fontWeight: 800,
})

export const tagValue = style({
  fontSize: TEXT.title,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
})

export const weightBox = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  alignSelf: 'center',
  width: '100%',
  marginTop: GAP.small,
})

/** 시소의 대 */
export const beam = style({
  position: 'absolute',
  height: 8,
  borderRadius: RADIUS.bar,
  background: vars.window.edge,
  boxShadow: `inset 0 0 0 1px ${vars.window.edgeDim}`,
  transition: `transform ${TIME.fade} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

export const pivot = style({
  position: 'absolute',
  width: 0,
  height: 0,
  borderLeft: '14px solid transparent',
  borderRight: '14px solid transparent',
  borderBottom: `22px solid ${vars.window.edge}`,
})

// ── ⑤ 모습 ───────────────────────────────────────────────────────────────────

export const formsTop = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'flex-start',
  gap: GAP.wide,
})

export const formName = style({
  fontSize: TEXT.big,
  fontWeight: 800,
  lineHeight: 1.15,
  color: vars.ink.strong,
  minHeight: TEXT.big * 1.15,
})

export const formStrip = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignContent: 'flex-start',
  gap: GAP.tight,
  marginTop: GAP.base,
  paddingTop: GAP.base,
  borderTop: RULE,
})

export const formCell = style({
  flex: '0 0 auto',
  width: 36,
  height: 36,
  display: 'grid',
  placeItems: 'center',
  borderRadius: RADIUS.cell,
  boxSizing: 'border-box',
  cursor: 'pointer',
})
export const formCellOn = style([formCell, pickHalo])

// ── 목록 ─────────────────────────────────────────────────────────────────────

export const listPane = style({
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  borderLeft: RULE,
})

export const listHead = style({
  flex: '0 0 auto',
  height: HEAD_H,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `0 ${String(GAP.wide)}px 0 ${String(GAP.wide)}px`,
  borderBottom: RULE,
  fontSize: TEXT.small,
  fontWeight: 800,
  color: vars.ink.dim,
})

export const listCount = style({ fontVariantNumeric: 'tabular-nums' })

export const listBox = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
})

export const listScroll = style({
  position: 'absolute',
  inset: 0,
  padding: `${String(GAP.tight)}px ${String(GAP.loose)}px ${String(GAP.tight)}px ${String(GAP.base)}px`,
})

/** 손잡이 — 홈은 목록 안쪽 위아래 4px 안에 선다 */
export const knobWrap = style({
  position: 'absolute',
  top: GAP.tight,
  bottom: GAP.tight,
  right: GAP.small,
  width: 6,
  pointerEvents: 'none',
})

/** 줄 안 */
export const rowNo = style({
  flex: '0 0 auto',
  width: 34,
  fontVariantNumeric: 'tabular-nums',
  fontSize: TEXT.small,
  color: vars.ink.dim,
  selectors: { '[data-on="yes"] > &': { color: 'inherit' } },
})

export const rowIcon = style({
  flex: '0 0 auto',
  width: 32,
  height: 32,
  display: 'block',
})

/** 잡은 종의 몬스터볼 — 줄 오른쪽 끝 12px */
export const ballMark = style({
  flex: '0 0 auto',
  marginLeft: 'auto',
  width: 12,
  height: 12,
  borderRadius: RADIUS.round,
  border: `1px solid ${vars.ball.band}`,
  boxSizing: 'border-box',
  background: `linear-gradient(180deg, ${vars.ball.top} 0 40%, ${vars.ball.band} 40% 60%, ${vars.ball.bottom} 60% 100%)`,
})

// ── 검색 시트 ────────────────────────────────────────────────────────────────

const sheetIn = keyframes({
  from: { opacity: 0, transform: 'translateX(24px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

/** 목록 칸 위에 겹치는 같은 창 재질의 시트 — 오른쪽에서 24px 미끄러져 들어온다 */
export const sheet = style({
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  padding: `${String(GAP.base)}px ${String(GAP.wide)}px`,
  background: WINDOW.background,
  backgroundColor: WINDOW.backgroundColor,
  borderLeft: RULE,
  animation: `${sheetIn} ${TIME.open} ease-out`,
  '@media': reduceMotion,
})

export const sheetHead = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  paddingBottom: GAP.small,
  borderBottom: RULE,
  fontSize: TEXT.small,
  fontWeight: 800,
  color: vars.ink.dim,
})

const searchRowBase = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: GAP.base,
  minHeight: LINE.row + 4,
  padding: `0 ${String(GAP.small)}px`,
  borderRadius: RADIUS.cell,
  fontSize: TEXT.base,
})
export const searchRow = styleVariants({
  off: [searchRowBase],
  on: [searchRowBase, {
    background: vars.pick.face,
    boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}`,
    color: vars.pick.text,
    fontWeight: 700,
  }],
})

export const searchLabel = style({ flex: '0 0 auto', color: 'inherit', opacity: 0.8 })
export const searchValues = style({ display: 'flex', alignItems: 'center', gap: GAP.base })

/** 고른 칸의 값 둘 중 하나 — 타입 줄은 값이 둘이다 */
export const searchCell = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.tight,
  minWidth: 48,
  justifyContent: 'center',
  padding: '2px 6px',
  borderRadius: RADIUS.bar,
})
export const searchCellOn = style([searchCell, {
  boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}`,
  background: vars.pick.face,
}])

export const searchArrow = style({ fontSize: TEXT.small, opacity: 0.7 })

export const searchNote = style({
  margin: 0,
  paddingTop: GAP.small,
  borderTop: RULE,
  fontSize: TEXT.small,
  lineHeight: 1.6,
  color: vars.ink.dim,
  whiteSpace: 'pre-line',
})

export const shapeCell = style({ flex: '0 0 auto', display: 'block' })

/** 빈 결과 — 목록 칸 가운데 */
export const noResult = style({
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: GAP.wide,
  fontSize: TEXT.base,
  lineHeight: 1.6,
  textAlign: 'center',
  color: vars.ink.dim,
  whiteSpace: 'pre-line',
})
