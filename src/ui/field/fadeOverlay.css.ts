// 화면 페이드 덮개.
//
// ⚠️ **대사창 위, 메뉴 아래다.** 원작은 두 화면을 통째로 덮으므로 대사창도
// 같이 어두워져야 한다(zIndex 200). 다만 메뉴가 떠 있는 동안(400)은 그 화면이
// 이미 필드를 대신하고 있으므로 그 위를 덮으면 아무것도 안 보인다.
import { style } from '@vanilla-extract/css'

export const cover = style({
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  display: 'none',
  opacity: 0,
  background: '#000',
  pointerEvents: 'none',
})
