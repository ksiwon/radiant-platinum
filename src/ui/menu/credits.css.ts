// 크레딧 (PARITY §8.12) — `overlay099`
//
// 명예의 전당과 같은 잣대로 잡는다: 원작 256×192 한 화면을 4:3 무대로 세우고
// 모든 자리를 `px/256`·`px/192` 비율로 적는다. 두루마리 자리가 픽셀이라
// 비율을 안 지키면 줄 간격이 원작과 어긋난다.
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 원작 화면 크기 */
const W = 256
const H = 192

const pctX = (px: number): string => `${String((px / W) * 100)}%`
const pctY = (px: number): string => `${String((px / H) * 100)}%`

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  background: vars.scrim.black,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
})

export const stage = style({
  position: 'relative',
  // 배경을 도트로 밀 때 자가 이 판이다 (`CreditsScreen`의 `sceneStyle` — `cqw`·`cqh`)
  containerType: 'size',
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

  // 원작은 글자 뒤에 그림자 팔레트를 깐다 (`TEXT_COLOR(1, 2, 0)`의 둘째 값).
  // 하늘 위에 흰 글씨라 그림자가 없으면 밝은 구름에서 글이 사라진다
  color: vars.ink.onDark,
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
  color: vars.ink.onDarkDim,
})

/**
 * 만든 사람 화면 (`MakerScreen`) — 두루마리 자리에 서는 한 장. 글자 크기는 무대의 글꼴(화면 높이의 1/24)을 자로 쓴다.
 *
 * 판을 늘어놓지 않는다 — 가운데 한 줄기로 제목 · 사람 · 다른 게임 · 고지가 내려오고, 뒤의 배경을 아래로 갈수록 어둡게 눌러 글을 읽힌다
 */
export const maker = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.35em',
  padding: `0 ${pctX(16)}`,
  textAlign: 'center',
  background: 'linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.8))',
  animation: `${keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })} 500ms ease-out`,
})

export const makerTitle = style({ fontSize: '1.9em', marginBottom: '0.1em' })

export const makerSmall = style({ fontSize: '0.72em', lineHeight: 1.5 })

export const makerLabel = style({ fontSize: '0.8em', marginTop: '1.1em' })

export const makerName = style({ fontSize: '1.3em' })

export const makerRow = style({ display: 'flex', gap: '1.4em', justifyContent: 'center', marginTop: '0.2em' })

export const makerGame = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'center',
  flexWrap: 'wrap',
  columnGap: '0.8em',
})

export const makerLink = style({
  fontSize: '0.72em',
  textDecoration: 'underline',
  textUnderlineOffset: '0.2em',
  pointerEvents: 'auto',
  cursor: 'pointer',
  selectors: { '&:hover': { opacity: 0.8 } },
})

export const makerFoot = style({
  marginTop: '1.4em',
  fontSize: '0.6em',
  lineHeight: 1.6,
  color: vars.ink.onDarkDim,
})
