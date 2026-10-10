// PC로 다시 보는 명예의 전당 — `applications/pc_hall_of_fame/display.c` · 설계 `records` §4.3
//
// 3D 단 여섯은 **화면 전체 폭**에 선다 (4:3 상자를 걷었다). 이 화면은 창이 아니라 장면이라 자기 머리(제목 + 기록 눈금)와
// 아래 띠(이름표 · 파티 줄 · 키 안내)를 둔다. 아래 띠는 상자가 아니다 — 면과 테두리가 없는 그림자 띠 하나다.
// 색은 전부 어두운 판 위의 것이다 (`emphasis.oneOnDark` · `ink.onDark` · `ink.onDarkDim`).
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED } from '../theme/window.css'

/** 화면 가장자리에서 글까지 — 머리와 바닥이 같은 안쪽 여백(48)을 쓴다 */
const SIDE = 48

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/** 장면 전체 — 화면 기준이다 (`MenuScreen cinematic bare`의 창 안이 아니다) */
export const root = style({
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  fontFamily: vars.font.ui,
})

/** 아래 그림자 띠 — 높이 230. 위는 투명하고 아래로 갈수록 어두워진다. 같은 색 `scrim.deep`을 두 겹 쌓아 바닥이 더 짙다 */
export const shadeBand = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 230,
  background: [
    `linear-gradient(to bottom, transparent, ${vars.scrim.deep})`,
    `linear-gradient(to bottom, transparent 45%, ${vars.scrim.deep})`,
  ].join(', '),
})

// ─────────────────────────────────────────────────────────────────
// 머리 — 제목(왼쪽) · 몇째 + 눈금(오른쪽)
// ─────────────────────────────────────────────────────────────────

export const title = style({
  position: 'absolute',
  left: SIDE,
  top: 28,
  fontSize: 26,
  fontWeight: 700,
  color: vars.emphasis.oneOnDark,
  whiteSpace: 'pre',
})

export const counter = style({
  position: 'absolute',
  right: SIDE,
  top: 24,
  display: 'grid',
  justifyItems: 'end',
  rowGap: GAP.small,
})

/** `1 / 3` — 큰 수는 20px 700, 나머지는 14px 흐리게 */
export const counterText = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: GAP.tight,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.onDarkDim,
  fontSize: TEXT.small,
})
export const counterNow = style({ fontSize: TEXT.title, fontWeight: 700, color: vars.ink.onDark })

/** 기록 눈금 — 왼쪽이 옛것 오른쪽이 새것. 지금 기록만 금색이다 */
export const meter = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.small,
  fontSize: TEXT.tiny,
  color: vars.ink.onDarkDim,
})
export const meterBars = style({ display: 'inline-flex', alignItems: 'center', gap: 2 })
const barBase = { width: 10, height: 18 } as const
export const bar = style({ ...barBase, background: `color-mix(in srgb, ${vars.ink.onDark} 30%, transparent)` })
export const barNow = style({ ...barBase, background: vars.emphasis.oneOnDark })

// ─────────────────────────────────────────────────────────────────
// 이름표 · 쪽 표시 · 기술
// ─────────────────────────────────────────────────────────────────

/** 이름표 — 별명 38px 700, 아랫줄 종족 · 성별 · 레벨 18px, 어버이 16px 흐리게. 100ms 페이드로 바뀐다 */
export const plate = style({
  position: 'absolute',
  left: SIDE,
  bottom: 102,
  display: 'grid',
  rowGap: GAP.tight,
  animation: `${fadeIn} 0.1s ease-out`,
})
export const plateName = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: GAP.base,
  fontSize: 38,
  fontWeight: 700,
  lineHeight: 1.15,
  color: vars.ink.onDark,
})
/** 별명 줄 옆 「기술」 쪽 표시 */
export const plateTag = style({ fontSize: TEXT.small, fontWeight: 400, color: vars.ink.onDarkDim })
export const plateInfo = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: GAP.small,
  fontSize: 18,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.onDark,
})
export const plateOt = style({ fontSize: TEXT.base, color: vars.ink.onDarkDim })

/** 기술 — 두 칸씩 두 줄 (원작 `(i & 1) * 96`, `(i / 2) * 16`) */
export const moves = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, max-content))',
  columnGap: GAP.loose,
  rowGap: GAP.tight,
  fontSize: 22,
  fontWeight: 700,
  color: vars.ink.onDark,
})

/** 쪽 표시 — 짧은 선 둘(일반 | 기술). 지금 쪽만 금색, 100ms로 바뀐다 */
export const pages = style({
  position: 'absolute',
  left: SIDE,
  bottom: 90,
  display: 'inline-flex',
  gap: GAP.tight,
})
const pageBase = {
  width: 28,
  height: 3,
  transition: 'background 0.1s linear',
} as const
export const page = style({ ...pageBase, background: `color-mix(in srgb, ${vars.ink.onDark} 30%, transparent)` })
export const pageNow = style({ ...pageBase, background: vars.emphasis.oneOnDark })

// ─────────────────────────────────────────────────────────────────
// 파티 줄 · 바닥 안내
// ─────────────────────────────────────────────────────────────────

/** 파티 줄 — 아이콘 32를 48 칸에. 고른 마리만 컬러에 금 띠, 나머지는 회색으로 낮춘다 */
export const party = style({
  position: 'absolute',
  left: SIDE - 4,
  bottom: 36,
  display: 'inline-flex',
  gap: 0,
})
export const cell = style({
  width: 48,
  height: 48,
  display: 'grid',
  placeItems: 'center',
  borderRadius: RADIUS.cell,
  filter: 'grayscale(0.9)',
  opacity: 0.65,
})
export const cellOn = style({ ...PICKED, width: 48, height: 48, borderRadius: RADIUS.cell, filter: 'none', opacity: 1 })
export const icon = style({
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

export const keys = style({
  position: 'absolute',
  right: SIDE,
  bottom: 50,
  fontSize: TEXT.tiny,
  color: vars.ink.onDarkDim,
})

// ─────────────────────────────────────────────────────────────────
// 빈 상태 — 밝은 창 안이다 (`MenuScreen`의 `framed`). 본문을 다 쓴다
// ─────────────────────────────────────────────────────────────────

/** 본문 전체 — 가운데에 여섯 단의 윤곽과 한 줄 */
export const empty = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  rowGap: GAP.loose,
  fontSize: TEXT.base,
  color: vars.ink.dim,
})

/** 여섯 단의 윤곽 — 원작 어긋난 배치(`spriteCoordinates`) 그대로. 「여기에 파티 여섯이 선다」는 사실을 보인다 */
export const emptyStage = style({ position: 'relative', width: 512, height: 232 })
export const emptySpot = style({
  position: 'absolute',
  width: 130,
  height: 34,
  boxSizing: 'border-box',
  borderRadius: RADIUS.round,
  border: `${EDGE.bar}px solid ${vars.window.edgeDim}`,
  opacity: 0.55,
  transform: 'translate(-50%, -50%)',
})
