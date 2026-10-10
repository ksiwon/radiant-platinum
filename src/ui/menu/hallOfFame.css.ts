// 명예의 전당 장면 (PARITY §8.11) — `cutscenes/hall_of_fame.c` · 설계 `records` §4.1~4.2
//
// 원작이 256×192 한 화면에 픽셀 단위로 배치한 장면이다. 자리를 옮기면 다른
// 장면이 되므로 **그 좌표를 그대로 쓴다** — 무대를 4:3으로 잡고 모든 값을
// `px/256`·`px/192` 비율로 적는다.
//
// 밝은 판(`G2_SetWnd0Position`)이 이 화면의 뼈대다. 원작은 창 안에서만 BG2(검정 한 장)를 빼서 그 뒤의 3D와
// BG3 배경이 보이게 한다. 우리도 같다 — 검정 한 장(`shade`)에 창 자리만 뚫고, 그 뒤 캔버스가 원작 배경 · 몸 · 조명 ·
// 색종이를 그린다 (`scene/HallOfFameStage` · 좌표는 `scene/hallOfFameChoreo`).
//
// **창 안은 3D의 것, 창 밖(글과 띠)이 우리 디자인이다.** 위계 · 색 · 움직임을 바꾸는 곳은 글과 가장자리뿐이다.
// 의식 머리글은 `emphasis.oneOnDark`, 본문은 `ink.onDark`, 부글은 `ink.onDarkDim` — 세 단이다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, TIME } from '../theme/scale'
import { WINDOW_SMALL } from '../theme/window.css'

/** 원작 화면 크기. 아래 값은 전부 이 둘로 나눈 비율이다 */
const W = 256
const H = 192

const pctX = (px: number): string => `${String((px / W) * 100)}%`
const pctY = (px: number): string => `${String((px / H) * 100)}%`

/** 4:3 무대의 높이 — 화면 높이와 가로에서 나온 4:3 중 작은 쪽 */
const STAGE_H = `min(100vh, calc(100vw * ${String(H / W)}))`
const STAGE_W = `min(100vw, calc(100vh * ${String(W / H)}))`

/** 장면 전체 — 화면을 덮는다. `MenuScreen`(연출)의 창 안이 아니라 화면 기준이다 (`fixed`) */
export const root = style({
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  display: 'grid',
  placeItems: 'center',
})

/**
 * 4:3 무대. 창이 어떤 모양이든 원작 비율을 지킨다.
 *
 * ⚠️ **무대 밖을 `boxShadow` 100vmax로 검게 덮지 않는다.** 960×640에서 양옆 53px씩이 죽은 검정이라 장면이 화면에 떠 있는
 * 상자처럼 읽혔다 — 양옆은 `pillar`가 같은 방의 어둠으로 채운다.
 *
 * `--hof-u`는 원작 글꼴의 한 칸 — 무대 높이의 1/16이다(960×640에서 40px). 글자 크기는 이 값의 곱이라 무대가 작아지면
 * 비례해 줄어든다
 */
export const stage = style({
  position: 'relative',
  width: STAGE_W,
  height: STAGE_H,
  overflow: 'hidden',
  vars: { '--hof-u': `calc(${STAGE_H} / 16)` },
  fontSize: 'var(--hof-u)',
})

/**
 * 4:3 밖의 양옆 띠 — 같은 방의 어둠이다. 가운데가 `card.faceBottom`, 가장자리가 `scrim.black`인 세로 타원 그러데이션.
 *
 * ⚠️ **불투명하다.** 설계는 0.8이었으나 영속 Canvas가 화면 전체에 그리므로 비치면 무대 밖으로 미끄러져 나가는 몸이
 * 띠 위에 유령으로 보인다 (`monIn`이 화면 밖에서 들어온다)
 */
export const pillar = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: `calc((100vw - ${STAGE_W}) / 2)`,
  background: `radial-gradient(ellipse 100% 70% at 50% 50%, ${vars.card.faceBottom} 0%, ${vars.scrim.black} 100%)`,
  pointerEvents: 'none',
})
export const pillarLeft = style({ left: 0 })
export const pillarRight = style({ right: 0 })

/** BG2 — 창 밖을 덮는 검정. 창 자리는 부르는 쪽이 `clip-path`로 프레임마다 뚫는다 */
export const shade = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.black,
  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
})

/**
 * 창 가장자리 선 — 3D(안)와 검정(밖)의 경계에 정해진 선을 긋는다. `shade`와 **같은 rAF에서 같은 값**으로 따라가므로
 * 창이 들어올 때 선도 같이 들어온다 (별도 애니메이션 없음). `window.edge` 2px 바깥에 `window.edgeDim` 1px 안쪽 선이 한 줄 더 있다
 */
export const frameLine = style({
  position: 'absolute',
  boxSizing: 'border-box',
  border: `${EDGE.bar}px solid ${vars.window.edge}`,
  opacity: 0,
  pointerEvents: 'none',
})
export const frameInner = style({
  position: 'absolute',
  inset: 0,
  border: `${EDGE.rule}px solid ${vars.window.edgeDim}`,
})

/** BG1 — 글 판 하나. 한 마리가 나갈 때 판째 위로 걷힌다 (`Bg_SetOffset(Y)`) */
export const textPlane = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
})

/**
 * 글 묶음 하나 — 인사 · 주인공 · 출처. 원작은 136픽셀 폭 안에서 **줄마다 가운데 맞춤**이다.
 * 묶음이 걸음마다 140ms 페이드 + 위로 6px로 선다 (줄 단위 엇갈림은 없다)
 */
export const group = style({
  position: 'absolute',
  width: pctX(136),
  display: 'grid',
  justifyItems: 'center',
  textAlign: 'center',
  whiteSpace: 'pre',
  opacity: 0,
  transform: 'translateY(6px)',
  transition: `opacity ${TIME.page} ease-out, transform ${TIME.page} ease-out`,
})
export const groupOn = style({ opacity: 1, transform: 'none' })

/** ① 인사 — 의식 머리글. 20px 700 */
export const greeting = style({
  fontSize: 'calc(var(--hof-u) * 0.5)',
  fontWeight: 700,
  lineHeight: 1.5,
  color: vars.emphasis.oneOnDark,
})

/** ② 주인공 — 별명이 이 순간의 주인공이다 (44px 700), 그 아래 종족 줄 20px */
export const heroName = style({
  fontSize: 'calc(var(--hof-u) * 1.1)',
  fontWeight: 700,
  lineHeight: 1.15,
  color: vars.ink.onDark,
})
export const heroInfo = style({
  fontSize: 'calc(var(--hof-u) * 0.5)',
  fontWeight: 600,
  lineHeight: 1.5,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.onDark,
})

/** ③ 출처 — 어버이 · 만난 곳. 부글 16px 400, 줄 간격 1.7 */
export const sourceLine = style({
  fontSize: 'calc(var(--hof-u) * 0.4)',
  fontWeight: 400,
  lineHeight: 1.7,
  color: vars.ink.onDarkDim,
})

/** 묶음 사이의 금 헤어라인 — 44px 한 줄 */
export const hair = style({
  position: 'absolute',
  width: 'calc(var(--hof-u) * 1.1)',
  height: 1,
  background: vars.paper.gilt,
  transform: 'translateX(-50%)',
  opacity: 0,
  transition: `opacity ${TIME.page} ease-out`,
})
export const hairOn = style({ opacity: 1 })

/** 몇째 마리 — 글 칸 아래 여섯 칸. 지금 칸이 숨쉰다 */
export const pips = style({
  position: 'absolute',
  bottom: 'calc(var(--hof-u) * 0.85)',
  width: pctX(136),
  display: 'flex',
  justifyContent: 'center',
  gap: 8,
  pointerEvents: 'none',
})

const breathe = keyframes({ '0%, 100%': { opacity: 0.55 }, '50%': { opacity: 1 } })

const pipBase = {
  width: 'calc(var(--hof-u) * 0.7)',
  height: 4,
} as const

/** 남은 마리 */
export const pip = style({
  ...pipBase,
  background: `color-mix(in srgb, ${vars.ink.onDark} 18%, transparent)`,
})
/** 지금까지 본 마리 */
export const pipSeen = style({ ...pipBase, background: vars.emphasis.oneOnDark })
/** 지금 마리 — 1.6초 주기로 55%↔100%. 움직임을 줄이는 설정이면 끈다 */
export const pipNow = style({
  ...pipBase,
  background: vars.emphasis.oneOnDark,
  animation: `${breathe} 1.6s ease-in-out infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/** 파티 장면의 머리글 — 축하 인사. 36px 700, 페이드 300ms */
export const headline = style({
  position: 'absolute',
  left: 0,
  width: '100%',
  top: pctY(4),
  textAlign: 'center',
  whiteSpace: 'pre',
  fontSize: 'calc(var(--hof-u) * 0.9)',
  fontWeight: 700,
  color: vars.emphasis.oneOnDark,
  animation: `${fadeIn} 0.3s ease-out`,
})

/** 파티 장면의 바닥 줄 — 이름 · ID · 플레이 시간 한 문자열(롬 템플릿에 한 줄로 박혀 있다). 26px 700 */
export const footLine = style({
  position: 'absolute',
  left: 0,
  width: '100%',
  top: pctY(172),
  textAlign: 'center',
  whiteSpace: 'pre',
  fontSize: 'calc(var(--hof-u) * 0.65)',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.onDark,
  animation: `${fadeIn} 0.3s ease-out`,
})

/**
 * 「Z 계속」 — `confetti` 걸음에 들어서고 2초 뒤에 300ms 페이드로 뜬다. 원작에는 없다: 사람이 영원히 서 있지 않게 하는
 * 우리 몫이다. 하네스는 이 요소를 안 읽는다
 */
export const hint = style({
  position: 'absolute',
  right: GAP.loose,
  bottom: 14,
  fontSize: 14,
  color: vars.ink.onDarkDim,
  pointerEvents: 'none',
  animation: `${fadeIn} 0.3s ease-out 2s both`,
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
