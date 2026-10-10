// `MonViewport`의 스타일 (SYSTEM §2.4). 구멍은 투명한 상자 하나다 — 3D는 이 사각형 **뒤에서** 메인 프레임 뒤의
// 시저 패스가 그리고, 창 얼굴은 `MenuScreen hole`의 `HOLE_MASK`가 이 구멍만큼 뚫는다.
//
// 3D가 못 서는 경우(2D 앞모습 · 안 본 칸의 「?」)는 이 상자 **안에** 그린다 — 그때는 구멍을 안 내므로 창 얼굴이
// 그대로 뒤에 선다.
//
// 뒷배경 색은 3D 쪽에 hex를 두지 않으려고 여기서 CSS 변수로 내보낸다. 3D 쪽(`MonViewportStage`)이 읽을 때
// `getComputedStyle`로 푼다 — 변수는 값으로 풀려서 `#f7fdfe` 꼴로 나온다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, RADIUS, TEXT } from '../theme/scale'

export const viewport = style({
  position: 'relative',
  flex: '0 0 auto',
  display: 'grid',
  placeItems: 'center',
  // 글자 0 · 역할 없음 — 이름 같은 글은 구멍 **밖**에 둔다
  pointerEvents: 'none',
  vars: {
    '--mv-face-top': vars.window.faceTop,
    '--mv-face-mid': vars.window.faceMid,
    '--mv-face-bottom': vars.window.faceBottom,
  },
})

/** 2D 앞모습. 크기와 그림은 `pixelSprite`가 인라인으로 준다 (정수배만) */
export const sprite = style({
  flex: '0 0 auto',
})

/**
 * 안 본 칸의 「?」 — 고리 안의 굵은 물음표 (pokedex.md §4.4).
 *
 * 글자를 DOM에 안 둔다(`textContent` 0이 이 부품의 계약이다). 물음표는 `::after`의 `content`다
 */
export const unseen = style({
  width: 120,
  height: 120,
  borderRadius: RADIUS.round,
  border: `${String(EDGE.window)}px solid ${vars.window.edge}`,
  boxSizing: 'border-box',
  display: 'grid',
  placeItems: 'center',
  selectors: {
    '&::after': {
      content: '"?"',
      fontFamily: vars.font.ui,
      fontWeight: 800,
      fontSize: TEXT.big * 2,
      lineHeight: 1,
      color: vars.ink.faint,
    },
  },
})
