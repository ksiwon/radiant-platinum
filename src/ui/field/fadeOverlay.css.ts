// 화면 페이드 덮개.
//
// ⚠️ **대사창 위, 메뉴 아래다.** 원작은 두 화면을 통째로 덮으므로 대사창도
// 같이 어두워져야 한다(zIndex 200). 다만 메뉴가 떠 있는 동안(400)은 그 화면이
// 이미 필드를 대신하고 있으므로 그 위를 덮으면 아무것도 안 보인다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const cover = style({
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  display: 'none',
  opacity: 0,
  background: vars.scrim.black,
  pointerEvents: 'none',
})

/**
 * 비쳐 보이는 색 한 겹 (`screenTint`) — 달콤한향기의 분홍.
 *
 * 대사창보다 아래다. 원작도 분홍을 다 걷은 뒤에야 「아무 일도 없었다」가 뜨므로 둘이 겹칠 일이 없다
 */
export const tint = style({
  position: 'fixed',
  inset: 0,
  zIndex: 150,
  display: 'none',
  opacity: 0,
  pointerEvents: 'none',
})
