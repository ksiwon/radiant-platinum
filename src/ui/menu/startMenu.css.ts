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

/**
 * 창.
 *
 * 전체 화면 메뉴와 **같은 테두리·같은 띠**를 쓴다. 여기만 다른 값을 쓰면
 * 시작 메뉴에서 가방으로 들어갈 때 다른 게임으로 넘어간 것처럼 보인다
 */
export const card = style({
  minWidth: 176,
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  background: 'linear-gradient(180deg, #1a2138 0%, #101629 100%)',
  border: '1px solid rgba(150, 176, 224, 0.34)',
  borderRadius: 10,
  boxShadow: '0 0 0 2px rgba(6, 9, 17, 0.85), 0 16px 38px rgba(0, 0, 0, 0.55)',
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: 32,
  padding: '0 12px 0 2px',
  borderRadius: 6,
  fontSize: 16,
  whiteSpace: 'nowrap',
})

export const rowOn = style([row, {
  background: 'linear-gradient(180deg, #eef3ff 0%, #cddaf4 100%)',
  color: '#111726',
  fontWeight: 700,
}])

/** 손가락 커서 자리. 비어 있을 때도 폭을 차지해야 글자가 안 흔들린다 */
export const cursor = style({
  display: 'inline-block',
  width: 18,
  textAlign: 'center',
  fontSize: 11,
})
