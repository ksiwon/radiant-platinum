// 시작 메뉴 — 원작처럼 화면 오른쪽에 붙는 세로 창.
//
// 전체를 덮지 않는다. 오버월드가 뒤에 그대로 보여야 "잠깐 메뉴를 연 것"이 되고,
// 그래야 도감·가방 같은 전체 화면과 층이 갈린다.
//
// 항목 수가 상황에 따라 둘에서 일곱까지 오간다(도감은 받기 전에는 없다). 그래서
// 높이를 고정하지 않고 줄 높이만 원작처럼 맞춰 둔다.
//
// ⚠️ **창을 여기서 다시 그리지 않는다.** 한때 이 파일이 「전체 화면 메뉴와 같은
// 테두리·같은 띠를 쓴다」고 주석에 적어 놓고 그 값을 손으로 베꼈다. 그러는 사이
// 창 그러데이션이 3단과 2단으로 갈라져 있었다 — 말로 적은 규칙은 안 지켜진다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, TEXT } from '../theme/scale'
import { PICKED, WINDOW, row as baseRow } from '../theme/window.css'
import { OVERLAY_Z } from './menuChrome.css'

export const frame = style({
  position: 'fixed',
  inset: 0,
  zIndex: OVERLAY_Z,
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'flex-start',
  padding: GAP.loose,
  pointerEvents: 'none',
  fontFamily: vars.font.ui,
  userSelect: 'none',
})

/** 창. 전체 화면 메뉴와 **같은 것**이다 — 같은 파일에서 온다 */
export const card = style({
  ...WINDOW,
  minWidth: 176,
  padding: GAP.tight + 2,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
})

/**
 * 한 줄.
 *
 * 전체 화면 메뉴는 커서를 `::before`로 띄우지만 여기는 손가락 표를 글자로
 * 들고 있어서(`StartMenu.tsx`) 가로 flex라야 한다. **띠와 글자색은 같은
 * 것**이고(`rowOn`), 다른 것은 그 배치뿐이다
 */
export const row = style([baseRow, {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: `0 ${GAP.base}px 0 2px`,
  whiteSpace: 'nowrap',
}])

export const rowOn = style([row, {
  ...PICKED,
  fontWeight: 700,
}])

/** 손가락 커서 자리. 비어 있을 때도 폭을 차지해야 글자가 안 흔들린다 */
export const cursor = style({
  display: 'inline-block',
  width: 18,
  textAlign: 'center',
  fontSize: TEXT.tiny,
})
