// 리포트 요약창 — 필드 위에 얹는다 (PARITY §4.12)
//
// 원작이 화면 **왼쪽 위**에 놓고 그 아래를 대사창이 쓴다. 소지금 창과 같은
// 4:3 무대를 깔아 어떤 창 모양에서도 같은 자리에 뜨게 한다
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const stage = style({
  position: 'fixed',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(100vw, calc(100vh * 4 / 3))',
  height: 'min(100vh, calc(100vw * 3 / 4))',
  zIndex: 195,
  pointerEvents: 'none',
  fontFamily: vars.font.ui,
  userSelect: 'none',
})

export const panel = style({
  position: 'absolute',
  left: '3%',
  top: '4%',
  minWidth: '38%',
  padding: '0.7em 1em',
  borderRadius: 8,
  background: 'rgba(18, 22, 34, 0.92)',
  border: `1px solid ${vars.panel.border}`,
  color: vars.panel.text,
  fontSize: 'clamp(11px, 2.1vh, 17px)',
})

/** 「저장 중」 — 원작은 오른쪽 아래에서 도는 작은 아이콘이다 */
export const icon = style({
  position: 'absolute',
  right: '4%',
  bottom: '5%',
  padding: '0.3em 0.8em',
  borderRadius: 999,
  background: 'rgba(18, 22, 34, 0.92)',
  border: `1px solid ${vars.panel.border}`,
  color: vars.panel.text,
  fontSize: 'clamp(10px, 1.8vh, 15px)',
})
