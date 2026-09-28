// 명예의 전당 장면 (PARITY §8.11) — `cutscenes/hall_of_fame.c`
//
// 원작이 256×192 한 화면에 픽셀 단위로 배치한 장면이다. 자리를 옮기면 다른
// 장면이 되므로 **그 좌표를 그대로 쓴다** — 무대를 4:3으로 잡고 모든 값을
// `px/256`·`px/192` 비율로 적는다.
//
// 밝은 판(`G2_SetWnd0Position`)이 이 화면의 뼈대다. 원작은 창 안에서만 BG2(검정 한 장)를 빼서 그 뒤의 3D와
// BG3 배경이 보이게 한다. 우리도 같다 — 검정 한 장(`shade`)에 창 자리만 뚫고, 그 뒤 캔버스가 원작 배경 · 몸 · 조명 ·
// 색종이를 그린다 (`scene/HallOfFameStage` · 좌표는 `scene/hallOfFameChoreo`).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { WINDOW_SMALL } from '../theme/window.css'

/** 원작 화면 크기. 아래 값은 전부 이 둘로 나눈 비율이다 */
const W = 256
const H = 192

const pctX = (px: number): string => `${String((px / W) * 100)}%`
const pctY = (px: number): string => `${String((px / H) * 100)}%`

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  background: 'transparent',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
})

/** 4:3 무대. 창이 어떤 모양이든 원작 비율을 지킨다 */
export const stage = style({
  position: 'relative',
  width: `min(100vw, calc(100vh * ${String(W / H)}))`,
  height: `min(100vh, calc(100vw * ${String(H / W)}))`,
  overflow: 'hidden',
  // 4:3 밖은 검게 — 원작 화면 밖이다
  boxShadow: `0 0 0 100vmax ${vars.scrim.black}`,
  // 글자 크기도 화면에 맞춰 줄어든다 — 원작의 8픽셀 글꼴이 화면 높이의 1/24다
  fontSize: `calc(min(100vh, calc(100vw * ${String(H / W)})) / 16)`,
})

/** BG2 — 창 밖을 덮는 검정. 창 자리는 부르는 쪽이 `clip-path`로 프레임마다 뚫는다 */
export const shade = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.black,
  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
})

/** BG1 — 글 판 하나. 한 마리가 나갈 때 판째 위로 걷힌다 (`Bg_SetOffset(Y)`) */
export const textPlane = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
})

/**
 * 글 한 줄.
 *
 * 원작은 136픽셀 폭 안에서 **가운데로 맞춘다**
 * (`xOffset = (136 - Font_CalcStringWidth(...)) / 2`)
 */
export const line = style({
  position: 'absolute',
  width: pctX(136),
  textAlign: 'center',
  color: vars.ink.onDark,
  fontWeight: 700,
  lineHeight: pctY(16),
  whiteSpace: 'pre',
})

/** 가운데 정렬 한 줄 — 축하 인사와 주인공 정보 (`(256 - 글 너비) / 2`) */
export const centerLine = style({
  position: 'absolute',
  left: 0,
  width: '100%',
  // 원작에서 이 두 줄은 창 **밖**에 놓이는데, 글(BG1)은 BG2보다 위라 검정 위에 뜬다
  textAlign: 'center',
  color: vars.paper.gilt,
  fontWeight: 700,
  whiteSpace: 'pre',
})

/** 화면 전체를 덮는 암전 */
export const fade = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.black,
  transition: 'opacity 0.27s linear',
  pointerEvents: 'none',
})

/** 리포트를 쓰는 동안의 대사창. 필드 대사창과 같은 자리다 */
export const dialog = style({
  position: 'absolute',
  left: pctX(8),
  right: pctX(8),
  bottom: pctY(8),
  padding: '2% 3%',
  minHeight: pctY(40),
  display: 'flex',
  alignItems: 'center',
  ...WINDOW_SMALL,
  fontWeight: 600,
  whiteSpace: 'pre-wrap',
})

