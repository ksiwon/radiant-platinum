// 배틀팩토리 — 빌린 여섯을 고르는 판과 바꾸는 판.
//
// ⚠️ **원작은 두 화면이다** — 위 화면에 여섯이 늘어서고 아래 화면이 그 하나의
// 값을 보여 준다. 한 화면에서는 그 배치가 성립하지 않으므로 BDSP의 배틀타워
// 대여 화면처럼 **왼쪽 목록 · 오른쪽 상세**로 옮긴다 (PARITY §12.4).
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 고른 줄의 띠. 메뉴 공용 틀과 같은 색이다 (`menuChrome.css`) */
const PICK_BG = 'linear-gradient(180deg, #eef3ff 0%, #cddaf4 100%)'
const PICK_TEXT = '#111726'
const HOVER = 'rgba(255, 255, 255, 0.08)'

/**
 * 목록과 상세.
 *
 * ⚠️ **창 높이를 다 쓴다** (`flex: 1 1 auto`). 안 그러면 여섯 줄짜리 목록이
 * 창 위쪽에만 붙고 아래 절반이 빈 채로 남는다 — 공용 `stage`가 그래서
 * `flex`를 가진다
 */
export const board = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
  gap: 14,
  padding: '10px 14px',
})

export const column = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 0,
})

export const columnTitle = style({
  fontSize: 13,
  letterSpacing: '0.08em',
  opacity: 0.7,
})

const monRow = style({
  display: 'grid',
  gridTemplateColumns: '32px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 10,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid transparent',
})

export const rowState = styleVariants({
  idle: [monRow, {}],
  on: [monRow, { background: PICK_BG, color: PICK_TEXT, borderColor: vars.panel.border }],
  picked: [monRow, { background: HOVER, borderColor: vars.hud.accent }],
  pickedOn: [monRow, { background: PICK_BG, color: PICK_TEXT, borderColor: vars.hud.accent }],
})

export const badge = style({
  fontSize: 12,
  fontWeight: 700,
  minWidth: 18,
  textAlign: 'center',
  color: vars.hud.accent,
})

export const monName = style({
  fontSize: 15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const monSub = style({
  fontSize: 12,
  opacity: 0.72,
})

export const types = style({ display: 'flex', gap: 4 })

export const typeChip = style({
  fontSize: 11,
  fontWeight: 700,
  padding: '1px 6px',
  borderRadius: 999,
  color: '#fff',
})

export const moves = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '4px 12px',
  marginTop: 8,
  fontSize: 13,
})

export const statLine = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(6, 1fr)',
  gap: 6,
  marginTop: 10,
  fontSize: 12,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
})

export const statName = style({ opacity: 0.6, fontSize: 11 })

export const banner = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  padding: '8px 12px',
  borderRadius: 8,
  background: HOVER,
  fontSize: 14,
})

export const bannerBig = style({ fontSize: 20, fontWeight: 700, color: vars.hud.accent })

export const hintLine = style({ fontSize: 13, opacity: 0.8, marginTop: 6 })
