// 레벨업 능력치 창의 스타일 — 파티 화면의 이상한사탕과 배틀의 레벨업이 같이 쓴다 (`LevelPanel.tsx`).
//
// 원작은 14×12칸 창을 파티 화면 왼쪽 위(1,1)에 띄운다. 우리는 **고른 판이 선 열 안에** 앉힌다 — 자리는 부르는
// 쪽이 `style`로 준다(`partyPlace.placeInColumn`). 이름은 왼쪽, 값은 오른쪽 끝에 맞춘다.
import { style } from '@vanilla-extract/css'
import { GAP, TEXT } from '../theme/scale'
import { WINDOW_SMALL } from '../theme/window.css'

/** 창 폭. 이름(특수공격 · 특수방어)과 값(+n · 세 자리 값)이 한 줄에 든다 */
export const PANEL_WIDTH = 220

export const levelPanel = style({
  ...WINDOW_SMALL,
  position: 'absolute',
  left: GAP.base,
  top: GAP.base,
  zIndex: 2,
  width: PANEL_WIDTH,
  boxSizing: 'border-box',
  padding: `${GAP.small}px ${GAP.base}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
})

export const levelRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: GAP.base,
  fontSize: TEXT.base,
  lineHeight: 1.5,
})

export const levelValue = style({
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
})
