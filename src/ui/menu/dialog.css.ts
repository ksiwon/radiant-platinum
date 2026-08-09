// 묻고 답하는 화면의 껍데기 — 리포트·설정이 같이 쓴다.
//
// 목록 화면(가방·도감)과 달리 가운데에 창 하나만 뜬다. 원작도 리포트는 요약창
// 하나에 예/아니오만 붙는다.
import { globalStyle, style } from '@vanilla-extract/css'
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
  background: 'rgba(18, 24, 42, 0.78)',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 14,
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
  fontSize: 18,
})

// vanilla-extract는 style 안에서 `& dt` 같은 자식 선택자를 못 받는다.
// globalStyle로 따로 건다
globalStyle(`${info} dt`, { opacity: 0.7 })
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
  background: 'rgba(12, 17, 30, 0.82)',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 14,
})

export const choices = style({
  display: 'flex',
  gap: 12,
})

const choiceBase = style({
  minWidth: 110,
  padding: '10px 22px',
  borderRadius: 10,
  fontSize: 18,
  textAlign: 'center',
  border: `1px solid ${vars.panel.border}`,
  background: 'rgba(18, 24, 42, 0.7)',
})

export const choice = style([choiceBase, { opacity: 0.6 }])

export const choiceOn = style([choiceBase, {
  background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.94), rgba(226, 234, 250, 0.9))',
  color: '#131a2c',
  fontWeight: 700,
  borderColor: 'transparent',
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
  fontSize: 13,
  lineHeight: 1.6,
  opacity: 0.86,
  borderRadius: 10,
  border: `1px solid ${vars.panel.border}`,
  background: 'rgba(12, 17, 30, 0.6)',
})

export const backupButton = style({
  appearance: 'none',
  padding: '5px 10px',
  fontSize: 12,
  color: 'inherit',
  borderRadius: 999,
  border: `1px solid ${vars.panel.border}`,
  background: 'rgba(30, 38, 60, 0.9)',
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
  opacity: 0.85,
  fontSize: 15,
})

/** 값 후보를 오른쪽에 늘어놓는다. 고른 것에만 색이 찬다 */
export const values = style({
  display: 'flex',
  gap: 4,
  marginLeft: 'auto',
})

const valueBase = style({
  padding: '3px 11px',
  borderRadius: 5,
  fontSize: 14,
  whiteSpace: 'nowrap',
})

export const value = style([valueBase, { opacity: 0.5 }])

export const valueOn = style([valueBase, {
  background: vars.hud.accent,
  color: '#0c1220',
  fontWeight: 700,
}])

/** 항목 설명 — 원작도 아래 화면에 한 줄로 띄운다 */
export const help = style({
  marginTop: 14,
  minHeight: 56,
  fontSize: 16,
  lineHeight: '26px',
  opacity: 0.75,
  whiteSpace: 'pre-line',
  textAlign: 'center',
})

/** 원작에 없는 항목임을 밝히는 표 */
export const ours = style({
  marginLeft: 8,
  fontSize: 12,
  padding: '2px 7px',
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.12)',
  opacity: 0.8,
  verticalAlign: 'middle',
})
