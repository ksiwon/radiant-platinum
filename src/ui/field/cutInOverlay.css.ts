// 조우 컷인 덮개.
//
// ⚠️ **배틀 화면(300)보다 위다.** 컷인이 끝나는 프레임이 검정이고 그 검정이
// 배틀이 열리는 이음매를 덮어야 한다 — 밑에 두면 체력 상자가 컷인 위로 뜬다.
// 메뉴(400)보다는 아래다: 컷인이 도는 동안 메뉴가 떠 있는 일은 없다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

const full = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
} as const

/** 번쩍임과 마지막 검정. 색은 프레임마다 스크립트가 갈아 끼운다 */
export const cover = style({
  ...full,
  zIndex: 350,
  display: 'none',
  opacity: 0,
})

/**
 * 조리개 (`FADE_TYPE_CIRCLE_OUT`).
 *
 * 가운데만 남기고 조여든다. 원작은 주사선마다 창을 좁히는데 우리는
 * `radial-gradient` 하나로 같은 모양을 만든다 — 두 화면이 아니라 한 화면이라
 * 세로가 짧아 원이 타원이 되면 안 되므로 **긴 쪽 기준의 원**으로 둔다
 */
export const iris = style({
  ...full,
  zIndex: 349,
  display: 'none',
  background: vars.scrim.black,
})
