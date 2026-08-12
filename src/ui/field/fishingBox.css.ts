// 낚시 표시 — 「!」 하나와 결과 한 줄.
//
// 창은 대사창과 **같은 것**을 쓴다 (`messageBox.css`). 원작도 낚시 글을 보통
// 대사창에 띄우므로 여기서 새 상자를 만들면 그 순간만 다른 게임처럼 보인다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/**
 * 「!」 말풍선. 원작은 머리 위에 뜨는 오버월드 애니메이션이라 3D 자리에
 * 붙지만, 우리 화면은 카메라가 자유롭게 돌아 머리 위가 화면 밖일 수 있다.
 * **화면 가운데 위**에 세워 어디를 보고 있어도 놓치지 않게 한다 —
 * 창을 놓치면 낚시가 성립하지 않는다
 */
const pop = keyframes({
  '0%': { transform: 'translateX(-50%) scale(0.4)', opacity: 0 },
  '40%': { transform: 'translateX(-50%) scale(1.25)', opacity: 1 },
  '100%': { transform: 'translateX(-50%) scale(1)', opacity: 1 },
})

export const bubble = style({
  position: 'fixed',
  left: '50%',
  top: '22%',
  zIndex: 210,
  transform: 'translateX(-50%)',
  fontFamily: vars.font.ui,
  fontSize: 64,
  fontWeight: 900,
  lineHeight: 1,
  color: '#ffe45c',
  textShadow: '0 0 18px rgba(255, 190, 40, 0.85), 0 4px 0 #7a4a00, 0 6px 14px rgba(0,0,0,0.6)',
  animation: `${pop} 0.18s ease-out`,
  userSelect: 'none',
  pointerEvents: 'none',
})

/** 찌를 보고 있는 동안의 잔잔한 표시. 「!」와 헷갈리면 안 되므로 작고 흐리다 */
const bob = keyframes({
  '0%, 100%': { transform: 'translateX(-50%) translateY(0)' },
  '50%': { transform: 'translateX(-50%) translateY(4px)' },
})

export const float = style({
  position: 'fixed',
  left: '50%',
  top: '26%',
  zIndex: 210,
  transform: 'translateX(-50%)',
  fontFamily: vars.font.ui,
  fontSize: 26,
  color: 'rgba(255, 255, 255, 0.7)',
  textShadow: '0 2px 8px rgba(0, 0, 0, 0.7)',
  animation: `${bob} 1.1s ease-in-out infinite`,
  userSelect: 'none',
  pointerEvents: 'none',
})
