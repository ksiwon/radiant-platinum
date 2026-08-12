// 타운맵 화면 (PARITY §5 · `applications/town_map`).
//
// ⚠️ **지도는 256×192 그림 한 장이다.** 늘려서 그릴 때 보간을 켜면 도트가
// 뭉개져서 도로가 흐릿해진다 — 원작은 픽셀 그대로다. 그래서 정수배로만 키우고
// `image-rendering: pixelated`를 건다.
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 원작 위 화면 크기. 지도 좌표가 전부 이 안의 픽셀이다 */
export const MAP_W = 256
export const MAP_H = 192
/**
 * 정수배로만 키운다. 2배가 512×384 — 창 높이에 머리·바닥을 빼고 남는 자리다.
 *
 * ⚠️ 3배(576px)로 하면 **아래가 잘린다.** 지도 아래쪽 노란 띠가 원작에서
 * 이름이 찍히는 자리라, 그게 잘리면 커서 아래 이름이 통째로 안 보인다
 */
export const ZOOM = 2

export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '10px 14px',
})

/** 지도 한 장과 그 위에 얹히는 것들의 좌표계 */
export const map = style({
  position: 'relative',
  width: MAP_W * ZOOM,
  height: MAP_H * ZOOM,
  flex: '0 0 auto',
  borderRadius: 6,
  overflow: 'hidden',
  boxShadow: '0 6px 22px rgba(0, 0, 0, 0.45)',
})

export const sheet = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  imageRendering: 'pixelated',
})

/**
 * 날 수 있는 곳 표식.
 *
 * 원작은 스프라이트 한 장을 모양별로 골라 쓴다. 우리는 크기를 표에서 받아
 * 네모로 그린다 — 모양이 일곱인데 크기는 넷뿐이라, 크기만으로도 도시와 마을이
 * 구분된다
 */
const markBase = style({
  position: 'absolute',
  borderRadius: 2,
  boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.55)',
})

export const mark = styleVariants({
  town: [markBase, { background: '#4aa3ff' }],
  city: [markBase, { background: '#ff6b5c' }],
  /** 아직 안 가 본 곳. 원작도 잠긴 표식을 회색으로 둔다 */
  locked: [markBase, { background: 'rgba(20, 24, 34, 0.42)' }],
})

/** 커서. 한 칸(7px)을 감싸고 깜빡인다 — 원작이 16프레임마다 색을 바꾼다 */
export const cursor = style({
  position: 'absolute',
  // ⚠️ 얇은 테두리 하나로는 **안 보인다.** 지도가 주황·초록이라 같은 색조에
  // 묻힌다 — 안쪽에 어두운 선을 한 겹 더 깔아 어디에나 뜨게 한다
  boxShadow: `0 0 0 ${ZOOM}px ${vars.hud.warn}, 0 0 0 ${ZOOM * 2}px rgba(0, 0, 0, 0.65)`,
  borderRadius: 2,
  pointerEvents: 'none',
  transition: 'left 60ms linear, top 60ms linear',
})

/** 지금 서 있는 자리. 커서와 헷갈리지 않게 속을 채운다 */
export const here = style({
  position: 'absolute',
  background: '#fff',
  borderRadius: '50%',
  boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6)',
  pointerEvents: 'none',
})

/**
 * 커서 아래 칸의 이름.
 *
 * 지도 **안**의 노란 띠 위에 얹는다 — 원작이 글을 찍는 자리가 거기다. 밖에
 * 따로 줄을 두면 화면이 두 층이 되고, 원작에 없는 칸이 하나 생긴다
 */
export const caption = style({
  position: 'absolute',
  left: 12 * ZOOM,
  right: 12 * ZOOM,
  bottom: 3 * ZOOM,
  height: 21 * ZOOM,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 1,
  // 원작 띠 위에 검은 글씨가 얹힌다
  color: '#231a06',
  pointerEvents: 'none',
})

export const captionName = style({
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1.15,
})

export const captionSub = style({
  fontSize: 11,
  opacity: 0.72,
  lineHeight: 1.2,
  // 띠 높이가 정해져 있어서 두 줄이 안 들어간다. 넘치면 잘라 준다
  maxHeight: '2.4em',
  overflow: 'hidden',
  paddingRight: 96,
})

/** 날 수 있는 곳에 섰을 때 뜨는 부름. 띠 오른쪽에 붙는다 */
export const captionFly = style({
  position: 'absolute',
  right: 0,
  bottom: 2,
  fontSize: 11,
  fontWeight: 700,
})
