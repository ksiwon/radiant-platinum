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

/**
 * ⚠️ **바탕은 투명이다** — 3D 장면은 뒤의 캔버스가 그린다 (`scene/CreditsStage`). 4:3 무대 밖은 무대의 그림자로 덮는다 (`stage`).
 */
export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 400,
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
  // 4:3 밖은 검정으로 덮는다 — 상자 밖의 3D가 안 비친다 (`overflow`는 자기 그림자를 안 자른다)
  boxShadow: `0 0 0 100vmax ${vars.scrim.black}`,
})

/** 검정 가림 — 불투명도를 틱마다 직접 쓴다. 3D 가림은 글 아래, 화면 가림은 맨 위다 */
export const dim = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.black,
  opacity: 0,
  pointerEvents: 'none',
})

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

/**
 * 두루마리 둘레 (`records` §4.5) — 원작 글과 배경은 그대로 두고 둘레만 다듬는다.
 *
 * 양옆 띠: 그림은 가로로 이어지지 않아(`CreditsScreen` 주석, 실측 16.0) 띠를 그림으로 못 채운다 — 4:3 무대 안쪽 가장자리
 * 36px에 검정 0.38 → 투명 그러데이션 한 겹을 얹어 그림이 칼로 자른 듯 끝나는 것을 푼다
 */
const EDGE = 36
const edgeShade = (to: 'left' | 'right'): string =>
  `linear-gradient(to ${to}, color-mix(in srgb, ${vars.scrim.black} 38%, transparent), transparent)`
export const edge = style({ position: 'absolute', top: 0, bottom: 0, width: EDGE, pointerEvents: 'none' })
export const edgeLeft = style({ left: 0, background: edgeShade('right') })
export const edgeRight = style({ right: 0, background: edgeShade('left') })

/** 진행 — 무대 맨 아래 2px 선. 너비는 흐른 몫이고 글자는 없다 */
export const progress = style({
  position: 'absolute',
  left: 0,
  bottom: 0,
  height: 2,
  background: `color-mix(in srgb, ${vars.emphasis.oneOnDark} 55%, transparent)`,
  pointerEvents: 'none',
})

/**
 * 넘기기 안내 — 오른쪽 아래. 키캡은 어두운 바탕(`scrim.deep`)이고 글은 `ink.onDark`다. 하늘 위에서 읽히도록 글 뒤에
 * 1px 그림자를 깐다(화면 쪽 인라인 — 이 파일은 `textShadow`를 못 쓴다)
 */
export const hint = style({
  position: 'absolute',
  right: 22,
  bottom: 16,
  fontSize: '0.6em',
  color: vars.ink.onDark,
})

/**
 * 만든 사람 화면 (`MakerScreen`) — 두루마리 자리에 서는 한 장. 글자 크기는 무대의 글꼴(화면 높이의 1/24)을 자로 쓴다.
 *
 * 판을 늘어놓지 않는다 — 가운데 한 줄기로 로고 · 만든 사람 · 다른 게임과 고지가 내려오고, 뒤의 배경을 아래로 갈수록 어둡게 눌러
 * 글을 읽힌다 (위 0.40 → 아래 0.84). 세 묶음이 0 · 160 · 320ms 간격으로 400ms 페이드한다(오르는 이동 없음).
 * 줄 단위 엇갈림이 아니라 장면 전환이다. 움직임을 줄이는 설정이면 한 번에 뜬다
 */
export const maker = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  rowGap: '0.55em',
  padding: '0 4%',
  textAlign: 'center',
  background: [
    'linear-gradient(to bottom,',
    `color-mix(in srgb, ${vars.scrim.black} 40%, transparent),`,
    `color-mix(in srgb, ${vars.scrim.black} 84%, transparent))`,
  ].join(' '),
})

const groupIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

export const makerGroup = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  rowGap: '0.3em',
  animation: `${groupIn} 400ms ease-out both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 앱 아이콘 72×72 — 장식이다(`alt=""`) */
export const makerLogo = style({ width: 72, height: 72, display: 'block', marginBottom: '0.15em' })

export const makerTitle = style({ fontSize: '1.95em', lineHeight: 1.1 })

export const makerSmall = style({ fontSize: '0.58em', lineHeight: 1.5 })

export const makerLabel = style({ fontSize: '0.53em', marginTop: '0.4em' })

export const makerName = style({ fontSize: '1.28em' })

/** 금 헤어라인 — 56px 한 줄 */
export const makerHair = style({ width: 56, height: 1, background: vars.paper.gilt, margin: '0.2em 0' })

export const makerRow = style({ display: 'flex', gap: '1.4em', justifyContent: 'center', marginTop: '0.2em' })

/**
 * 다른 게임 — 세 칸 맞춤 `제목 | 소개 | 주소`. 두 줄이 같은 칸에 서므로 가운데 맞춤 때의 들쭉날쭉이 사라진다.
 * 제목은 오른쪽 맞춤 22px, 소개 · 주소는 왼쪽 맞춤. 상자나 선은 없다
 */
const GAMES_COLS = '6.4em 10.1em 7.1em'
export const makerGames = style({ display: 'grid', rowGap: '0.35em' })
export const makerGame = style({
  display: 'grid',
  gridTemplateColumns: GAMES_COLS,
  columnGap: '0.5em',
  alignItems: 'baseline',
})
export const makerGameTitle = style({ fontSize: '0.83em', textAlign: 'right' })
export const makerGameAbout = style({ fontSize: '0.56em', lineHeight: 1.4, textAlign: 'left' })

export const makerLink = style({
  fontSize: '0.56em',
  textDecoration: 'underline',
  textUnderlineOffset: '0.2em',
  pointerEvents: 'auto',
  cursor: 'pointer',
  textAlign: 'left',
  selectors: { '&:hover': { opacity: 0.8 } },
})

/** 감사 줄과 고지 — 폭 640 가운데. 안내(오른쪽 아래)와 안 겹친다 */
export const makerFoot = style({
  marginTop: '0.8em',
  // 글자(12px)의 em이라 640px ≈ 53em이다 — 무대 기준 24em이 아니다
  width: '53em',
  maxWidth: '100%',
  fontSize: '0.45em',
  lineHeight: 1.65,
  color: vars.ink.onDarkDim,
})
