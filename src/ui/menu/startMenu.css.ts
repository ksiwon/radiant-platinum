// 시작 메뉴 — 원작처럼 화면 오른쪽에 붙는 세로 카드.
//
// 전체를 덮지 않는다. 오버월드가 뒤에 그대로 보여야 "잠깐 메뉴를 연 것"이 되고,
// 그래야 도감·가방 같은 전체 화면과 층이 갈린다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { OVERLAY_Z } from './menuChrome.css'

export const frame = style({
  position: 'fixed',
  inset: 0,
  zIndex: OVERLAY_Z,
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'flex-start',
  padding: 24,
  pointerEvents: 'none',
  fontFamily: vars.font.ui,
  color: vars.panel.text,
  userSelect: 'none',
})

export const card = style({
  minWidth: 190,
  padding: 10,
  background: 'linear-gradient(180deg, rgba(24, 32, 54, 0.94), rgba(14, 19, 34, 0.94))',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 14,
  boxShadow: '0 14px 34px rgba(0, 0, 0, 0.5)',
})
