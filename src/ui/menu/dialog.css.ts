// 묻고 답하는 화면의 껍데기 — 리포트·설정이 같이 쓴다.
//
// 목록 화면(가방·도감)과 달리 가운데에 창 하나만 뜬다. 원작도 리포트는 요약창
// 하나에 예/아니오만 붙는다.
import { globalStyle, style } from '@vanilla-extract/css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW } from '../theme/window.css'
import { vars } from '../theme/contract.css'
import { row, rowOn } from './menuChrome.css'

export const center = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 20,
  padding: 24,
})

/** 요약창 — 이름표와 값을 두 칸으로 */
export const info = style({
  display: 'grid',
  gridTemplateColumns: 'auto auto',
  columnGap: 40,
  rowGap: 10,
  margin: 0,
  padding: '20px 32px',
  minWidth: 360,
  ...WINDOW,
  fontSize: TEXT.list,
})

// vanilla-extract는 style 안에서 `& dt` 같은 자식 선택자를 못 받는다.
// globalStyle로 따로 건다
globalStyle(`${info} dt`, { color: vars.ink.dim })
globalStyle(`${info} dd`, {
  margin: 0,
  textAlign: 'right',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
})

/** 물음 한 줄. 원작 대사창처럼 두 줄까지 나온다 */
export const prompt = style({
  maxWidth: 620,
  minHeight: 60,
  padding: '16px 24px',
  fontSize: 19,
  lineHeight: '30px',
  whiteSpace: 'pre-line',
  textAlign: 'center',
  ...WINDOW,
  fontFamily: vars.font.pixel,
})

export const choices = style({
  display: 'flex',
  gap: 12,
})

const choiceBase = style({
  ...WINDOW,
  minWidth: 110,
  padding: `${GAP.small + 2}px ${GAP.loose - 2}px`,
  fontSize: TEXT.list,
  textAlign: 'center',
})

export const choice = style([choiceBase, { opacity: 0.7 }])

export const choiceOn = style([choiceBase, {
  background: vars.pick.face,
  borderColor: vars.pick.edge,
  color: vars.pick.text,
  fontWeight: 700,
}])

/**
 * 파일 백업 줄 — 리포트 성공 **아래** 한 줄 (IMPORT.md §10).
 *
 * 내부 저장과 다른 줄인 것이 요점이다. 같은 줄에 두면 다운로드가 막혔을 때
 * 리포트까지 실패한 것처럼 읽힌다
 */
export const backup = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  maxWidth: 620,
  padding: '8px 14px',
  fontSize: TEXT.small,
  lineHeight: 1.6,
  borderRadius: RADIUS.cell,
  border: `1px solid ${vars.window.rule}`,
})

export const backupButton = style({
  appearance: 'none',
  padding: `5px ${GAP.small + 2}px`,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.pick.text,
  borderRadius: RADIUS.bar,
  border: `2px solid ${vars.pick.edge}`,
  background: vars.pick.face,
  cursor: 'pointer',
})

/** 설정 — 왼쪽 항목 이름, 오른쪽 고른 값 */
export const rows = style({
  width: 'min(660px, 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
})

/** 값 후보가 들어가야 해서 목록 줄(32)보다 한 뼘 높다 */
export const optionRow = style([row, { height: 38 }])
export const optionRowOn = style([rowOn, { height: 38 }])

export const rowLabel = style({
  flex: '0 0 170px',
  fontSize: TEXT.base,
})

/** 값 후보를 오른쪽에 늘어놓는다. 고른 것에만 색이 찬다 */
export const values = style({
  display: 'flex',
  gap: 4,
  marginLeft: 'auto',
})

const valueBase = style({
  padding: `3px ${GAP.small + 3}px`,
  borderRadius: RADIUS.bar,
  fontSize: TEXT.small,
  whiteSpace: 'nowrap',
})

export const value = style([valueBase, { color: vars.ink.faint }])

export const valueOn = style([valueBase, {
  ...PICKED,
  fontWeight: 700,
}])

/** 항목 설명 — 원작도 아래 화면에 한 줄로 띄운다 */
export const help = style({
  marginTop: 14,
  minHeight: 56,
  fontSize: TEXT.base,
  lineHeight: '26px',
  color: vars.ink.dim,
  whiteSpace: 'pre-line',
  textAlign: 'center',
})

/** 원작에 없는 항목임을 밝히는 표 */
/** 원작에 없는 항목임을 밝히는 표 */
export const ours = style({
  marginLeft: GAP.small,
  fontSize: TEXT.tiny,
  padding: '2px 7px',
  borderRadius: RADIUS.bar,
  border: `1px solid ${vars.window.rule}`,
  color: vars.ink.dim,
  verticalAlign: 'middle',
})
