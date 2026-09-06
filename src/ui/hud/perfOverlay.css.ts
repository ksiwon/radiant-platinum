// 개발용 계기판 (개발 서버에서만 뜬다).
//
// ⚠️ **일부러 게임 창이 아니다** (DESIGN.md §3). 게임 화면 위에 얹히는 연장이라
// 창 한 벌을 쓰면 게임 UI로 잘못 읽힌다. 배포물에는 안 실린다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'

export const overlay = style({
  position: 'fixed',
  top: GAP.small,
  left: GAP.small,
  padding: `${GAP.tight + 2}px ${GAP.small + 2}px`,
  background: vars.dev.bg,
  border: `1px solid ${vars.dev.edge}`,
  borderRadius: RADIUS.bar,
  color: vars.dev.text,
  fontFamily: vars.font.mono,
  fontSize: TEXT.tiny,
  lineHeight: 1.5,
  pointerEvents: 'none',
  whiteSpace: 'pre',
  zIndex: 100,
})

/** 머리줄이 곧 여닫는 단추다 */
export const head = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
  width: '100%',
  pointerEvents: 'auto',
  cursor: 'pointer',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
})

/** 접혔는지 폈는지 */
export const mark = style({ marginLeft: 'auto', opacity: 0.55 })

export const good = style({ color: vars.state.good })
export const bad = style({ color: vars.state.bad })
