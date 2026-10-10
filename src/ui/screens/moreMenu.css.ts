// 「더보기」 — 「더보기」 칸 위로 뜨는 창 하나 (`PopAbove`). 가운데 모달과 덮개가 없다.
//
// 큰 줄(52 = 이름 17/700 + 부연 12)이고 고른 줄은 금 띠 하나가 세로로 미끄러진다. 안 고른 줄은 아무것도 아니다.
// 창 바깥을 누르면 닫히는 것은 투명한 막(`backdrop`)이 받는다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { RULE } from '../theme/window.css'

/** 큰 줄 높이 — 이름 한 줄 + 부연 한 줄 */
export const ROW = 52
export const WIDTH = 330

/** 창 바깥을 받는 투명한 막. 타이틀 위, 뜨는 창 아래다 */
export const backdrop = style({ position: 'fixed', inset: 0, zIndex: 20 })

export const list = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
})

/** 고를 것 하나 */
export const item = style({
  position: 'relative',
  zIndex: 1,
  appearance: 'none',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 2,
  height: ROW,
  padding: `0 ${String(GAP.base)}px 0 ${String(GAP.loose)}px`,
  border: 'none',
  background: 'none',
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    // ⚠️ **브라우저 포커스 링을 따로 안 돌린다** — 표시는 금 띠(`pickBand`)가 한다. 링을 남기면 게임 커서와
    // 브라우저 커서 둘이 한 창에 선다
    '&:focus-visible': { outline: 'none' },
  },
})

export const itemOn = style({ color: vars.pick.text })

export const name = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small - 2,
  fontSize: TEXT.list,
  fontWeight: 700,
})

export const sub = style({
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

export const subOn = style({ color: vars.pick.text })

/** 안 본 것이 있다는 점 — 「패치노트」 줄에만 붙는다 */
export const dot = style({
  width: 6,
  height: 6,
  borderRadius: RADIUS.round,
  background: vars.pick.edge,
})

export const foot = style({
  marginTop: GAP.small,
  padding: `${String(GAP.small)}px ${String(GAP.small)}px 0`,
  borderTop: RULE,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})
