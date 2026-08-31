// 지역 이름표 — 맵을 넘을 때 위에서 잠깐 내려온다.
//
// ⚠️ **알약이 아니다** (DESIGN.md §2 금지 목록). 원작에 알약 UI가 없고,
// 이름표는 창이 밀려 들어오는 것이다 — 창 한 벌을 그대로 쓴다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, TEXT } from '../theme/scale'
import { WINDOW_SMALL } from '../theme/window.css'

const appear = keyframes({
  '0%': { opacity: 0, transform: 'translate(-50%, -8px)' },
  '12%': { opacity: 1, transform: 'translate(-50%, 0)' },
  '80%': { opacity: 1, transform: 'translate(-50%, 0)' },
  '100%': { opacity: 0, transform: 'translate(-50%, -8px)' },
})

export const banner = style({
  ...WINDOW_SMALL,
  position: 'fixed',
  top: GAP.loose,
  left: '50%',
  padding: `${GAP.small}px ${GAP.loose}px`,
  fontFamily: vars.font.pixel,
  fontSize: TEXT.base,
  fontWeight: 700,
  pointerEvents: 'none',
  zIndex: 100,
  animation: `${appear} 2.6s ease forwards`,
})
