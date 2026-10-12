// 볼캡슐 편집기 — 덮는 창. 왼쪽이 캡슐 열둘 또는 칸 여덟의 목록이고, 오른쪽이 고른 캡슐의 칸 배치(3×3에서 가운데를 뺀 것)다.
//
// 칸 배치는 편집기 좌표의 고정 격자다(`engine/world/ballCapsule`의 `CAPSULE_SLOTS`). 가운데는 볼이 선다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, LINE, TEXT } from '../theme/scale'
import { RULE, row as windowRow, rowOn } from '../theme/window.css'

export const body = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '320px minmax(0, 1fr)',
  columnGap: GAP.wide,
  padding: `${String(GAP.small)}px ${String(GAP.wide)}px ${String(GAP.base)}px`,
})

export const listBox = style({ position: 'relative', minHeight: 0 })

export const scroller = style({
  position: 'absolute',
  inset: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarWidth: 'none',
  selectors: { '&::-webkit-scrollbar': { display: 'none' } },
})

const tall = {
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
  height: LINE.rowTall,
  paddingLeft: GAP.base + 2,
} as const

export const row = style([windowRow, tall])
export const rowPicked = style([rowOn, tall])

export const label = style({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })

/** 줄 오른쪽 끝의 붙은 포켓몬 · 장수 */
export const aside = style({ marginLeft: 'auto', flex: '0 0 auto', paddingRight: GAP.base, fontSize: TEXT.small, color: vars.ink.dim })

export const detail = style({
  minWidth: 0,
  paddingLeft: GAP.wide,
  borderLeft: RULE,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
})

/** 칸 배치 — 3×3 */
export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gridTemplateRows: 'repeat(3, 1fr)',
  gap: GAP.small,
  width: '100%',
  maxWidth: 360,
  aspectRatio: '1 / 1',
})

const cell = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  minWidth: 0,
  padding: GAP.small,
  fontSize: TEXT.small,
  overflow: 'hidden',
} as const

export const slot = style([windowRow, cell])
export const slotPicked = style([rowOn, cell])
/** 가운데 — 볼 자리. 비어 있다 */
export const ball = style({ ...cell, color: vars.ink.dim })
