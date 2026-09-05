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
  position: 'relative',
  width: 'min(520px, 78vw)',
  height: 'min(420px, 52vh)',
  pointerEvents: 'none',
})

/**
 * 띠와 막이 서는 층 — **화면 전체**다.
 *
 * ⚠️ **무대 상자만 덮으면 안 된다.** 처음에 `cinematicSpace`(520×333) 안에
 * 두었더니 흰 막이 화면 한복판의 **네모난 흰 자국**으로 보였다 — 원작은
 * 팔레트를 통째로 미는 것이라 글도 배경도 같이 하얘진다. 3D 무대도 창 하나가
 * 아니라 캔버스 전체에 그려지므로, 원작 화면에 해당하는 것은 **창**이다
 */
export const screenFrame = style({
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
})

/**
 * 위아래를 가리는 띠 (`evolution.c`의 `windowTop`/`windowBottom`).
 *
 * 원작은 하드웨어 창 레지스터로 화면을 잘라내고 프레임마다 두 줄씩 좁힌다
 * (PARITY §3.1)
 */
export const clampBar = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: 0,
  background: vars.scrim.black,
  pointerEvents: 'none',
})

export const clampTop = style({ top: 0 })
export const clampBottom = style({ bottom: 0 })

/**
 * 교대가 끝나며 화면을 덮는 흰 막.
 *
 * 원작이 팔레트를 통째로 흰색으로 민다 — 배경도 몸도 같이 하얘지므로 막이 맞다
 */
export const veil = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.white,
  opacity: 0,
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
  color: vars.ink.normal,
})
