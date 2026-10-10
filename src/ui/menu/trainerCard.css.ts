// 트레이너 카드 — 카드와 배지 케이스를 한 판에 나란히. **둘 다 CSS로 그린다** (trainer.md §4).
//
// ⚠️ **롬 그림(`card.png` · `case.png`)을 더 안 읽는다.** 카드 판은 등급 여섯 색(`cardRank.*`), 케이스는 `caseTray.*` 토큰이다.
// 롬 그림을 2.17배로 늘리면 도트 가장자리가 계단이 되고, 그 위 벡터 글자와 해상도가 갈린다. 색은 롬 그림에서 잰 값이다.
// 그림으로 남는 것은 주인공 사진(`trainer.png`, 정수 3배) · 배지(`badges.png`) · 관장 그림(`trainers/<갈래>.png`, 1배)뿐이다.
//
// ⚠️ **두 화면을 위아래로 쌓지 않는다.** 원작은 카드가 위 화면, 케이스가 아래 화면이라 둘이 늘 같이 보인다 — 한 창에서는
// 나란히 두는 것이 그 「같이 보임」이다.
//
// 치수는 960×640 창의 본문(약 954×562)에서 잰 한 벌이다. 창은 화면이 아니라(`SCREEN`) 이 판은 늘 그 크기로 서고, 화면이
// 넓어지면 여백만 커진다. 이 파일의 숫자는 이 판 하나에서만 쓰는 **지역 상수**다.
import { createVar, globalStyle, keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT, TIME, frames } from '../theme/scale'
import { pickHalo } from '../theme/window.css'

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'none' },
})

/** 판 전체 — 카드(584) + 틈(26) + 케이스(296) */
const BOARD = { width: 906, height: 474 } as const
/** 카드 칸 — 원작 240×176의 2.43배, 비율이 같다 */
const CARD = { width: 584, height: 428 } as const
/** 케이스 칸 — 카드 위 끝과 등급 줄 아래 끝에 맞춘다 */
const CASE = { left: 610, width: 296, height: 474 } as const
/** 케이스 안: 머리 40 · 트레이 344 · 설명 84 */
const TRAY = { top: 40, height: 344 } as const

/** 주인공 사진 — 원작 36×66을 **정수 3배**로 (결정: 주인공은 도트) */
export const HERO = { cellW: 36, cellH: 66, scale: 3, sheetCols: 2 } as const

/** 배지 칸 — 홈마다 정사각 하나. 도트 40×40 창을 2배로 (`BADGE_WINDOW`) */
export const WELL = 80

// ─────────────────────────────────────────────────────────────────
// 판
// ─────────────────────────────────────────────────────────────────

/** 본문 — 판이 가운데에 선다 */
export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  animation: `${rise} ${TIME.fade} ease-out`,
})

export const board = style({
  position: 'relative',
  flex: '0 0 auto',
  width: BOARD.width,
  height: BOARD.height,
})

// ─────────────────────────────────────────────────────────────────
// 카드 — 등급 판 여섯
// ─────────────────────────────────────────────────────────────────

const vFace = createVar()
const vBand = createVar()
const vPhoto = createVar()
const vMark = createVar()
const vBackLow = createVar()
const vInk = createVar()

/**
 * 등급 하나가 다섯 색을 지역 변수로 받는다 (`cardRank.r0~r5`). 화면 파일에 `#`가 안 들어간다.
 *
 * 블랙(r5)만 글자가 노랑이다(원작 `index.json` text[5], 판 `#4a4a4a` 위 8.36:1). 나머지는 원작 잉크(`#4a4a4a`)가 판 위에서
 * 2.56:1까지 떨어져 `ink.strong`으로 둔다 — 읽히는 쪽이 이긴다.
 */
export const rank = styleVariants(vars.cardRank, (r, key) => ({
  vars: {
    [vFace]: r.face,
    [vBand]: r.band,
    [vPhoto]: r.photo,
    [vMark]: r.mark,
    [vBackLow]: r.backLow,
    [vInk]: key === 'r5' ? vars.card.star : vars.ink.strong,
  },
}))

/** 카드 칸. 뒤집을 때 칸 통째로 접히므로 칸이 따로 선다 */
export const cardSlot = style({
  position: 'absolute',
  left: 0,
  top: 0,
  width: CARD.width,
  height: CARD.height,
})

/**
 * 카드 한 장 — 납작한 한 색 판에 인쇄된 띠. 광택도 대각 그러데이션도 없다 (DESIGN §3).
 *
 * ⚠️ **뒤집기는 가로로 접었다 펴는 것이다** (`TrainerCase_FlipTrainerCard`) — 세로축 회전(3D)이 아니다. 원작은 회전 BG의
 * 가로 배율만 1 → 0 → 1로 민다. 접히는 동안은 8프레임, 펴질 때는 7프레임이다
 */
export const card = style({
  position: 'absolute',
  inset: 0,
  boxSizing: 'border-box',
  background: vFace,
  border: `${EDGE.window}px solid ${vars.card.edgeRom}`,
  borderRadius: RADIUS.window,
  overflow: 'hidden',
  color: vInk,
  fontWeight: 700,
  transformOrigin: '50% 50%',
})

export const foldIn = style({ transform: 'scaleX(0)', transition: `transform ${frames(8)} ease-in` })
export const foldOut = style({ transform: 'scaleX(1)', transition: `transform ${frames(7)} ease-out` })

/** 판 무늬 — 원작 카드 앞면 왼쪽 위의 둥근 문양. 광택이 아니라 인쇄된 무늬다 */
const MARK_OPACITY = 0.5
export const markRing = style({
  position: 'absolute',
  left: -120,
  top: -150,
  width: 430,
  height: 430,
  borderRadius: RADIUS.round,
  border: `58px solid ${vMark}`,
  opacity: MARK_OPACITY,
  clipPath: 'polygon(0 0, 100% 0, 100% 62%, 0 100%)',
  pointerEvents: 'none',
})
export const markDot = style({
  position: 'absolute',
  left: 30,
  top: 22,
  width: 122,
  height: 122,
  borderRadius: RADIUS.round,
  background: vMark,
  opacity: MARK_OPACITY,
  pointerEvents: 'none',
})

/** 머리 — 볼 표 · IDNo. · 별 */
export const cardHead = style({
  position: 'absolute',
  left: 22,
  right: 22,
  top: 16,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
})

/** 볼 표 — 원작 카드 머리의 몬스터볼 도장. 글자색을 따른다 */
export const ballMark = style({
  position: 'relative',
  flex: '0 0 auto',
  boxSizing: 'border-box',
  width: 20,
  height: 20,
  borderRadius: RADIUS.round,
  border: `3px solid ${vInk}`,
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      left: -3,
      right: -3,
      top: 5.5,
      height: 3,
      background: vInk,
    },
  },
})

export const idLabel = style({ fontSize: TEXT.small })
export const idNumber = style({ fontSize: TEXT.title, fontVariantNumeric: 'tabular-nums' })

/** 머리 오른쪽 끝의 등급 별 */
export const headStars = style({ marginLeft: 'auto', display: 'flex', gap: GAP.tight })
export const starSvg = style({ display: 'block', width: 22, height: 22 })
export const starOn = style({ fill: vars.card.star, stroke: vars.card.edgeRom, strokeWidth: 7, strokeLinejoin: 'round' })

/** 이름 — 카드에서 제일 큰 글 (38px) */
export const nameBlock = style({ position: 'absolute', left: 22, top: 62, margin: 0 })
export const nameLabel = style({ margin: 0, fontSize: 13, opacity: 0.8 })
export const nameValue = style({
  margin: 0,
  fontSize: 38,
  lineHeight: 1.1,
})

/** 인쇄된 띠 목록 — 왼쪽 끝에서 잘려 나가고 오른쪽만 둥글다. 상자가 아니라 카드의 줄무늬다 */
export const bands = style({
  position: 'absolute',
  left: 0,
  top: 140,
  width: 386,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
})

/** 띠의 바탕 — 모서리는 쓰는 쪽이 정한다(앞면 띠는 오른쪽만, 뒷면 띠는 끝에서 끝까지 직각) */
const bandBase = style({
  height: 40,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  background: vBand,
  whiteSpace: 'nowrap',
})
export const band = style([bandBase, {
  padding: '0 16px 0 22px',
  borderRadius: `0 ${RADIUS.cell + 1}px ${RADIUS.cell + 1}px 0`,
}])

/** 원작 이름표 글 */
export const bandLabel = style({ margin: 0, fontSize: TEXT.base - 1 })
/** 값 — 오른쪽 끝, 숫자는 Pretendard tabular-nums (mono 금지) */
export const bandValue = style({
  margin: '0 0 0 auto',
  fontSize: 19,
  fontVariantNumeric: 'tabular-nums',
})

/** 끝에서 끝까지 넓은 띠 둘 — 플레이 시간 · 모험을 시작한 날 */
export const wide = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 18,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
})
export const wideBand = style([bandBase, { height: 44, padding: '0 22px' }])
export const wideValue = style({ margin: '0 0 0 auto', fontSize: TEXT.base, fontVariantNumeric: 'tabular-nums' })
/** 플레이 시간의 값은 한 단 크다 (24px) */
export const timeValue = style({ fontSize: 24 })

/** 플레이 시간의 쌍점 — 원작은 15프레임 켜고 15프레임 끈다 (`TrainerCase_UpdatePlayTime`) */
const blink = keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0 },
})
export const colon = style({ animation: `${blink} ${frames(30)} steps(1, end) infinite` })

/** 사진 칸 — 주인공이 바닥에 서고 칸 밖으로 안 나간다 */
export const photoBox = style({
  position: 'absolute',
  right: 22,
  top: 62,
  width: 154,
  height: 214,
  boxSizing: 'border-box',
  background: vPhoto,
  borderRadius: RADIUS.cell + 3,
  overflow: 'hidden',
})

/** 주인공 도트 — 원작 36×66을 정수 3배(108×198). 사진 칸 바닥 6px 위에 가운데 맞춤 */
export const hero = style({
  position: 'absolute',
  left: '50%',
  bottom: 6,
  width: HERO.cellW * HERO.scale,
  height: HERO.cellH * HERO.scale,
  marginLeft: -(HERO.cellW * HERO.scale) / 2,
  backgroundRepeat: 'no-repeat',
  imageRendering: 'pixelated',
})

/** 뒷면 — 띠 넷은 끝에서 끝까지, 아래 판 위에 서명 칸 */
export const backBands = style([bands, { top: 20, width: 'auto', right: 0 }])
export const backBand = style([bandBase, { padding: '0 22px' }])
export const twoRowBand = style({
  height: 70,
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'center',
  gap: 2,
})
export const twoRow = style({ display: 'flex', alignItems: 'center' })

/** 통신대전 — 「승 n 패 n」을 4칸 격자로 오른쪽에 맞춘다 */
export const winLoss = style({
  margin: '0 0 0 auto',
  display: 'grid',
  gridTemplateColumns: '28px 64px 28px 64px',
  alignItems: 'center',
  fontSize: 19,
  fontVariantNumeric: 'tabular-nums',
})
globalStyle(`${winLoss} > span:nth-child(2n)`, { textAlign: 'right' })

export const lowPanel = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 168,
  background: vBackLow,
})

/** 서명 칸 — 범위 밖이라 비어 있다(통신 광장에서 쓴다). 32px 간격 옅은 줄 */
export const sign = style({
  position: 'absolute',
  left: '50%',
  bottom: 20,
  width: 380,
  height: 128,
  marginLeft: -190,
  borderRadius: RADIUS.cell + 1,
  background: vars.card.sign,
  backgroundImage: `repeating-linear-gradient(180deg, transparent 0 31px, ${vars.card.signRule} 31px 32px)`,
  backgroundPosition: '0 16px',
})

/** 블랙 카드는 원작처럼 서명 칸 양옆에 별 기둥을 세운다 */
export const pillar = style({
  position: 'absolute',
  bottom: 28,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
})
export const pillarLeft = style({ left: 52 })
export const pillarRight = style({ right: 52 })

// ─────────────────────────────────────────────────────────────────
// 카드 아래 — 등급 별과 앞뒤 점
// ─────────────────────────────────────────────────────────────────

export const rankStrip = style({
  position: 'absolute',
  left: 0,
  top: CARD.height + 16,
  width: CARD.width,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
})
export const rankStar = style({ display: 'block', width: 20, height: 20, fill: vars.card.starOff })
export const rankStarOn = style({ fill: vars.pick.edge })
export const pips = style({ marginLeft: 'auto', display: 'flex', gap: GAP.small })
export const pip = style({
  width: 9,
  height: 9,
  borderRadius: RADIUS.round,
  background: vars.window.rule,
})
export const pipOn = style({ background: vars.ink.dim })

// ─────────────────────────────────────────────────────────────────
// 배지 케이스
// ─────────────────────────────────────────────────────────────────

export const caseBox = style({
  position: 'absolute',
  left: CASE.left,
  top: 0,
  width: CASE.width,
  height: CASE.height,
  boxSizing: 'border-box',
  background: vars.caseTray.frame,
  border: `${EDGE.window}px solid ${vars.caseTray.frameDeep}`,
  borderRadius: RADIUS.window,
  overflow: 'hidden',
})

/** 머리 — 「가진 배지 5개」 */
export const caseHead = style({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  height: TRAY.top,
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  boxSizing: 'border-box',
  color: vars.sign.text,
  fontSize: TEXT.base - 1,
  fontWeight: 700,
  background: vars.caseTray.frameLit,
  borderBottom: `${EDGE.rule}px solid ${vars.caseTray.frameDim}`,
})
export const caseCount = style({ marginLeft: 'auto', fontSize: TEXT.title - 2, fontVariantNumeric: 'tabular-nums' })

/** 트레이 — 홈 여덟이 2열 4줄. 홈마다 정사각 칸이 하나이고 가운데에 선다 */
export const tray = style({
  position: 'absolute',
  left: 10,
  right: 10,
  top: TRAY.top,
  height: TRAY.height,
  boxSizing: 'border-box',
  padding: '6px 8px',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: 'repeat(4, 1fr)',
  background: vars.caseTray.tray,
  borderRadius: RADIUS.cell + 1,
  boxShadow: `inset 0 ${EDGE.window}px 0 ${vars.caseTray.well}`,
})

/** 홈 하나 — 칸은 늘 같은 정사각(`WELL`)이다 */
export const well = style({
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  minWidth: 0,
  minHeight: 0,
})

/** 정사각 칸. 받은 배지 · 못 받은 배지가 같은 칸에 같은 기준선으로 선다 (DECISIONS 사용자 지적 ①) */
export const wellCell = style({
  position: 'relative',
  width: WELL,
  height: WELL,
  overflow: 'hidden',
  zIndex: 1,
})

/** 고른 배지의 금 고리 — 옅은 금빛 + 금 고리 하나(`pickHalo`) */
export const halo = style([pickHalo, {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 84,
  height: 84,
  marginLeft: -42,
  marginTop: -42,
  borderRadius: RADIUS.round,
  pointerEvents: 'none',
}])

/** 반짝임 — 원작 광 단계의 반짝임 스프라이트 자리. 1.2초 주기, 차례로 늦춘다 */
const twinkle = keyframes({
  '0%, 100%': { opacity: 0, transform: 'scale(0.4)' },
  '40%': { opacity: 1, transform: 'scale(1)' },
})
export const spark = style({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 12,
  height: 12,
  margin: '-6px 0 0 -6px',
  background: vars.card.sign,
  clipPath: 'polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)',
  opacity: 0,
  zIndex: 2,
  pointerEvents: 'none',
  animation: `${twinkle} 1.2s ease-in-out infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 설명 — 관장 그림(80, 제 틀 안) · 배지 이름 · 「도시 · 관장」 */
export const caption = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: CASE.height - TRAY.top - TRAY.height - EDGE.window * 2,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'flex-end',
  gap: 6,
  padding: '0 14px 2px 8px',
  color: vars.sign.text,
})
export const leader = style({
  flex: '0 0 auto',
  width: 80,
  height: 80,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center bottom',
  imageRendering: 'pixelated',
})
export const captionText = style({ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 6, minWidth: 0 })
export const badgeName = style({ margin: 0, fontSize: 19, fontWeight: 700 })
export const badgeSub = style({ margin: 0, fontSize: 13, color: vars.sign.edge })
