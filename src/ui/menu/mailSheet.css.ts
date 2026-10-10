// 편지지 한 장 (`MailSheet`) — 구운 편지지 그림(256×192)을 정수 2배로 깔고 그 위에 낱말 · 새겨진 아이콘 · 서명을 얹는다.
//
// ⚠️ **그림 위에 맨 글자를 두지 않는다.** 편지지 열둘은 색이 제각각이다(우주 · 벽돌은 어둡고 하트 · 불꽃은 진하다).
// 글을 그 위에 바로 얹으면 어떤 종이에서는 안 읽힌다 — 낱말 칸 묶음과 서명 밑에 `paper.face`를 옅게 깔아 어느 종이에서나
// 같은 먹빛 글자가 읽히게 한다. 원작은 종이마다 글자색을 따로 정한다(`mail_viewer.c`) — 우리는 읽히는 쪽을 따른다.
//
// 치수는 편지지 한 장(256×192)을 2배한 512×384 안의 좌표다. 그림이 안 구워졌으면 같은 크기의 `PaperSheet` 종이로 선다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT, TIME } from '../theme/scale'
import { PICKED } from '../theme/window.css'

/** 편지지 한 장의 원본 크기 (`MAIL_ART_SHEET` 칸) */
export const MAIL_W = 256
export const MAIL_H = 192
/** 도트 배율 — 정수배만 쓴다 */
export const MAIL_SCALE = 2
export const SHEET_W = MAIL_W * MAIL_SCALE
export const SHEET_H = MAIL_H * MAIL_SCALE

/** 낱말 줄 하나의 높이. 세 줄이 편지지 위쪽 큰 칸(원작이 글자를 앉히는 자리)을 채운다 */
const WORD_ROW = 60

export const sheet = style({
  position: 'relative',
  flex: '0 0 auto',
  width: SHEET_W,
  height: SHEET_H,
  boxSizing: 'border-box',
  overflow: 'hidden',
  borderRadius: RADIUS.cell,
})

/** 그림이 안 구워졌을 때의 바탕 (`PaperSheet`가 크기만 이 값으로 선다) */
export const plain = style({ width: SHEET_W, height: SHEET_H })

/** 낱말 칸 묶음 — 종이 위쪽 큰 칸 */
export const plate = style({
  position: 'absolute',
  left: GAP.loose * 2,
  right: GAP.loose * 2,
  top: GAP.loose * 2,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: `${String(GAP.small)}px ${String(GAP.base)}px`,
  borderRadius: RADIUS.cell,
  background: `color-mix(in srgb, ${vars.paper.face} 82%, transparent)`,
})

export const words = style({
  display: 'flex',
  gap: GAP.loose,
  height: WORD_ROW - GAP.small,
  alignItems: 'center',
})

export const slot = style({
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  height: 36,
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${String(GAP.small)}px`,
  fontSize: 18,
  color: vars.paper.text,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  borderRadius: RADIUS.cell,
})

/** 빈 칸 — 점선 밑줄과 「…」 */
export const slotEmpty = style({
  color: vars.paper.textDim,
  borderBottom: `${String(EDGE.bar)}px dotted ${vars.paper.textDim}`,
  borderRadius: RADIUS.bar,
})

/** 고른 칸 — 금 테두리. 격자라 띠가 미끄러지지 않고 칸의 테두리가 바뀐다 (L5). 안쪽 테두리가 `PICKED`의 것이다 */
export const slotOn = style({
  ...PICKED,
  borderBottom: 'none',
  borderRadius: RADIUS.cell,
  fontWeight: 700,
  transition: `background-color ${TIME.fade} ease-out`,
})

/** 새겨진 아이콘 셋 — 편지지 그림의 아이콘 홈 위에 선다. 정수 1배(32) */
export const icons = style({
  position: 'absolute',
  left: 72,
  bottom: 50,
  display: 'flex',
  gap: 45,
})

/** 서명 — 보낸 이 */
export const signer = style({
  position: 'absolute',
  right: GAP.loose * 2,
  bottom: 36,
  maxWidth: 220,
  padding: `${String(GAP.tight)}px ${String(GAP.base)}px`,
  borderRadius: RADIUS.cell,
  background: `color-mix(in srgb, ${vars.paper.face} 82%, transparent)`,
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.paper.text,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
