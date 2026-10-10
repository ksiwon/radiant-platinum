// 메일박스 — 덮는 창. 왼쪽이 보낸 이 목록(큰 줄 44), 오른쪽이 고른 메일의 실제 모습(`MailSheet`)이다.
//
// 목록은 스크롤 목록(스무 줄 × 44)이라 고른 줄이 즉시 옮겨 가고(§0 L5) 위치는 `ScrollKnob`이 보인다. 갈래 창 · 예/아니오 ·
// 지닐 포켓몬 고르기는 고른 줄 옆에 뜨는 창(`ChoiceMenu` · `YesNo`)이고, 그 물음은 창 안 아래 글 띠(`MessageDock`)가 한다.
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

export const label = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 줄 오른쪽 끝의 편지지 이름 */
export const paper = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontSize: TEXT.small,
  color: vars.ink.dim,
})

export const detail = style({
  minWidth: 0,
  paddingLeft: GAP.wide,
  borderLeft: RULE,
})

/** 지닐 포켓몬 줄 — 아이콘 32 + 이름 + 지닌 도구 아이콘 */
export const monRow = style({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  minWidth: 0,
})

export const monName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const held = style({ marginLeft: 'auto', flex: '0 0 auto' })
