// 설정 — 묶음 · 한 열 값 · 미리보기 (`options.md` §4).
//
// 줄은 목록 줄(`LINE.row` 32)과 같고, 고른 것은 **줄 밖의 금 띠 하나**가 미끄러진다(고정 목록이라 `TIME.slide`, SYSTEM
// §0 L5). 값은 판이 아니라 **같은 열에 선 글자**다 — 고른 값은 `emphasis.one`(원작 빨강)과 금 밑줄이고(`ValueStrip`),
// 안 고른 값은 흐리다. 값에 판을 깔면 고른 줄의 금 띠 안에 금 판이 또 들어가 무엇이 커서인지 흐려졌다.
//
// 아래 띠는 `MessageDock`(롬 글)이고 그 오른쪽 끝(`trailing`)에 **항목별 미리보기**가 선다. 미리보기는 판 없이 창 얼굴
// 위에 바로 그린다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { BAR_FILL, BAR_TRACK, EXP_VARS, KEYCAP, WINDOW_SMALL, caret, pickBand } from '../theme/window.css'
import { sectionHead } from './menuChrome.css'

// ─────────────────────────────────────────────────────────────────
// 본문 · 줄
// ─────────────────────────────────────────────────────────────────

/** 값 칸 폭 — `ValueStrip`의 `VALUE_CELL`(160)과 같다. 칸이 같아서 값이 줄마다 열에 맞는다 */
const VALUE_COL = 160
/** 값 열 셋의 폭 */
const VALUES_WIDTH = VALUE_COL * 3
/** ‹ › 자리 */
const CHEV_WIDTH = 22
/** 항목 이름 칸 */
const LABEL_WIDTH = 222

export const body = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: `${GAP.small}px ${GAP.wide}px ${GAP.base}px`,
})

/** 줄 목록 칸 — 띠가 이 안에서 미끄러진다. 줄 자리는 DOM에서 재서 준다(묶음 머리 높이를 믿지 않는다) */
export const list = style({ position: 'relative', flex: '0 0 auto' })

export const band = pickBand.y
export const bandCaret = caret

/** 묶음 머리 — 글 + 남은 폭 실선 (`sectionHead`). 높이를 못 박는다 */
export const groupHead = style([sectionHead, { margin: `${GAP.tight}px 0 0`, height: 24 }])

export const row = style({
  position: 'relative',
  zIndex: 1,
  boxSizing: 'border-box',
  height: LINE.row,
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${GAP.small}px 0 22px`,
  fontSize: TEXT.list,
  color: vars.ink.normal,
})

/** 고른 줄은 글자색과 굵기만 바뀐다 */
export const rowOn = style({ color: vars.pick.text, fontWeight: 700 })

export const label = style({
  flex: `0 0 ${String(LABEL_WIDTH)}px`,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

/** 「처음부터」 — 고른 줄이어도 이름은 경고색이다. 띠는 다른 줄과 같은 금이다 */
export const labelBad = style({ color: vars.state.bad })

/** 원작에 없는 항목 표시 — 테두리 딱지가 아니라 이름 뒤의 작은 글자다 */
export const ours = style({
  marginLeft: GAP.small - 2,
  fontSize: TEXT.tiny,
  fontWeight: 400,
  color: vars.ink.faint,
})

/** ‹ › — 커서 줄에서만 보인다. 글꼴에 없는 글자라 CSS 세모다 */
const chevBase = {
  flex: `0 0 ${String(CHEV_WIDTH)}px`,
  display: 'grid',
  placeItems: 'center',
  visibility: 'hidden',
} as const
export const chev = style(chevBase)
export const chevLive = style({ visibility: 'visible' })
const tri = { width: 0, height: 0, borderStyle: 'solid', borderColor: 'transparent' } as const
export const chevLeft = style({ ...tri, borderWidth: '5px 6px 5px 0', borderRightColor: vars.ink.dim })
export const chevRight = style({ ...tri, borderWidth: '5px 0 5px 6px', borderLeftColor: vars.ink.dim })

/** 값 열 자리 — 값이 둘이어도 셋 칸 폭을 지켜 › 가 늘 같은 열에 선다 */
export const values = style({ flex: `0 0 ${String(VALUES_WIDTH)}px`, minWidth: 0 })

/** 오른쪽 끝 상태 칸 — 에셋 확인의 막대 · 행동 줄의 Z */
export const stateCol = style({
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  fontSize: TEXT.small,
  fontWeight: 400,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 막대 — 홈(`BAR_TRACK`) 안의 경험치색 채움. 폭은 인라인이다 */
export const track = style({ ...BAR_TRACK, width: 72, height: 10, boxSizing: 'border-box' })
export const fill = style({ ...BAR_FILL, display: 'block', vars: EXP_VARS })

/** 책임 없는 글(뱅크가 오기 전) 자리 표시 — 판이 아니라 「글이 올 자리」 가는 선이다 */
export const placeholder = style({
  display: 'inline-block',
  width: 96,
  height: 2,
  background: vars.window.rule,
})

// ─────────────────────────────────────────────────────────────────
// 아래 띠 — 롬 글 + 미리보기
// ─────────────────────────────────────────────────────────────────

/** 경고 결과(에셋 확인이 어긋남)는 대사 글이 `state.bad` 굵게다 */
export const warn = style({ display: 'contents' })
globalStyle(`${warn}[data-warn="true"] [data-message-dock]`, { color: vars.state.bad, fontWeight: 700 })

/** 미리보기 자리 — 설계서의 312 폭. 판이 없다 */
export const preview = style({
  position: 'relative',
  width: 312,
  height: 112,
  boxSizing: 'border-box',
  overflow: 'hidden',
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
  fontSize: TEXT.small,
})

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/** 내용이 바뀔 때 0.18s 크로스페이드 — 창은 안 움직인다 */
export const previewBody = style({
  position: 'absolute',
  inset: 0,
  animation: `${fadeIn} ${TIME.fade} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

export const ptitle = style({ fontSize: TEXT.tiny, fontWeight: 700, color: vars.ink.dim, marginBottom: GAP.tight })
export const pnote = style({ marginTop: GAP.small, fontSize: TEXT.tiny, color: vars.ink.faint })

// 배틀 애니메이션 — 내 포켓몬 · 상대 포켓몬 도트 1배(80)와 물줄기
const jetFrames = keyframes({
  '0%': { transform: 'scaleX(0) rotate(-14deg)', opacity: 1 },
  '70%': { transform: 'scaleX(1) rotate(-14deg)', opacity: 1 },
  '100%': { transform: 'scaleX(1) rotate(-14deg)', opacity: 0 },
})
export const duel = style({ position: 'relative', height: '100%' })
const mon = {
  position: 'absolute',
  width: 80,
  height: 80,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
} as const
export const duelMine = style({ ...mon, left: 0, bottom: 0 })
export const duelFoe = style({ ...mon, right: GAP.small, top: 0 })
export const moveName = style({
  position: 'absolute',
  left: 84,
  top: 24,
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.normal,
})
export const jet = style({
  position: 'absolute',
  left: 84,
  top: 52,
  width: 110,
  height: 6,
  borderRadius: RADIUS.bar,
  background: `linear-gradient(90deg, transparent, ${vars.bar.expLit}, ${vars.bar.exp})`,
  transformOrigin: 'left center',
  animation: `${jetFrames} ${TIME.blink} ease-out infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.6 } },
})

// 시합 룰 — 배틀 대사창 견본. 롬 글 그대로라 Galmuri11이다
export const battleMessage = style({
  ...WINDOW_SMALL,
  boxSizing: 'border-box',
  padding: `${GAP.small}px ${GAP.base}px`,
  fontFamily: vars.font.pixel,
  fontSize: TEXT.base,
  lineHeight: '22px',
  whiteSpace: 'pre-line',
  color: vars.ink.normal,
})

// 배틀 진행 — 막대 셋
export const pace = style({
  display: 'grid',
  gridTemplateColumns: '84px 1fr 52px',
  rowGap: GAP.small - 2,
  alignItems: 'center',
  fontSize: TEXT.small,
  color: vars.ink.faint,
})
export const paceOn = style({ color: vars.emphasis.one, fontWeight: 700 })
export const paceTrack = style({ ...BAR_TRACK, height: 10, boxSizing: 'border-box' })
export const paceFill = style({ height: '100%', background: vars.ink.faint, opacity: 0.35 })
export const paceFillOn = style({ ...BAR_FILL, vars: EXP_VARS, opacity: 1 })
export const paceNum = style({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' })

// 시점 — 키와 도식
export const keys = style({ display: 'flex', alignItems: 'center', gap: GAP.small, color: vars.ink.dim })
export const cams = style({ display: 'flex', gap: GAP.loose - 2, marginTop: GAP.base })
export const cam = style({ fontSize: TEXT.tiny, color: vars.ink.faint, textAlign: 'center' })
export const camOn = style({ color: vars.emphasis.one, fontWeight: 700 })

// 언어 — 그 언어로 바뀐 이 화면의 첫 묶음
export const lang = style({ fontSize: TEXT.base, lineHeight: '24px', color: vars.ink.normal })
export const langHelp = style({
  marginTop: GAP.tight,
  fontFamily: vars.font.pixel,
  fontSize: TEXT.tiny,
  lineHeight: '18px',
  color: vars.ink.dim,
  whiteSpace: 'pre-line',
})

// 사운드 — 왼쪽 · 오른쪽 두 칸의 박동
const pulse = keyframes({
  '0%, 100%': { transform: 'scale(1)', opacity: 0.55 },
  '50%': { transform: 'scale(1.12)', opacity: 1 },
})
export const speakers = style({ display: 'flex', gap: GAP.loose + 4, alignItems: 'center', marginTop: GAP.small })
export const speaker = style({
  width: 48,
  height: 48,
  boxSizing: 'border-box',
  display: 'grid',
  placeItems: 'center',
  borderRadius: RADIUS.round,
  border: `3px solid ${vars.window.edge}`,
  fontWeight: 700,
  color: vars.ink.dim,
  animation: `${pulse} 1.4s ease-in-out infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})
/** 스테레오에서는 오른쪽이 반 박자 늦다. 모노는 같이 울린다 */
export const speakerLate = style({ animationDelay: '0.7s' })

// 처음부터 — 하는 일 세 걸음
export const steps = style({
  margin: 0,
  padding: `0 0 0 ${String(GAP.wide + 2)}px`,
  fontSize: TEXT.tiny,
  lineHeight: '22px',
  color: vars.ink.normal,
})

// 닫는다 — 바꾼 것 목록
export const diff = style({ fontSize: TEXT.small, lineHeight: '24px' })
export const diffOld = style({ color: vars.ink.faint })
export const diffNew = style({ color: vars.emphasis.one, fontWeight: 700 })

// ─────────────────────────────────────────────────────────────────
// 되묻는 창 — 「처음부터」는 덮개 위에, 「닫을 때」는 창 안 아래 띠 위에 선다
// ─────────────────────────────────────────────────────────────────

/** 닫을 때 예/아니오 — 아래 띠 위 오른쪽. 띠(미리보기 112 + 안쪽 여백 + 선)와 바닥(28) 위로 올린다 */
export const closeAsk = style({
  position: 'absolute',
  right: GAP.wide,
  bottom: 28 + 112 + GAP.small * 2 + 1 + GAP.small,
})

/** 「처음부터」 되묻기 — 덮개 가운데에 물음 창 · 예/아니오 · 안내를 세로로 */
export const confirmCol = style({
  display: 'grid',
  justifyItems: 'center',
  rowGap: GAP.wide,
  padding: GAP.loose,
  pointerEvents: 'none',
})

/** 물음 창. 롬 글꼴 19 / 30 — 필드 대사창과 같은 말씨다. 줄머리를 왼쪽에 맞춘다 */
export const confirmPrompt = style({
  ...WINDOW_SMALL,
  boxSizing: 'border-box',
  maxWidth: 620,
  padding: `${GAP.base + 2}px ${GAP.loose}px`,
  fontFamily: vars.font.pixel,
  fontSize: TEXT.list + 2,
  lineHeight: `${String(LINE.message)}px`,
  whiteSpace: 'pre-line',
  color: vars.ink.normal,
})

/** 안내 — 덮개 위라 작은 창 한 장 안의 키캡이다 (§0 L6) */
export const confirmHint = style({
  ...WINDOW_SMALL,
  boxSizing: 'border-box',
  padding: `${GAP.tight}px ${GAP.base}px`,
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  whiteSpace: 'nowrap',
})

// ─────────────────────────────────────────────────────────────────
// 글쇠 — 시점 미리보기의 「V」 · 「휠」과 행동 줄의 「Z」
// ─────────────────────────────────────────────────────────────────

export const cap = style({ ...KEYCAP })

/** 「처음부터」 되묻기의 예/아니오 자리 — 뜨는 창은 `absolute`라 자리를 이 상자가 잡아 준다 */
export const confirmChoices = style({
  position: 'relative',
  width: 176,
  height: LINE.row * 2 + GAP.small * 2 + EDGE.window * 2,
  pointerEvents: 'auto',
})
