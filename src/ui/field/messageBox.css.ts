// 대사창 — 원작 배치. 화면 아래에 붙은 두 줄짜리 창이다.
//
// 창 높이를 **두 줄로 못 박는다.** 원작 창이 27×4타일이고 글꼴 높이로 정확히
// 두 줄이라, \r(비우기)과 \f(한 줄 올리기)가 여기서 갈린다. 늘어나는 창으로
// 만들면 그 구분이 화면에서 사라진다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 원작 창의 가로세로비 27:4. 그것보다 넓어지지 않게 최대 폭을 둔다 */
const MAX_WIDTH = 760

export const frame = style({
  position: 'fixed',
  left: '50%',
  bottom: 24,
  transform: 'translateX(-50%)',
  width: `min(calc(100vw - 48px), ${MAX_WIDTH}px)`,
  zIndex: 200,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  pointerEvents: 'none',
})

export const box = style({
  position: 'relative',
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 2px rgba(255, 255, 255, 0.7)',
  color: '#20263a',
  padding: '14px 26px 14px 20px',
  fontSize: 19,
  lineHeight: '30px',
  // 두 줄 고정. 한 줄짜리 글도 창이 안 줄어든다 — 원작과 같다
  minHeight: 60,
})

export const line = style({
  whiteSpace: 'pre',
  height: 30,
})

export const run = style({
  verticalAlign: 'baseline',
})

const blink = keyframes({
  '0%, 45%': { opacity: 1, transform: 'translateY(0)' },
  '55%, 100%': { opacity: 0.25, transform: 'translateY(2px)' },
})

/** 다음을 기다리는 표시. 원작도 오른쪽 아래에서 깜빡인다 */
export const arrow = style({
  position: 'absolute',
  right: 10,
  bottom: 4,
  fontSize: 13,
  color: '#4a5a80',
  animation: `${blink} 0.7s steps(1, end) infinite`,
})

export const menu = style({
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 10px)',
  minWidth: 128,
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 2px rgba(255, 255, 255, 0.7)',
  color: '#20263a',
  padding: '8px 12px',
  fontSize: 18,
  lineHeight: '30px',
})

export const menuItem = style({
  paddingLeft: 22,
})

/** 고른 칸에 삼각 커서를 세운다. 원작도 색이 아니라 커서로 가리킨다 */
export const menuItemOn = style([menuItem, {
  position: 'relative',
  fontWeight: 700,
  selectors: {
    '&::before': {
      content: '"▶"',
      position: 'absolute',
      left: 2,
      fontSize: 12,
      lineHeight: '30px',
    },
  },
}])
