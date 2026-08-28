// 필드 창의 살갗과 그 위에 뜨는 예/아니오 — **두 파일이 같은 것을 그렸다** (REPAIR §9)
//
// 대사창(`messageBox`)과 파트너 고르기(`chooseStarter`)가 같은 창을 그린다.
// 원작도 그렇다 — 둘 다 `STANDARD_WINDOW_SYSTEM`의 창틀 하나를 쓴다. 그래서
// 두 벌로 두면 **한쪽 테두리만 고쳐지고 다른 쪽은 안 따라온다.**
//
// ⚠️ **소지금 창은 여기 안 든다** (`currencyWindow`). 그쪽은 모서리가 8이고
// 그림자도 얕다 — 원작에서도 작은 창이라 일부러 다르다.
import { style } from '@vanilla-extract/css'

/** 창 하나의 살갗. 자리와 여백은 쓰는 쪽이 정한다 */
export const SKIN = {
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 2px rgba(255, 255, 255, 0.7)',
  color: '#20263a',
} as const

/**
 * 예/아니오 차림표 (`ScrCmd_ShowYesNoMenu`).
 *
 * 원작은 창 자리를 명령 인자로 받지만 우리 화면은 해상도가 다르므로 대사창 위
 * 오른쪽에 붙인다. 자리가 달라도 고르는 값은 같다
 */
export const menu = style({
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 10px)',
  minWidth: 128,
  ...SKIN,
  padding: '8px 12px',
  fontSize: 18,
  lineHeight: '30px',
})
