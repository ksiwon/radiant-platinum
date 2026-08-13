// 진화 장면.
//
// 화면에 있어야 할 것이 둘뿐이다 — **그림 하나와 글 한 줄**. 원작도 위 화면을
// 통째로 포켓몬에게 주고 아래에 글만 놓는다. 목록도 판도 놓지 않는다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const stage = style({
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: '1fr auto',
  gap: 18,
  placeItems: 'center',
  padding: '12px 0 4px',
})

/** 뒤의 영속 Canvas에서 그리는 모델을 보여 주는 투명한 무대 창. */
export const cinematicSpace = style({
  width: 'min(520px, 78vw)',
  height: 'min(420px, 52vh)',
  pointerEvents: 'none',
})

export const art = style({
  display: 'grid',
  placeItems: 'center',
  width: 220,
  height: 220,
})

/**
 * 모습이 바뀌는 동안. 원작은 두 그림을 번갈아 줄였다 키우는데, 우리는 아직
 * 진화 전후를 겹쳐 그릴 자리가 없으므로 **줄었다 커지는 것만** 옮긴다.
 *
 * ⚠️ 빛나는 효과를 지어내지 않는다 — 원작에 없는 것을 넣으면 그 화면은
 * 우리 것이지 플래티넘이 아니다
 */
const pulse = keyframes({
  '0%': { transform: 'scale(1)', filter: 'brightness(1)' },
  '50%': { transform: 'scale(0.55)', filter: 'brightness(2.2) saturate(0)' },
  '100%': { transform: 'scale(1)', filter: 'brightness(1)' },
})

export const artPulse = style([art, {
  animation: `${pulse} 0.55s ease-in-out infinite`,
}])

export const image = style({
  maxWidth: '100%',
  maxHeight: '100%',
  imageRendering: 'pixelated',
})

export const line = style({
  minHeight: 46,
  maxWidth: 520,
  textAlign: 'center',
  fontSize: 17,
  lineHeight: 1.5,
  color: vars.panel.text,
})
