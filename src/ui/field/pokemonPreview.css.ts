// 미리보기 창 — 대사창과 같은 판을 쓰되 그림 하나만 든다.
//
// 원작은 아래 화면에 창을 하나 더 얹지만 우리는 원 스크린이라 대사창 바로
// 위에 세운다. 대사와 겹치면 안 되는 것이 이 창의 유일한 배치 조건이다.
import { keyframes, style } from '@vanilla-extract/css'

const rise = keyframes({
  from: { opacity: 0, transform: 'translate(-50%, 8px) scale(0.94)' },
  to: { opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
})

export const frame = style({
  position: 'fixed',
  left: '50%',
  // 대사창이 아래 24px에 60px 높이로 서 있다. 그 위에 여유를 두고 얹는다
  bottom: 108,
  transform: 'translateX(-50%)',
  zIndex: 201,
  width: 132,
  height: 132,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 2px rgba(255, 255, 255, 0.7)',
  animation: `${rise} 0.22s ease-out`,
  pointerEvents: 'none',
})

export const art = style({
  width: 112,
  height: 112,
  objectFit: 'contain',
  // 도트 그림이다. 부드럽게 늘리면 원작이 아니게 된다
  imageRendering: 'pixelated',
})
