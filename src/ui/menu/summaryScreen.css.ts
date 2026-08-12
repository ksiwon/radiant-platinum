// 요약 화면 (PARITY §5 · `applications/pokemon_summary_screen`).
//
// ⚠️ **판을 늘어놓지 않는다.** 원작은 왼쪽에 포켓몬 한 마리가 크게 서 있고
// 오른쪽 한 장에만 글이 있다 — 값마다 상자를 두르면 표가 되고, 표는 원작과
// 아주 다르게 보인다. 여기서 테두리를 갖는 것은 **왼쪽 기둥과 오른쪽 장** 둘뿐이고
// 안쪽은 전부 글줄이다.
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

const EDGE = 'rgba(255, 255, 255, 0.08)'

/** 왼쪽 기둥(포켓몬)과 오른쪽 장(쪽). 기둥이 좁고 고정이다 */
export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '186px minmax(0, 1fr)',
  gap: 16,
  padding: '10px 14px',
})

// ── 왼쪽 기둥 ────────────────────────────────────────────────────────────────

export const rail = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  paddingTop: 4,
})

/** 그림. 배틀 그림을 그대로 쓴다 — 파티 화면과 같은 자료다 */
export const portrait = style({
  width: 150,
  height: 150,
  objectFit: 'contain',
  imageRendering: 'pixelated',
  filter: 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.45))',
})

/** 알은 그림이 없다 — 자리만 비우고 아래 글로 알린다 */
export const portraitGap = style({ width: 150, height: 150 })

export const nameRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 5,
  fontSize: 18,
  fontWeight: 700,
})

export const male = style({ color: '#7fb0ff', fontSize: 15 })
export const female = style({ color: '#ff92ab', fontSize: 15 })

export const level = style({
  fontSize: 13,
  opacity: 0.72,
  fontVariantNumeric: 'tabular-nums',
})

/** 색이 다른 개체의 별. 도감 번호도 붉게 뜬다 (`SUMMARY_TEXT_RED`) */
export const shiny = style({ color: '#ffd257', fontSize: 14 })

/** 지닌 도구 한 줄. 없으면 이 줄이 아예 없다 — 원작도 빈칸을 안 남긴다 */
export const held = style({
  marginTop: 6,
  fontSize: 12,
  opacity: 0.66,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
})

export const heldIcon = style({
  width: 24,
  height: 24,
  objectFit: 'none',
  imageRendering: 'pixelated',
})

// ── 오른쪽 장 ────────────────────────────────────────────────────────────────

export const page = style({
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  overflowY: 'auto',
  overflowX: 'hidden',
  paddingRight: 4,
  scrollbarWidth: 'thin',
})

/**
 * 한 줄 = 이름표 + 값.
 *
 * 이름표 폭을 못 박아 값이 세로로 줄을 맞춘다. 격자를 쓰면 빈 칸에도 선이
 * 생기는데, 원작은 이름표와 값 사이가 그냥 여백이다
 */
export const line = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontSize: 15,
  lineHeight: 1.75,
})

export const key = style({
  flex: '0 0 92px',
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.5,
})

export const value = style({
  flex: '1 1 auto',
  fontVariantNumeric: 'tabular-nums',
})

/** 원트레이너 이름의 색은 **성별**로 갈린다 (`SUMMARY_TEXT_BLUE`/`RED`) */
export const otMale = style([value, { color: '#7fb0ff' }])
export const otFemale = style([value, { color: '#ff92ab' }])

/** 값이 오른쪽에 붙는 줄 — 능력치처럼 자릿수를 맞춰 읽는 것 */
export const num = style([value, { textAlign: 'right', maxWidth: 92 }])

export const typeRow = style({
  display: 'flex',
  gap: 6,
  alignItems: 'center',
})

export const typeChip = style({
  padding: '1px 9px 2px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  color: '#0d1017',
  background: 'var(--tint)',
})

/** 경험치 막대. 다음 레벨까지 얼마나 남았는지가 숫자보다 먼저 보인다 */
// ⚠️ `span`은 기본이 인라인이라 **높이가 안 먹는다.** 막대가 통째로 안 보였다
export const expTrack = style({
  display: 'block',
  flex: '0 1 200px',
  height: 6,
  borderRadius: 3,
  background: 'rgba(255, 255, 255, 0.1)',
  overflow: 'hidden',
})

export const expFill = style({
  display: 'block',
  height: '100%',
  background: vars.hud.warn,
  minWidth: 2,
})

// ── 능력 쪽 ──────────────────────────────────────────────────────────────────

/** 여섯 능력치. 두 줄로 세우면 왼쪽이 HP·공격·방어, 오른쪽이 특공·특방·스피드다 */
export const stats = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  columnGap: 22,
})

/** 성격이 올리는 쪽에 빨강, 내리는 쪽에 파랑 (원작이 이름표 색을 바꾼다) */
export const statName = styleVariants({
  '': [key, { flex: '0 0 64px' }],
  up: [key, { flex: '0 0 64px', color: '#ff9f7a', opacity: 0.9 }],
  down: [key, { flex: '0 0 64px', color: '#82c8ff', opacity: 0.9 }],
})

export const hpBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 2,
})

export const hpTrack = style({
  display: 'block',
  flex: '0 1 220px',
  height: 7,
  borderRadius: 4,
  background: 'rgba(255, 255, 255, 0.1)',
  overflow: 'hidden',
})

export const hpFill = style({ display: 'block', height: '100%' })

// ── 기술 쪽 ──────────────────────────────────────────────────────────────────

export const moves = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
})

const moveBase = style({
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '5px 8px',
  borderRadius: 6,
  fontSize: 15,
})

export const move = styleVariants({
  off: [moveBase],
  on: [moveBase, {
    background: 'rgba(238, 243, 255, 0.13)',
    boxShadow: `inset 0 0 0 2px ${vars.hud.warn}`,
  }],
})

export const moveName = style({ flex: '1 1 auto' })

export const movePp = style({
  fontSize: 12,
  opacity: 0.66,
  fontVariantNumeric: 'tabular-nums',
})

/** 고른 기술의 위력·명중·설명. 쪽 아래에 붙어 자리가 안 흔들린다 */
export const moveDetail = style({
  marginTop: 8,
  paddingTop: 8,
  borderTop: `1px solid ${EDGE}`,
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: 'pre-line',
  opacity: 0.86,
  minHeight: 62,
})

export const moveFacts = style({
  display: 'flex',
  gap: 16,
  fontSize: 12,
  opacity: 0.6,
  marginBottom: 4,
  fontVariantNumeric: 'tabular-nums',
})

// ── 메모 쪽 ──────────────────────────────────────────────────────────────────

/**
 * 트레이너 메모.
 *
 * 원작은 줄 번호를 그대로 지켜서 **사이가 비는 것이 뜻**이다 — 성격과 만난
 * 자리가 붙어 있고 개성은 한 칸 아래다. 그 여백을 없애면 넉 줄이 뭉친다
 */
export const memo = style({
  fontSize: 15,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
})

export const memoRow = style({
  minHeight: '1.7em',
})

/** 문장 틀 안의 `{COLOR 1}` 구간 — 만난 자리 이름이 여기 들어간다 */
export const accent = style({
  color: vars.hud.warn,
  fontWeight: 600,
})
