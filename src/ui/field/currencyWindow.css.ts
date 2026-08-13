// 소지금·코인 창 — 원작 배치 (`FieldMenu_CreateMoneyWindow`)
//
// 원작이 **타일 좌표**로 자리를 준다 (`ShowMoney 20, 2` = 왼쪽 20타일 · 위 2타일).
// 화면이 256×192픽셀이고 타일이 8픽셀이니 32×24칸이다. 그 비율을 그대로 옮기려고
// 화면 전체를 덮는 4:3 무대를 깔고 그 안에 퍼센트로 놓는다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

// ⚠️ **타일 → 퍼센트 함수는 여기 못 둔다.** vanilla-extract는 `.css.ts`가
// 평범한 값만 내보내게 하고 함수를 내보내면 빌드가 선다 — 그 계산은 화면
// 파일(`CurrencyWindow.tsx`)이 갖는다

/** 4:3 무대. 창이 어떤 모양이든 원작 비율을 지킨다 */
export const stage = style({
  position: 'fixed',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(100vw, calc(100vh * 4 / 3))',
  height: 'min(100vh, calc(100vw * 3 / 4))',
  zIndex: 190,
  pointerEvents: 'none',
  fontFamily: vars.font.ui,
  userSelect: 'none',
})

/**
 * 창 하나. 원작 창틀(`STANDARD_WINDOW_SYSTEM`)과 같은 자리에 같은 크기로 놓는다.
 *
 * 글자 크기는 무대 높이에서 낸다 — 원작 글꼴이 192픽셀 화면에서 12픽셀이라
 * 대략 1/16이다
 */
export const box = style({
  position: 'absolute',
  boxSizing: 'border-box',
  padding: '0.2em 0.5em',
  display: 'grid',
  alignContent: 'center',
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 8,
  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
  color: '#20263a',
  fontWeight: 700,
  whiteSpace: 'pre',
  // ⚠️ 부모 글자 크기가 아니라 **화면 높이**에서 낸다. `100%`로 잡으면 16px의
  // 한 조각이 되어 숫자가 점 하나로 뜬다 (PC 전당 화면에서 겪은 그것이다)
  fontSize: 'clamp(11px, calc(min(100vh, calc(100vw * 3 / 4)) / 18), 24px)',
})

/** 이름표는 왼쪽 위, 숫자는 **오른쪽 맞춤**이다 (`printerOffset`) */
export const label = style({ textAlign: 'left' })
export const amount = style({ textAlign: 'right' })
