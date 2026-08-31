// 메뉴 화면 공통 껍데기.
//
// ⚠️ **여기서 창을 그리지 않는다.** 창 한 벌은 `ui/theme/window.css`에 있고
// (DESIGN.md §3) 이 파일은 그것을 **자리에 앉히는 일**만 한다. 한때 이 파일이
// 자기 창을 따로 그렸고, 그 값을 시작 메뉴가 손으로 베꼈고, 그 사이 테두리 한
// 줄이 알파 넷으로 갈라졌다.
//
// 지금 지키는 규칙 셋:
//
//   ① **창은 화면이 아니다.** 원작은 256×192 안에 전부 담는다. 우리도 가운데
//      정해진 크기의 창 하나를 두고 그 안에서만 논다. 화면이 넓어지면 창이
//      커지는 게 아니라 **여백이 커진다**.
//   ② **안 고른 줄은 아무것도 아니다.** 원작 목록은 글자만 있고 고른 줄
//      하나에만 띠가 깔린다. 줄마다 판을 깔면 목록이 아니라 카드 더미다.
//   ③ **기울이지 않는다.** 배틀 명령 칸의 각을 메뉴까지 끌고 왔더니 쓸데없이
//      기운 것이 됐다. 배틀은 네 칸을 한눈에 가르려고 기운 것이고, 세로로
//      늘어선 목록은 그럴 이유가 없다.
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, SCREEN, TEXT } from '../theme/scale'
import { RULE, WINDOW, scrim, scrimLight } from '../theme/window.css'

export const OVERLAY_Z = 400

/**
 * 화면 전체를 덮는다. 뒤의 3D는 계속 돈다.
 *
 * ⚠️ **흐리지 않는다.** 창이 밝아진 뒤로 뒤를 흐릴 이유가 없다 — 밝은 창과
 * 어두운 3D는 그 자체로 갈린다.
 *
 * `colorScheme`이 여기 있는 이유: 안 주면 넘치는 칸의 스크롤막대가 브라우저
 * 기본값을 따라가서 밝은 창 안에 어두운 막대가 선다
 */
export const overlay = style([scrim, { zIndex: OVERLAY_Z, colorScheme: 'light' }])

/** 3D가 주인공인 화면 — 뒤를 안 가린다 */
export const cinematicOverlay = style([scrimLight, { zIndex: OVERLAY_Z, colorScheme: 'light' }])

/**
 * 창 하나.
 *
 * 세로 flex라 자식이 셋이든 넷이든 **본문만 남는 높이를 먹는다**. 전에는
 * `grid-template-rows: auto 1fr auto`였는데 가방처럼 자식이 넷인 화면에서
 * 1fr이 주머니 줄에 걸려, 주머니 이름표가 창 높이의 3분의 2를 차지했다
 */
export const screen = style({
  ...WINDOW,
  position: 'relative',
  width: `min(${SCREEN.width}px, 100%)`,
  height: `min(${SCREEN.height}px, 100%)`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
})

export const cinematicScreen = screen

export const head = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: GAP.wide,
  height: 44,
  padding: `0 ${GAP.wide}px`,
  borderBottom: RULE,
})

/**
 * 화면 이름.
 *
 * ⚠️ **색 세로줄을 안 붙인다.** 제목 옆의 4px 색 막대는 「AI가 만든 화면」의
 * 대표 표식으로 꼽히는 모양이고(DESIGN.md §0), 게다가 그 색이 경고색이었다.
 * 제목은 굵은 글자로 선다.
 */
export const crest = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.small,
  minWidth: 0,
})

export const crestText = style({
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

/** 오른쪽 보조 정보 — 소지금·마릿수 */
export const headNote = style({
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
})

/**
 * 본문.
 *
 * 왼쪽이 고르는 것, 오른쪽이 그것에 대한 것. 가르는 것은 판이 아니라
 * **세로선 하나**다
 */
export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.86fr)',
  gap: GAP.base,
  padding: `${GAP.small}px ${GAP.base}px`,
  '@media': {
    '(max-width: 760px)': { gridTemplateColumns: '1fr' },
  },
})

/** 한 칸 전체를 쓰는 본문 (트레이너 카드처럼 목록이 없는 화면) */
export const stageWide = style([stage, { gridTemplateColumns: '1fr' }])

export const list = style({
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  paddingRight: GAP.tight,
  scrollbarWidth: 'thin',
})

// 목록 줄·커서는 창 한 벌의 것이다. 여기서 다시 그리지 않는다
export { caret, row, rowDim, rowOn } from '../theme/window.css'

/** 줄 안쪽. 아이콘·이름·숫자를 한 줄로 세운다 */
export const face = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  height: '100%',
})

/** 이름 — 길면 잘린다. 목록이 흔들리지 않게 */
export const label = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 줄 오른쪽 끝의 숫자 — 값처럼 자리가 맞아야 하는 것 */
export const count = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: vars.font.mono,
  fontSize: TEXT.small,
})

/**
 * 이름 **바로 옆**에 붙는 숫자.
 *
 * 개수는 이름의 일부처럼 읽힌다("상처약 ×5"). 줄 끝으로 밀어 놓으면 이름과
 * 숫자 사이가 텅 비어서 둘을 눈으로 이어 붙여야 한다
 */
export const countNear = style({
  flex: '0 0 auto',
  marginLeft: -3,
  fontVariantNumeric: 'tabular-nums',
  fontFamily: vars.font.mono,
  fontSize: TEXT.small,
  color: vars.ink.dim,
})

/** 오른쪽 칸. 판이 아니라 세로선 하나로 갈린다 */
export const detail = style({
  minHeight: 0,
  overflowY: 'auto',
  // ⚠️ `overflow-x: hidden`이 꼭 있어야 한다. 전에는 여기에 바깥으로 삐져나온
  // `::before` 번짐을 깔아서, 가로 스크롤막대가 설명칸 아래에 늘 떠 있었다
  overflowX: 'hidden',
  padding: `2px ${GAP.tight}px ${GAP.small}px ${GAP.wide}px`,
  borderLeft: RULE,
  scrollbarWidth: 'thin',
})

export const detailTitle = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.small,
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
  marginBottom: 3,
})

export const detailSub = style({
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
  fontVariantNumeric: 'tabular-nums',
})

export const detailText = style({
  fontSize: TEXT.base,
  lineHeight: 1.62,
  whiteSpace: 'pre-line',
})

/**
 * 설명 안의 작은 제목 — "능력", "기술".
 *
 * ⚠️ **자간을 벌린 작은 라벨을 안 쓴다.** 영문 대문자표든 한국어든 모양은
 * 같은 것이고, 그게 웹앱의 말투다. 남은 폭을 실선으로 채우는 쪽이 게임 창에
 * 가깝고, 그 선이 아래 내용의 범위를 알려 준다
 */
export const detailHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  margin: `${GAP.base}px 0 ${GAP.tight}px`,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.ink.dim,
  '::after': {
    content: '""',
    flex: 1,
    height: 1,
    background: vars.window.rule,
  },
})

export const foot = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  height: 28,
  padding: `0 ${GAP.wide}px`,
  borderTop: RULE,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})

/** 아이콘 한 칸. 크기는 `itemIcon()`이 인라인으로 준다 */
export const icon = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 왼쪽 색 조각. 아이콘이 없는 목록에서 색이 갈래를 나른다 */
export const dot = style({
  width: 10,
  height: 10,
  borderRadius: RADIUS.bar,
  flex: '0 0 auto',
  background: 'currentColor',
})

/**
 * 갈래 줄 — 가방 주머니.
 *
 * 창 위쪽에 붙는 **탭**이다. 고른 것만 금 테두리로 서고 아래 본문과 이어진다
 */
export const tabs = style({
  flex: '0 0 auto',
  display: 'flex',
  gap: 2,
  padding: `${GAP.small}px ${GAP.base}px 0`,
  borderBottom: RULE,
})

const tabBase = style({
  padding: `${GAP.tight}px ${GAP.base}px ${GAP.tight + 2}px`,
  fontSize: TEXT.small,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  borderRadius: `${RADIUS.cell}px ${RADIUS.cell}px 0 0`,
  marginBottom: -1,
  color: vars.ink.dim,
})

export const tab = styleVariants({
  off: [tabBase],
  on: [tabBase, {
    background: vars.pick.face,
    boxShadow: `inset 0 ${EDGE.bar}px 0 ${vars.pick.edge},`
      + ` inset ${EDGE.bar}px 0 0 ${vars.pick.edge},`
      + ` inset -${EDGE.bar}px 0 0 ${vars.pick.edge}`,
    color: vars.pick.text,
    fontWeight: 700,
  }],
})

/**
 * 창 없이 뜨는 화면(리포트·되돌릴 수 없는 물음)의 조작 안내.
 *
 * `foot`은 창 바닥에 붙는 띠라 테두리가 있다. 창이 없는 자리에 그걸 쓰면
 * 짧은 선 하나가 허공에 떠 있게 된다
 */
export const hint = style({
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
  textAlign: 'center',
  paddingBottom: GAP.tight,
})

/** 목록이 비었을 때 */
export const empty = style({
  padding: `${GAP.base}px ${GAP.tight}px`,
  fontSize: TEXT.small,
  color: vars.ink.faint,
})
