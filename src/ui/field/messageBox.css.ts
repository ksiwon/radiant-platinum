// 대사창 — 원작 배치. 화면 아래에 붙은 두 줄짜리 창이다.
//
// 창 높이를 **두 줄로 못 박는다.** 원작 창이 27×4타일이고 글꼴 높이로 정확히
// 두 줄이라, \r(비우기)과 \f(한 줄 올리기)가 여기서 갈린다. 늘어나는 창으로
// 만들면 그 구분이 화면에서 사라진다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 원작 창의 가로세로비 27:4. 그것보다 넓어지지 않게 최대 폭을 둔다 */
const MAX_WIDTH = 760

export const frame = style({
  position: 'fixed',
  left: '50%',
  bottom: 24,
  transform: 'translateX(-50%)',
  width: `min(calc(100vw - 48px), ${MAX_WIDTH}px)`,
  zIndex: 200,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  pointerEvents: 'none',
})

export const box = style({
  position: 'relative',
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 2px rgba(255, 255, 255, 0.7)',
  color: '#20263a',
  padding: '14px 26px 14px 20px',
  fontSize: 19,
  lineHeight: '30px',
  // 두 줄 고정. 한 줄짜리 글도 창이 안 줄어든다 — 원작과 같다
  minHeight: 60,
})

export const line = style({
  whiteSpace: 'pre',
  height: 30,
})

export const run = style({
  verticalAlign: 'baseline',
})

const blink = keyframes({
  '0%, 45%': { opacity: 1, transform: 'translateY(0)' },
  '55%, 100%': { opacity: 0.25, transform: 'translateY(2px)' },
})

/** 다음을 기다리는 표시. 원작도 오른쪽 아래에서 깜빡인다 */
export const arrow = style({
  position: 'absolute',
  right: 10,
  bottom: 4,
  fontSize: 13,
  color: '#4a5a80',
  animation: `${blink} 0.7s steps(1, end) infinite`,
})

export const menu = style({
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 10px)',
  minWidth: 128,
  background: 'linear-gradient(180deg, rgba(250, 250, 252, 0.96), rgba(232, 236, 244, 0.96))',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 2px rgba(255, 255, 255, 0.7)',
  color: '#20263a',
  padding: '8px 12px',
  fontSize: 18,
  lineHeight: '30px',
})

/**
 * 목록 메뉴. 예/아니오와 달리 항목이 길고 많다 — 여덟 개를 넘으면 스크롤한다.
 *
 * 원작은 창 자리를 명령 인자로 받지만(`anchorX`/`anchorY`) 우리 화면은 해상도가
 * 다르므로 대사창 위 오른쪽에 붙인다. 자리가 달라도 고르는 값은 같다
 */
export const listMenu = style([menu, {
  display: 'grid',
  gap: '0 18px',
  maxHeight: 8 * 30 + 16,
  overflowY: 'auto',
}])

/** 커서를 올린 항목의 설명 (`AddListMenuEntry`의 셋째 인자) */
export const altText = style({
  position: 'absolute',
  left: 0,
  bottom: 'calc(100% + 10px)',
  maxWidth: '55%',
  background: 'rgba(24, 30, 46, 0.92)',
  border: '2px solid rgba(60, 74, 102, 0.85)',
  borderRadius: 10,
  color: '#e8ecf4',
  padding: '8px 14px',
  fontSize: 16,
  lineHeight: '24px',
  whiteSpace: 'pre-line',
})

export const menuItem = style({
  paddingLeft: 22,
})

/** 고른 칸에 삼각 커서를 세운다. 원작도 색이 아니라 커서로 가리킨다 */
export const menuItemOn = style([menuItem, {
  position: 'relative',
  fontWeight: 700,
  selectors: {
    '&::before': {
      content: '"▶"',
      position: 'absolute',
      left: 2,
      fontSize: 12,
      lineHeight: '30px',
    },
  },
}])

/**
 * 간판 판 (`Signpost`).
 *
 * ⚠️ **대사창과 다른 창이다.** 원작에서 마을 이름표·도로 표지판은 아래에 붙는
 * 대사창이 아니라 **화면 가운데로 밀려 들어오는 나무 판**에 뜬다.
 *
 * ⚠️ 다만 **네 종류가 다 그런 것은 아니다.** 원작이 판 테두리를 그리는 것은
 * 0(지도)·1(화살표)뿐이고 2(명패)·3(흘림)은 보통 대사창 테두리를 쓴다
 * (`Window_DrawSignpost`가 거기서 갈린다). 실측으로 2번 77곳 · 3번 26곳이라
 * 간판의 절반이 넘는다 — 넷을 다 나무 판으로 그리면 그만큼 틀린다.
 *
 * 테두리 자체는 CSS다. 원작은 48×24짜리 타일로 9칸 테두리를 채우는데
 * (`DrawSignpostFrame`) 우리 판은 DOM이라 그 절차를 옮길 자리가 없다 —
 * **안에 붙는 그림만** 원작 것을 쓴다
 */
export const signFrame = style({
  position: 'fixed',
  left: '50%',
  top: '38%',
  transform: 'translate(-50%, -50%)',
  width: 'min(calc(100vw - 48px), 560px)',
  zIndex: 200,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  pointerEvents: 'none',
})

export const signBox = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  background: 'linear-gradient(180deg, #d8b483 0%, #c39a66 55%, #b08a58 100%)',
  border: '3px solid #6b4a29',
  borderRadius: 6,
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(255, 236, 200, 0.55)',
  color: '#33210f',
  padding: '16px 22px',
  fontSize: 19,
  lineHeight: '30px',
  textAlign: 'center',
  minHeight: 60,
})

/**
 * 판 왼쪽에 붙는 48×32 그림 (`data/signposts.png`).
 *
 * 마을이면 그 마을의 약도, 도로면 갈래를 그린 화살표다. 도트를 키우는 것이라
 * 보간을 끈다 — 안 끄면 8×8 타일이 뭉개져서 화살표가 안 읽힌다
 */
export const signPicture = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  borderRadius: 3,
  boxShadow: 'inset 0 0 0 2px rgba(107, 74, 41, 0.6)',
})

/** 그림을 붙였을 때 글이 왼쪽으로 붙는다 — 가운데 정렬이면 그림과 겹쳐 보인다 */
export const signText = style({
  flex: '1 1 auto',
  textAlign: 'center',
})
