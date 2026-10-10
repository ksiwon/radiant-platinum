// `MonViewport`의 자리 (SYSTEM §2.4). 투명한 상자 하나다 — 3D는 이 사각형 **뒤에서** 메인 프레임 뒤의 시저
// 패스가 그리고, 창 얼굴은 `MenuScreen hole`의 `HOLE_MASK`가 이 구멍만큼 뚫는다.
import { style } from '@vanilla-extract/css'

export const viewport = style({
  position: 'relative',
  flex: '0 0 auto',
  // 글자 0 · 역할 없음 — 이름 같은 글은 구멍 **밖**에 둔다
  pointerEvents: 'none',
})
