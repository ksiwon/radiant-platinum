// 연출 화면 셋이 함께 쓰는 판 — 진화·부화·교환.
//
// 화면에 있어야 할 것이 둘뿐이다 — **그림 하나와 글 한 줄**. 원작도 위 화면을
// 통째로 포켓몬에게 주고 아래에 글만 놓는다. 목록도 판도 놓지 않는다.
// 셋이 같은 판을 쓰는 이유가 그것이다: 다른 것은 무대 위 움직임과 글뿐이고
// 그 둘은 여기 없다 (`cinematicMotion` · 각 화면).
import { style } from '@vanilla-extract/css'
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
