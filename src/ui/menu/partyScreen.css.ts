// 포켓몬 화면.
//
// HP 막대가 이 화면의 본론이다. 숫자만 있으면 여섯 마리 상태가 한눈에 안 들어와서,
// 원작도 막대를 크게 그리고 색을 세 단계로 나눈다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const slotName = style({
  minWidth: 96,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const level = style({
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.85,
  fontSize: 15,
})

export const status = style({
  padding: '1px 7px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  background: vars.hud.warn,
  color: '#170a08',
})

export const hpWrap = style({
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
})

export const hpTrack = style({
  width: 110,
  height: 8,
  borderRadius: 999,
  background: 'rgba(0, 0, 0, 0.35)',
  overflow: 'hidden',
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
})

export const hpFill = style({
  display: 'block',
  height: '100%',
  borderRadius: 999,
  transition: 'width 0.2s ease-out',
})

export const hpText = style({
  fontVariantNumeric: 'tabular-nums',
  fontSize: 14,
  minWidth: 66,
  textAlign: 'right',
})

export const summary = style({
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minHeight: 0,
  overflowY: 'auto',
})

export const summaryTitle = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontSize: 21,
  fontWeight: 700,
})

export const dexNo = style({
  fontSize: 14,
  opacity: 0.6,
  fontVariantNumeric: 'tabular-nums',
})

export const stats = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '4px 18px',
})

export const statRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 16,
  padding: '3px 0',
  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
})

/** 성격 보정 화살표. 값이 아니라 이름 쪽에 붙는다 — 원작도 그렇다 */
export const statName = style({
  opacity: 0.8,
  selectors: {
    '&[data-nature="up"]::after': { content: '"▲"', color: vars.hud.accent, fontSize: 11, marginLeft: 3 },
    '&[data-nature="down"]::after': { content: '"▼"', color: vars.hud.warn, fontSize: 11, marginLeft: 3 },
  },
})

export const statValue = style({
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
})

export const moves = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
})

export const moveRow = style({
  display: 'flex',
  fontSize: 16,
  padding: '5px 10px',
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.05)',
})
