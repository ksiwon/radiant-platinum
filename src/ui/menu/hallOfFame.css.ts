// 명예의 전당 장면 (PARITY §8.11) — `cutscenes/hall_of_fame.c`
//
// 원작이 256×192 한 화면에 픽셀 단위로 배치한 장면이다. 자리를 옮기면 다른
// 장면이 되므로 **그 좌표를 그대로 쓴다** — 무대를 4:3으로 잡고 모든 값을
// `px/256`·`px/192` 비율로 적는다.
//
// 밝은 판(`G2_SetWnd0Position`)이 이 화면의 뼈대다. 원작은 하드웨어 윈도
// 하나로 「여기만 배경이 보인다」를 만들고 나머지는 검게 둔다. 우리는 반대로
// 검은 무대 위에 그 사각형만 밝게 얹는다 — 보이는 결과가 같다.
import { keyframes, style, styleVariants } from '@vanilla-extract/css'

/** 원작 화면 크기. 아래 값은 전부 이 둘로 나눈 비율이다 */
const W = 256
const H = 192

const pctX = (px: number): string => `${String((px / W) * 100)}%`
const pctY = (px: number): string => `${String((px / H) * 100)}%`

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  background: 'rgba(0, 0, 0, 0.12)',
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
  // 글자 크기도 화면에 맞춰 줄어든다 — 원작의 8픽셀 글꼴이 화면 높이의 1/24다
  fontSize: `calc(min(100vh, calc(100vw * ${String(H / W)})) / 16)`,
})

/**
 * 무대 바닥. 원작은 `dendou_demo` 배경을 깔지만 우리는 그 타일맵을 아직 안
 * 굽는다 — 대신 조명이 도는 어두운 홀로 둔다 (§8.11)
 */
export const floor = style({
  position: 'absolute',
  inset: 0,
  background: 'transparent',
})

const sweep = keyframes({
  from: { transform: 'translateX(-50%) rotate(-14deg)' },
  to: { transform: 'translateX(-50%) rotate(14deg)' },
})

/**
 * 무대 조명 여섯 (`HallOfFame_InitSpotlightsTask`).
 *
 * 원작이 여섯 줄기를 각각 다른 각도(±0.714·±0.429·±0.143)와 다른 자리
 * (20·60·40·140·120·160)에서 흔든다. 각도와 자리는 그 값 그대로고, 흔드는
 * 방식만 CSS가 한다
 */
export const beam = style({
  position: 'absolute',
  bottom: '-10%',
  width: pctX(26),
  height: '120%',
  transformOrigin: '50% 100%',
  background: 'linear-gradient(to top, rgba(150, 190, 255, 0.22), rgba(150, 190, 255, 0) 78%)',
  filter: 'blur(3px)',
  animation: `${sweep} 5.5s ease-in-out infinite alternate`,
  pointerEvents: 'none',
})

/** 밝은 판 하나. 자리와 크기는 부르는 쪽이 인라인으로 준다 */
export const pane = style({
  position: 'absolute',
  background: 'linear-gradient(180deg, rgba(28, 46, 84, 0.42), rgba(10, 18, 38, 0.32))',
  boxShadow: 'inset 0 0 0 2px rgba(126, 174, 255, 0.55), 0 0 24px rgba(90, 140, 230, 0.35)',
  overflow: 'hidden',
})

/** 포켓몬 그림. 원작이 80×80 한 컷을 판 가운데에 놓는다 */
export const monArt = style({
  position: 'absolute',
  width: pctX(80),
  height: pctY(80),
  objectFit: 'contain',
  imageRendering: 'pixelated',
  transition: 'left 0.47s linear',
})

/** 주인공 그림. 아래에서 올라온다 */
export const playerArt = style({
  position: 'absolute',
  left: pctX(128 - 40),
  width: pctX(80),
  height: pctY(80),
  objectFit: 'contain',
  imageRendering: 'pixelated',
  transition: 'top 0.47s linear',
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
  color: '#f8fbff',
  textShadow: '0 1px 0 #1a2a4a, 0 0 6px rgba(0, 0, 0, 0.8)',
  fontWeight: 700,
  lineHeight: pctY(16),
  whiteSpace: 'pre',
  transition: 'opacity 0.2s linear',
})

/** 가운데 정렬 한 줄 — 축하 인사와 주인공 정보 (`(256 - 글 너비) / 2`) */
export const centerLine = style({
  position: 'absolute',
  left: 0,
  width: '100%',
  // ⚠️ **닫히는 띠보다 위다.** 원작에서 이 두 줄은 밝은 판(윈도 0) **밖**에
  // 놓이는데, 글은 다른 BG 층이라 창에 안 잘린다 — 띠 아래에 두면 위아래 줄이
  // 통째로 사라진다
  zIndex: 2,
  textAlign: 'center',
  color: '#fff9d8',
  textShadow: '0 1px 0 #4a3a12, 0 0 8px rgba(0, 0, 0, 0.85)',
  fontWeight: 700,
  whiteSpace: 'pre',
})

const fall = keyframes({
  from: { transform: 'translateY(-12%) rotate(0deg)' },
  to: { transform: 'translateY(115%) rotate(540deg)' },
})

/** 색종이 마흔여덟 (`NUM_CONFETTI`) */
export const confetti = style({
  position: 'absolute',
  top: 0,
  width: pctX(4),
  height: pctY(6),
  animation: `${fall} 2.4s linear infinite`,
  pointerEvents: 'none',
  zIndex: 2,
})

/** 검게 닫히는 띠 두 장 (`HallOfFame_WipeToBlack`) */
export const wipe = styleVariants({
  top: {
    position: 'absolute',
    left: 0,
    width: '100%',
    top: 0,
    background: '#000',
    transition: 'height 0.4s linear',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    width: '100%',
    bottom: 0,
    background: '#000',
    transition: 'height 0.4s linear',
  },
})

/** 화면 전체를 덮는 암전 */
export const fade = style({
  position: 'absolute',
  inset: 0,
  background: '#000',
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
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.97), rgba(226, 232, 244, 0.97))',
  border: '2px solid rgba(60, 74, 102, 0.9)',
  borderRadius: 8,
  color: '#1b2536',
  fontWeight: 600,
  whiteSpace: 'pre-wrap',
})

export const hint = style({
  position: 'absolute',
  right: pctX(8),
  bottom: pctY(4),
  color: 'rgba(230, 240, 255, 0.75)',
  fontSize: '0.7em',
})
