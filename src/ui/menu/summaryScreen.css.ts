// 요약 화면 (`.audit/menu-ui/summary.md` §4 · PARITY §5 · `applications/pokemon_summary_screen`).
//
// ⚠️ **판을 늘어놓지 않는다.** 원작은 왼쪽에 포켓몬 한 마리가 크게 서 있고 오른쪽 한 장에만 글이 있다 — 값마다
// 상자를 두르면 표가 되고, 표는 원작과 아주 다르게 보인다. 선은 파티 줄과 무대 사이 하나와 쪽 안의 묶음 가름뿐이고
// 안쪽은 전부 글줄이다.
//
// 쪽 색(`vars.page.*`)은 **탭 표식과 포켓몬 뒤 원 빛에만** 쓴다 (결정) — 판을 그 색으로 칠하지 않는다.
// 숫자는 Pretendard `tabular-nums`다 (mono 금지). 도트는 정수배뿐이다 (그림 240 = 80 × 3 · 아이콘 32 = ×1).
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT, TIME } from '../theme/scale'
import { PICKED, RULE } from '../theme/window.css'

/** 본문의 세 칸 — 파티 줄 · 무대 · 장 */
const STRIP = 56
const STAGE = 344

export const body = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `${String(STRIP)}px ${String(STAGE)}px minmax(0, 1fr)`,
})

// ── 파티 줄 ──────────────────────────────────────────────────────────────────

/** 세로 가운데에 아이콘이 선다. 파티 줄과 무대 사이에만 선이 있다 */
export const strip = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP.small,
  borderRight: RULE,
})

export const slot = style({
  appearance: 'none',
  width: 44,
  height: 40,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  border: 'none',
  borderRadius: RADIUS.cell,
  background: 'transparent',
  cursor: 'pointer',
})

/** 지금 마리 — 파티 화면 · 탭과 같은 금 한 벌 */
export const slotOn = style({
  ...PICKED,
  border: 'none',
})

/** 파티 아이콘 한 칸. 크기와 위치는 `monIconAt`이 인라인으로 준다 (32, 정수배) */
export const slotIcon = style({
  display: 'block',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

// ── 무대 (왼쪽) ──────────────────────────────────────────────────────────────

export const stage = style({
  position: 'relative',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '16px 20px 18px',
  // 쪽 색은 이 변수 하나로 온다 — 원 빛이 따라 바뀐다
  vars: { '--page': vars.page.info },
})

export const idRow = style({
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  minWidth: 0,
})

export const ballIcon = style({ flex: '0 0 auto', imageRendering: 'pixelated', backgroundRepeat: 'no-repeat' })

export const name = style({
  fontSize: 22,
  fontWeight: 700,
  color: vars.ink.strong,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 색이 다른 개체의 별. 도감 번호도 붉게 뜬다 (`SUMMARY_TEXT_RED`) */
export const shiny = style({ color: vars.pick.edge, fontSize: TEXT.small })

/** 다 나은 뒤에 남는 작은 점 (`SUMMARY_SPRITE_POKERUS_CURED_ICON`) — 노력치가 계속 두 배라는 표시다 */
export const pokerusCured = style({ color: vars.state.female, fontSize: TEXT.tiny })

export const lvRow = style({
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.tight,
  margin: '2px 0 0 32px',
  color: vars.ink.strong,
})
export const lvSmall = style({ fontSize: TEXT.tiny, fontWeight: 700, color: vars.ink.dim })
export const lvBig = style({ fontSize: TEXT.big, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' })

export const portraitWrap = style({
  position: 'relative',
  width: 280,
  height: 268,
  display: 'grid',
  placeItems: 'center',
  marginTop: 2,
  flex: '0 0 auto',
})

/**
 * 뒤의 원 빛 — 바깥 고리(14%)와 안쪽(42%) 두 겹의 색 원이다. 쪽이 바뀌면 `--page`가 바뀌고, 색 값이 바뀌므로
 * `background-color`가 `TIME.fade` 동안 섞인다 (그러데이션은 보간이 안 되어 색 원 둘로 쌓았다)
 */
export const glowOuter = style({
  position: 'absolute',
  left: 0,
  top: 0,
  width: 280,
  height: 280,
  borderRadius: RADIUS.round,
  backgroundColor: `color-mix(in srgb, var(--page) 14%, transparent)`,
  transition: `background-color ${TIME.fade}`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})
export const glowInner = style({
  position: 'absolute',
  left: 24,
  top: 24,
  width: 232,
  height: 232,
  borderRadius: RADIUS.round,
  backgroundColor: `color-mix(in srgb, var(--page) 42%, transparent)`,
  transition: `background-color ${TIME.fade}`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

/** 받침 — `GroundShadow`가 그린다. 자리만 잡는다 */
export const plinth = style({ position: 'absolute', left: 70, bottom: 26 })

// 마리를 넘기면 그림이 누른 방향에서 12px 내려오며 나타나고 4px 한 번 뛴다. 입력을 막지 않는다
const drop = keyframes({
  from: { transform: 'translateY(-12px)', opacity: 0 },
  to: { transform: 'translateY(0)', opacity: 1 },
})
const hop = keyframes({ '50%': { transform: 'translateY(-4px)' } })

/** 그림 — 80 × 3 = 240. 정수배라 도트 폭이 고르다 */
export const portrait = style({
  position: 'relative',
  width: 240,
  height: 240,
  imageRendering: 'pixelated',
  animation: `${drop} 0.16s ease-out, ${hop} 0.22s ease-out 0.16s`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})
/** 알은 그림이 없다 — 자리만 비운다 */
export const portraitGap = style({ width: 240, height: 240 })

export const chips = style({ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 })

export const statusSlot = style({ marginTop: GAP.small, minHeight: 20, display: 'flex' })

/** 지닌 도구 — 무대 맨 아래, 선 위 */
export const held = style({
  marginTop: 'auto',
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  paddingTop: GAP.base,
  borderTop: RULE,
})
export const heldIcon = style({ flex: '0 0 auto', imageRendering: 'pixelated', backgroundRepeat: 'no-repeat' })
export const heldText = style({ display: 'flex', flexDirection: 'column', minWidth: 0 })
export const heldLabel = style({ fontSize: TEXT.tiny, fontWeight: 700, color: vars.ink.dim })
export const heldName = style({ fontSize: TEXT.base, fontWeight: 700, color: vars.ink.strong })

// ── 장 (오른쪽) ──────────────────────────────────────────────────────────────

export const sheet = style({
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  padding: '24px 28px 20px',
  overflow: 'hidden',
})

// 쪽이 바뀌면 장이 들어오는 방향에서 8px 밀려 들어온다. `--dir`이 방향(1 · −1)이다
const slideIn = keyframes({
  from: { transform: 'translateX(calc(8px * var(--dir, 1)))', opacity: 0 },
  to: { transform: 'translateX(0)', opacity: 1 },
})
export const page = style({
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  animation: `${slideIn} ${TIME.page} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 정보 쪽의 묶음. 묶음 사이만 선이다 */
export const group = style({
  selectors: { '& + &': { marginTop: GAP.base + 2, paddingTop: GAP.base + 2, borderTop: RULE } },
})

/** 한 줄 = 이름표 + 값. 이름표 폭을 못 박아 값이 세로로 줄을 맞춘다 */
export const line = style({ display: 'flex', alignItems: 'baseline', minHeight: 40, gap: 0 })
export const key = style({ flex: '0 0 112px', fontSize: 13, fontWeight: 700, color: vars.ink.dim })
export const value = style({
  fontSize: 18,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
  minWidth: 0,
})
export const valueBig = style({ fontSize: TEXT.big, fontWeight: 700, lineHeight: 1 })
export const typeRow = style({ display: 'flex', alignItems: 'center', gap: 6 })

/** 원트레이너 이름의 색은 **성별**로 갈린다 (`SUMMARY_TEXT_BLUE`/`RED`) */
export const otMale = style({ color: vars.state.male, fontWeight: 700 })
export const otFemale = style({ color: vars.state.female, fontWeight: 700 })

export const expRow = style({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 38 })
export const expValue = style({ fontSize: 22, fontWeight: 700, color: vars.ink.strong, fontVariantNumeric: 'tabular-nums' })

/** 경험치 막대 — 504 × 12. 양끝에 현재 레벨과 다음 레벨 */
export const barEnds = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginTop: GAP.small,
  fontSize: 13,
  fontWeight: 700,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})
export const expTrack = style({
  display: 'block',
  position: 'relative',
  flex: 1,
  height: 12,
  boxSizing: 'content-box',
  overflow: 'hidden',
  border: `${String(EDGE.bar)}px solid ${vars.bar.edge}`,
  borderRadius: RADIUS.bar,
  background: `linear-gradient(180deg, ${vars.bar.trackTop}, ${vars.bar.trackBottom})`,
})
// ⚠️ `span`은 기본이 인라인이라 **높이가 안 먹는다** — `display: block`이 꼭 있어야 한다
export const expFill = style({
  display: 'block',
  height: '100%',
  minWidth: 2,
  background: 'linear-gradient(180deg, var(--body) 0 25%, var(--lit) 25% 75%, var(--body) 75% 100%)',
})

// ── 메모 쪽 ──────────────────────────────────────────────────────────────────

/**
 * 트레이너 메모 — 공책 줄이 장 끝까지 깔린다. 원작은 줄 번호를 그대로 지켜서 **사이가 비는 것이 뜻**이다(성격과
 * 만난 자리가 붙어 있고 개성은 한 칸 아래다). 줄 번호가 곧 공책 줄 번호다
 */
export const memo = style({
  flex: 1,
  margin: '0 -4px',
  padding: '0 4px',
  fontSize: 18,
  lineHeight: '40px',
  color: vars.ink.strong,
  whiteSpace: 'pre-line',
  backgroundImage: `repeating-linear-gradient(180deg, transparent 0 39px, ${vars.window.rule} 39px 40px)`,
})
export const memoRow = style({ height: 40 })

/** 문장 틀 안의 `{COLOR 1}` 구간 — 만난 자리 이름이 여기 들어간다 (`emphasis.two`) */
export const accent = style({ color: vars.emphasis.two, fontWeight: 700 })

// ── 능력 쪽 ──────────────────────────────────────────────────────────────────

export const hpHead = style({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: GAP.small })
export const hpValue = style({ fontSize: 22, fontWeight: 700, color: vars.ink.strong, fontVariantNumeric: 'tabular-nums' })

export const statsBody = style({
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  columnGap: GAP.base,
  alignItems: 'center',
  margin: '18px 0 8px',
})

export const chart = style({ display: 'block', overflow: 'visible' })
const chartLabel = { fontFamily: vars.font.ui, fontSize: 13, fontWeight: 700 } as const
export const chartText = style({ ...chartLabel, fill: vars.ink.dim })
/** 성격이 올린 꼭짓점의 이름은 빨강, 내린 쪽은 파랑 */
export const chartUp = style({ ...chartLabel, fill: vars.state.bad })
export const chartDown = style({ ...chartLabel, fill: vars.state.male })

/** 육각형 옆의 능력치 줄 — 값과 ▲▼는 `StatTable`이 그린다. 줄 높이만 키운다 */
export const statSide = style({
  display: 'grid',
  gap: 6,
  minWidth: 0,
  fontSize: 22,
})

export const ability = style({ marginTop: 'auto', paddingTop: GAP.base + 2, borderTop: RULE })
export const abilityHead = style({ display: 'flex', alignItems: 'baseline', gap: GAP.base + 2 })
export const abilityName = style({ fontSize: TEXT.title, fontWeight: 700, color: vars.ink.strong })
export const abilityText = style({ margin: '6px 0 0', fontSize: TEXT.base, lineHeight: 1.6, color: vars.ink.normal })

// ── 기술 쪽 ──────────────────────────────────────────────────────────────────

export const moveList = style({ display: 'flex', flexDirection: 'column', gap: GAP.tight })

const moveBase = {
  position: 'relative',
  boxSizing: 'border-box',
  height: 52,
  display: 'flex',
  alignItems: 'center',
  padding: '0 14px 0 26px',
  borderRadius: RADIUS.cell,
  fontSize: 18,
  fontWeight: 700,
  color: vars.ink.strong,
} as const

export const move = styleVariants({
  off: [moveBase],
  /** 커서 줄 — 금 띠. 안 고른 줄은 아무것도 아니다 */
  on: [moveBase, { ...PICKED, border: 'none' }],
  /** 자리 바꾸기에서 먼저 고른 칸 — 테두리만 남기고 깜박인다 (`SUMMARY_SPRITE_MOVE_SELECTOR_2`) */
  from: [moveBase, { boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}` }],
  empty: [moveBase, { opacity: 0.42 }],
})

const blink = keyframes({ '50%': { boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px transparent` } })
export const moveFrom = style({
  animation: `${blink} ${TIME.blink} steps(1, end) infinite`,
})


/** 먼저 고른 줄의 작은 「교체」 표 (뱅크 455의 152) */
export const swapTag = style({
  position: 'absolute',
  right: 96,
  top: '50%',
  transform: 'translateY(-50%)',
  padding: '1px 6px',
  borderRadius: RADIUS.bar,
  background: vars.pick.face,
  color: vars.pick.text,
  fontSize: TEXT.tiny,
  fontWeight: 700,
})

/** 다섯째 줄(새 기술) 위의 가는 선 */
export const teachRule = style({ height: 0, borderTop: RULE, margin: `${String(GAP.tight)}px 0` })

export const detail = style({ marginTop: 'auto', paddingTop: GAP.wide, borderTop: RULE })
export const facts = style({ display: 'flex', gap: 44 })
export const fact = style({ display: 'flex', flexDirection: 'column' })
export const factLabel = style({ fontSize: 13, fontWeight: 700, color: vars.ink.dim })
export const factValue = style({
  fontSize: 26,
  lineHeight: 1.25,
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})
export const moveText = style({
  margin: '10px 0 0',
  minHeight: 52,
  fontSize: TEXT.base,
  lineHeight: 1.6,
  color: vars.ink.normal,
})
