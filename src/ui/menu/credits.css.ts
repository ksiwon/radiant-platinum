// 크레딧 (PARITY §8.12) — `overlay099`
//
// 명예의 전당과 같은 잣대로 잡는다: 원작 256×192 한 화면을 4:3 무대로 세우고
// 모든 자리를 `px/256`·`px/192` 비율로 적는다. 두루마리 자리가 픽셀이라
// 비율을 안 지키면 줄 간격이 원작과 어긋난다.
import { style, styleVariants } from '@vanilla-extract/css'

/** 원작 화면 크기 */
const W = 256
const H = 192

const pctX = (px: number): string => `${String((px / W) * 100)}%`
const pctY = (px: number): string => `${String((px / H) * 100)}%`

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  background: '#000',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
})

export const stage = style({
  position: 'relative',
  width: `min(100vw, calc(100vh * ${String(W / H)}))`,
  height: `min(100vh, calc(100vw * ${String(H / W)}))`,
  overflow: 'hidden',
  // 원작 글꼴이 8픽셀 높이고 줄 간격이 16이다 — 화면 높이의 1/24
  fontSize: `calc(min(100vh, calc(100vw * ${String(H / W)})) / 24)`,
})

/**
 * 배경 세 장. 아틀라스를 `background-position`으로 밀어 고른다.
 *
 * ⚠️ **점을 뭉개지 않는다** — 원작 그림이 256×192 도트라 늘릴 때 보간하면
 * 하늘의 띠가 흐려진다
 */
export const scene = style({
  position: 'absolute',
  inset: 0,
  imageRendering: 'pixelated',
  transition: 'opacity 900ms linear',
})

export const sceneOn = style({ opacity: 1 })
export const sceneOff = style({ opacity: 0 })

/** 글이 흐르는 판. 배경 위에 얹힌다 */
export const roll = style({
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
})

export const line = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: pctY(16),
  lineHeight: pctY(16),
  whiteSpace: 'pre',
  letterSpacing: '0.02em',
  // 원작은 글자 뒤에 그림자 팔레트를 깐다 (`TEXT_COLOR(1, 2, 0)`의 둘째 값).
  // 하늘 위에 흰 글씨라 그림자가 없으면 밝은 구름에서 글이 사라진다
  textShadow: '0 1px 0 rgba(0, 0, 0, 0.85), 0 0 4px rgba(0, 0, 0, 0.6)',
  color: '#fff',
})

export const align = styleVariants({
  /** 왼쪽에서 32픽셀 (`v1 = 32`) */
  indent: { paddingLeft: pctX(32), textAlign: 'left' },
  /** 가운데 (`(256 - 글자폭) / 2`) */
  center: { textAlign: 'center' },
})

export const hint = style({
  position: 'absolute',
  right: pctX(8),
  bottom: pctY(6),
  fontSize: '0.7em',
  color: 'rgba(255, 255, 255, 0.55)',
  textShadow: '0 1px 0 rgba(0, 0, 0, 0.85)',
})
