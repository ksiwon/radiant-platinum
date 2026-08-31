// 대사창 — 원작 배치. 화면 아래에 붙은 두 줄짜리 창이다.
//
// 창 높이를 **두 줄로 못 박는다.** 원작 창이 27×4타일이고 글꼴 높이로 정확히
// 두 줄이라, \r(비우기)과 \f(한 줄 올리기)가 여기서 갈린다. 늘어나는 창으로
// 만들면 그 구분이 화면에서 사라진다.
//
// ⚠️ **여기만 픽셀 글꼴이다** (DESIGN.md §4). 원작 대사창이 픽셀 글꼴이고,
// 시스템 UI 글꼴로 두는 동안에는 무엇을 더 손봐도 화면이 게임으로 안 읽혔다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { menu, SKIN } from './fieldWindow.css'

/** 원작 창의 가로세로비 27:4. 그것보다 넓어지지 않게 최대 폭을 둔다 */
const MAX_WIDTH = 760

export const frame = style({
  position: 'fixed',
  left: '50%',
  bottom: GAP.loose,
  transform: 'translateX(-50%)',
  width: `min(calc(100vw - 48px), ${MAX_WIDTH}px)`,
  zIndex: 200,
  fontFamily: vars.font.pixel,
  userSelect: 'none',
  pointerEvents: 'none',
})

export const box = style({
  position: 'relative',
  ...SKIN,
  padding: `${GAP.base + 2}px ${GAP.loose + 2}px ${GAP.base + 2}px ${GAP.wide + 4}px`,
  fontSize: TEXT.list + 2,
  lineHeight: `${LINE.message}px`,
  // 두 줄 고정. 한 줄짜리 글도 창이 안 줄어든다 — 원작과 같다
  minHeight: LINE.message * 2,
})

export const line = style({
  whiteSpace: 'pre',
  height: LINE.message,
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
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  animation: `${blink} ${TIME.blink} steps(1, end) infinite`,
})

export { menu }

/** 목록 메뉴. 예/아니오와 달리 항목이 길고 많다 — 여덟 개를 넘으면 스크롤한다 */
export const listMenu = style([menu, {
  display: 'grid',
  gap: `0 ${GAP.wide + 2}px`,
  maxHeight: 8 * LINE.message + GAP.wide,
  overflowY: 'auto',
}])

/** 커서를 올린 항목의 설명 (`AddListMenuEntry`의 셋째 인자) */
export const altText = style({
  position: 'absolute',
  left: 0,
  bottom: 'calc(100% + 10px)',
  maxWidth: '55%',
  ...SKIN,
  padding: `${GAP.small}px ${GAP.base + 2}px`,
  fontSize: TEXT.base,
  lineHeight: `${LINE.row - 8}px`,
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
      fontSize: TEXT.tiny,
      lineHeight: `${LINE.message}px`,
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
  fontFamily: vars.font.pixel,
  userSelect: 'none',
  pointerEvents: 'none',
})

/**
 * 나무 판.
 *
 * 창이 아니라 **물건**이라 창 한 벌을 안 따른다 (DESIGN.md §3). 그림자는
 * 안 붙인다 — 원작 판도 화면에 그림자를 안 떨어뜨린다
 */
export const signBox = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.wide + 2,
  background: `linear-gradient(180deg, ${vars.sign.face} 0%, ${vars.sign.faceDim} 100%)`,
  border: `${EDGE.window}px solid ${vars.sign.edge}`,
  borderRadius: RADIUS.bar + 2,
  color: vars.sign.text,
  padding: `${GAP.wide}px ${GAP.loose - 2}px`,
  fontSize: TEXT.list + 2,
  lineHeight: `${LINE.message}px`,
  textAlign: 'center',
  minHeight: LINE.message * 2,
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
  borderRadius: RADIUS.bar,
})

/** 그림을 붙였을 때 글이 왼쪽으로 붙는다 — 가운데 정렬이면 그림과 겹쳐 보인다 */
export const signText = style({
  flex: '1 1 auto',
  textAlign: 'center',
})

/**
 * 조각 값 창 (PARITY §10 · `FieldMenuManager_NewMoveTutorCostWindow`).
 *
 * 예/아니오 왼쪽에 붙는다 — 원작도 값 창과 물음이 나란히 뜬다. 자리는 우리
 * 해상도에 맞춘 것이고, 보여 주는 값은 조각 넷의 「필요 / 가진 수」다
 */
export const shardCost = style([menu, {
  right: 'auto',
  left: 0,
  display: 'grid',
  gridTemplateColumns: 'max-content max-content',
  gap: `0 ${GAP.base + 2}px`,
  fontSize: TEXT.base,
  lineHeight: `${LINE.row - 6}px`,
}])

/** 가진 것이 모자란 줄. 살 수 없다는 것이 한눈에 보여야 한다 */
export const shardShort = style({ color: vars.state.bad, fontWeight: 700 })
