// 상점 — 장부 · 계산대 · 아래 띠 (설계서 `shop.md` §4).
//
// 판을 안 깐다. 창 하나, 가르는 선 셋(장부 | 계산대 세로선, 본문 | 아래 띠, 아래 띠 | 바닥), 떠 있는 창 **없음**.
// 줄 · 영웅 · 계산서 어디에도 판이 없고, 예/아니오도 계산서 안의 두 줄(금 띠 하나가 미끄러진다)이라 창이 아니다.
//
// 이 파일이 새로 만든 부품은 공용으로 안 올린다 — 계산서(`receipt`)는 상점과 포인트 교환 코너만 쓴다
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, TEXT, TIME } from '../theme/scale'
import { RULE } from '../theme/window.css'

/** 줄 높이. 아이콘 32 위아래에 4px 여백이 생긴다 */
export const ROW = 40
/** 계산대 폭 */
const COUNTER = 344
/** 아래 띠 높이 */
const BAND = 128

const fade = keyframes({ from: { opacity: 0.2 }, to: { opacity: 1 } })
const blink = keyframes({ '0%': { opacity: 1 }, '50%': { opacity: 0 } })
const slideIn = keyframes({
  from: { opacity: 0.4, transform: 'translateX(8px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

/** 본문 — 왼쪽 장부 · 오른쪽 계산대 · 아래 띠 */
export const stage = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `minmax(0, 1fr) ${String(COUNTER)}px`,
  gridTemplateRows: `minmax(0, 1fr) ${String(BAND)}px`,
  gridTemplateAreas: '"ledger counter" "band band"',
})

// ── 장부 (왼쪽) ──────────────────────────────────────────────────────────────

export const ledgerBox = style({
  gridArea: 'ledger',
  position: 'relative',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
})

/** 목록 — 산다 ↔ 판다를 바꾸면 8px 미끄러져 들어온다 (`TIME.page`) */
export const ledger = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: `${GAP.base}px ${GAP.wide}px ${GAP.small}px`,
  animation: `${slideIn} ${TIME.page} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 줄 안쪽 — 아이콘 · 이름 · 점선 · 보유 · 값 */
export const line = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  height: '100%',
  minWidth: 0,
})

export const iconSlot = style({ width: 32, height: 32, flex: '0 0 auto' })

/** 기술머신 줄 머리 `No06` — 자리가 맞아야 해서 tabular다 */
export const number = style({
  flex: '0 0 auto',
  width: 44,
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

export const typeTick = style({
  flex: '0 0 auto',
  width: 3,
  height: 18,
  background: `var(--tint, ${vars.window.edge})`,
})

/** 자료가 아직 안 왔을 때 이름 자리 — 줄 높이를 지킨 2px 가는 선 */
export const nameSkeleton = style({
  width: 96,
  height: EDGE.bar,
  background: vars.window.rule,
})

/** 점선. 고른 줄 안에서는 `pick.trace`로 바뀐다 */
export const lead = style({
  flex: '1 1 auto',
  minWidth: GAP.base,
  alignSelf: 'center',
  borderBottom: `${String(EDGE.bar)}px dotted ${vars.window.rule}`,
  selectors: { '[data-on] &': { borderBottomColor: vars.pick.trace } },
})

/** 보유 `×5` — 0이면 빈칸이다 */
export const have = style({
  flex: '0 0 auto',
  width: 44,
  textAlign: 'right',
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 값 — 오른쪽 맞춤. 못 사는 값만 `state.bad`다 (줄은 어둡게 안 한다 — 고르면 거절 줄이 떠야 한다) */
export const price = style({
  flex: '0 0 auto',
  width: 92,
  textAlign: 'right',
  fontSize: TEXT.base,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
})
export const priceBad = style({ color: vars.state.bad })

/** 목록이 비었을 때(판다) — 「그만둔다」 밑에 흐린 주머니 아이콘 64가 선다 */
export const emptyArt = style({
  flex: '1 1 auto',
  display: 'grid',
  placeItems: 'center',
  opacity: 0.35,
})

// ── 계산대 (오른쪽) ──────────────────────────────────────────────────────────

export const counter = style({
  gridArea: 'counter',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  borderLeft: RULE,
})

/** 지갑 줄 — 용돈 ··· 1,280원. 값이 갈릴 때 0.18초 흐림이다 */
export const wallet = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  height: 44,
  padding: `0 ${GAP.wide}px`,
  borderBottom: RULE,
  fontSize: TEXT.small,
  color: vars.ink.dim,
})

export const walletValue = style({
  fontSize: TEXT.list,
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
  animation: `${fade} ${TIME.fade} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 지갑만 크게 선다 (끝 줄 · 빈 판다) */
export const walletBig = style({
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP.small,
  color: vars.ink.dim,
  fontSize: TEXT.small,
})

export const walletBigValue = style({
  fontSize: TEXT.big,
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
  animation: `${fade} ${TIME.fade} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 영웅 — 아이콘 96(3×)과 그 밑 그늘 · 이름 · 한 줄 */
export const hero = style({
  flex: '0 0 auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: GAP.tight,
  padding: `${GAP.wide}px ${GAP.wide}px ${GAP.small}px`,
})

export const heroIcon = style({ flex: '0 0 auto', imageRendering: 'pixelated', backgroundRepeat: 'no-repeat' })

export const heroName = style({
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
  textAlign: 'center',
})

export const heroSub = style({
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
})

/** 값 칸 — 선 아래 28/700. 못 사면 `state.bad` */
export const bigPrice = style({
  flex: '1 1 auto',
  display: 'grid',
  placeItems: 'center',
  borderTop: RULE,
  margin: `0 ${GAP.wide}px`,
  fontSize: TEXT.big,
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})

export const bigPriceBad = style({ color: vars.state.bad })

/** 기술머신의 기술 정보 — 값 밑에 선다. 실제 자료다 */
export const moveInfo = style({
  flex: '0 0 auto',
  display: 'grid',
  gap: GAP.tight,
  justifyItems: 'start',
  padding: `${GAP.small}px ${GAP.wide}px ${GAP.base}px`,
})

// ── 계산서 ───────────────────────────────────────────────────────────────────

/** 사는 동안 계산대는 셈 한 장으로 바뀐다. 영웅은 64(2×)로 줄어든다 — 크기 전환은 안 한다, 한 프레임에 바뀐다 */
export const receipt = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  padding: `${GAP.base}px ${GAP.wide}px`,
})

export const receiptHead = style({ display: 'flex', alignItems: 'center', gap: GAP.base, minWidth: 0 })

export const receiptRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: GAP.base,
  fontVariantNumeric: 'tabular-nums',
})

export const receiptPurse = style({ fontSize: TEXT.base, color: vars.ink.dim })
export const receiptDelta = style({ fontSize: TEXT.big, fontWeight: 700, color: vars.ink.strong })
export const receiptAfter = style({
  paddingTop: GAP.small,
  borderTop: RULE,
  justifyContent: 'flex-end',
  fontSize: TEXT.big,
  fontWeight: 700,
  color: vars.ink.strong,
})

/** 프레미어볼 덤 한 줄 — 10개째부터 미리 보인다. 문구는 도구 이름과 `+1`뿐이다 */
export const bonus = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.state.good,
})

/** 계산서 안의 예/아니오 — 두 줄 사이를 금 띠 하나가 미끄러진다 */
export const yesNo = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  marginTop: 'auto',
})

export const yesNoItem = style({
  position: 'relative',
  zIndex: 1,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  height: LINE.row,
  padding: `0 ${GAP.small}px 0 22px`,
  fontSize: TEXT.list,
  cursor: 'pointer',
})
export const yesNoOn = style({ color: vars.pick.text, fontWeight: 700 })

// ── 아래 띠 ──────────────────────────────────────────────────────────────────

/** 글 한 덩이. 도구 설명(Pretendard)과 점원의 말(Galmuri)이 같은 자리에서 글꼴로 갈린다 */
export const band = style({
  gridArea: 'band',
  position: 'relative',
  borderTop: RULE,
  padding: `${GAP.base}px ${GAP.loose}px`,
  overflow: 'hidden',
})

export const bandText = styleVariants({
  desc: {
    fontSize: TEXT.base,
    lineHeight: 1.62,
    color: vars.ink.normal,
    whiteSpace: 'pre-line',
  },
  clerk: {
    fontFamily: vars.font.pixel,
    fontSize: TEXT.list,
    lineHeight: `${String(LINE.dock)}px`,
    color: vars.ink.strong,
    whiteSpace: 'pre-line',
  },
  /** 거절 줄 — 못 샀다는 말은 `state.bad`다 */
  refuse: {
    fontFamily: vars.font.pixel,
    fontSize: TEXT.list,
    lineHeight: `${String(LINE.dock)}px`,
    color: vars.state.bad,
    whiteSpace: 'pre-line',
  },
})

/** 「다음」이 필요한 단계의 표시 — 금색 세모 하나가 0.7초 깜박인다 (Pretendard에 ▼가 없어 CSS 세모다) */
export const nextMark = style({
  position: 'absolute',
  right: GAP.loose,
  bottom: GAP.base,
  width: 0,
  height: 0,
  borderStyle: 'solid',
  borderWidth: '9px 7px 0',
  borderColor: `${vars.pick.edge} transparent transparent`,
  animation: `${blink} ${TIME.blink} steps(1, end) infinite`,
})
