// 시작 메뉴 — 원작처럼 화면 오른쪽에 붙는 세로 창.
//
// 전체를 덮지 않는다. 오버월드가 뒤에 그대로 보여야 "잠깐 메뉴를 연 것"이 되고,
// 그래야 도감·가방 같은 전체 화면과 층이 갈린다.
//
// 항목 수가 상황에 따라 둘에서 일곱까지 오간다(도감은 받기 전에는 없다). 그래서
// 높이를 고정하지 않고 줄 높이만 원작처럼 맞춰 둔다.
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
  minWidth: 200,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  background: 'linear-gradient(180deg, rgba(26, 35, 60, 0.96), rgba(13, 18, 33, 0.96))',
  // 원작 창은 테두리가 두 겹이다 — 바깥이 짙고 안쪽이 밝다
  border: '2px solid rgba(150, 176, 224, 0.55)',
  outline: '2px solid rgba(8, 12, 22, 0.75)',
  borderRadius: 12,
  boxShadow: '0 16px 38px rgba(0, 0, 0, 0.55)',
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '7px 12px 7px 4px',
  borderRadius: 8,
  fontSize: 18,
  lineHeight: '24px',
  whiteSpace: 'nowrap',
})

export const rowOn = style([row, {
  background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.95), rgba(222, 232, 252, 0.9))',
  color: '#131a2c',
  fontWeight: 700,
}])

/** 손가락 커서 자리. 비어 있을 때도 폭을 차지해야 글자가 안 흔들린다 */
export const cursor = style({
  display: 'inline-block',
  width: 18,
  textAlign: 'center',
  fontSize: 13,
})
