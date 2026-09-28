// 도서관 TV (`LibraryTvScreen`) — 원작 한 화면(256×192)을 4:3 무대로 세운다
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 310,
  background: vars.scrim.black,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
})

export const stage = style({
  position: 'relative',
  width: 'min(100vw, calc(100vh * 4 / 3))',
  height: 'min(100vh, calc(100vw * 3 / 4))',
  overflow: 'hidden',
  imageRendering: 'pixelated',
})

/** 판 하나 — 아틀라스(256×640)의 세로 192줄을 보여 준다. 자리는 부르는 쪽이 준다 */
export const layer = style({
  position: 'absolute',
  inset: 0,
  backgroundSize: '100% 333.3333%',
  backgroundRepeat: 'no-repeat',
})

/** BG1 주사선 — BG2 · BG3 위에 4:12 (`G2_SetBlendAlpha(BG1, BG2 | BG3, 4, 12)`) */
export const scan = style([layer, { opacity: 4 / 16 }])

/** 밝기 페이드 (`FADE_TYPE_BRIGHTNESS_*`) */
export const shade = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.black,
  opacity: 1,
  pointerEvents: 'none',
})
