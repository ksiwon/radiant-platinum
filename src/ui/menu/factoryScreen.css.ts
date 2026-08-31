// 배틀팩토리 — 빌린 여섯을 고르는 판과 바꾸는 판.
//
// ⚠️ **원작은 두 화면이다** — 위 화면에 여섯이 늘어서고 아래 화면이 그 하나의
// 값을 보여 준다. 한 화면에서는 그 배치가 성립하지 않으므로 BDSP의 배틀타워
// 대여 화면처럼 **왼쪽 목록 · 오른쪽 상세**로 옮긴다 (PARITY §12.4).
import { style, styleVariants } from '@vanilla-extract/css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { vars } from '../theme/contract.css'

// ⚠️ 고른 줄의 띠를 여기서 다시 적지 않는다 — 창 한 벌의 것을 쓴다
// (`theme/window.css`). 한때 이 세 줄이 `menuChrome`의 복붙이었고,
// 그래서 한쪽만 고쳐지고 다른 쪽은 안 따라오는 자리였다

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
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.dim,
})

const monRow = style({
  display: 'grid',
  gridTemplateColumns: '32px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 10,
  padding: `${GAP.tight + 2}px ${GAP.small + 2}px`,
  borderRadius: RADIUS.cell,
  border: '2px solid transparent',
})

export const rowState = styleVariants({
  idle: [monRow, {}],
  on: [monRow, { background: vars.pick.face, color: vars.pick.text, borderColor: vars.pick.edge }],
  picked: [monRow, { borderColor: vars.state.good }],
  pickedOn: [monRow, {
    background: vars.pick.face, color: vars.pick.text, borderColor: vars.state.good,
  }],
})

export const badge = style({
  fontSize: 12,
  fontWeight: 700,
  minWidth: 18,
  textAlign: 'center',
  color: vars.state.good,
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
  fontSize: TEXT.tiny,
  fontWeight: 700,
  padding: '1px 7px',
  border: `1px solid ${vars.bar.edge}`,
  borderRadius: RADIUS.bar,
  color: vars.status.text,
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

export const statName = style({ color: vars.ink.faint, fontSize: TEXT.tiny })

export const banner = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  padding: `${GAP.small}px ${GAP.base}px`,
  borderRadius: RADIUS.cell,
  boxShadow: `inset 0 0 0 1px ${vars.window.rule}`,
  fontSize: TEXT.small,
})

export const bannerBig = style({ fontSize: 20, fontWeight: 700, color: vars.state.good })

export const hintLine = style({ fontSize: 13, opacity: 0.8, marginTop: 6 })
