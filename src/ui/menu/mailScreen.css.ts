// 메일 쓰기 · 읽기 — 가운데 창. 편지지(`MailSheet`)가 주인공이고 여기는 그 아래 줄(알림 · 결정)만 안다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED } from '../theme/window.css'
import { SHEET_W } from './mailSheet.css'

/** 창 폭 — 편지지 한 장에 양옆 여백 */
export const WIDTH = SHEET_W + GAP.loose * 2

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  padding: `${String(GAP.wide + 4)}px ${String(GAP.loose)}px ${String(GAP.wide)}px`,
})

/** 아래 줄 — 왼쪽에 알림, 오른쪽에 「결정」(원작 아래 줄) */
export const doRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: GAP.wide,
  minHeight: 40,
})

export const warn = style({ fontSize: TEXT.small, color: vars.ink.dim })

const doBase = {
  boxSizing: 'border-box',
  height: 40,
  padding: `0 ${String(GAP.loose + 4)}px`,
  fontSize: TEXT.list,
  fontFamily: 'inherit',
  fontWeight: 700,
  borderRadius: RADIUS.cell,
  border: `${String(EDGE.bar)}px solid ${vars.window.edgeDim}`,
  background: vars.window.faceTop,
  color: vars.ink.normal,
  cursor: 'pointer',
} as const

export const act = style({ ...doBase })

/** 커서가 서 있는 「결정」 — 금 띠 모양 */
export const actOn = style({ ...doBase, ...PICKED })
