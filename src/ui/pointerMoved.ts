// 메뉴 줄의 마우스 커서 — **움직였을 때만** 따라간다
//
// ⚠️ **`onPointerEnter`로 커서를 옮기지 않는다.** 크로미움은 가만히 있는 마우스 밑에 창이
// 새로 뜨면 그 줄에 「들어섰다」고 친다(배치가 바뀐 뒤의 가짜 `mousemove` · `pointerover`).
// 그래서 마우스를 화면 위에 둔 채 키로 하는 사람은 갈래 창이 **마우스 밑 줄에서** 열렸다 —
// 실측(2026-10-08 journey `224740d`): 배틀에서 누른 자리에 마우스가 남아, 가방에서 이상한사탕의
// 「쓴다」를 고르려던 결정이 「버린다」로 가 「몇 개 버리겠습니까?」에 섰다.
//
// 원작은 키(와 터치) 입력뿐이라 이런 길이 없다. 마우스로 고르는 것은 우리가 더한 것이니,
// 사람이 마우스를 **실제로 움직였을 때만** 커서가 따라가게 한다 — 가짜 이동은 이동량이 0이다
import type { PointerEvent as ReactPointerEvent } from 'react'

/** 이 포인터 이동이 사람이 움직인 것인가. 마우스가 아니면(터치 · 펜) 늘 참이다 */
export function pointerMoved(e: ReactPointerEvent): boolean {
  return e.pointerType !== 'mouse' || e.movementX !== 0 || e.movementY !== 0
}
