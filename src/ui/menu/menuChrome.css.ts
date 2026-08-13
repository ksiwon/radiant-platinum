// 메뉴 화면 공통 껍데기.
//
// ⚠️ 두 번 갈아엎었다. 처음엔 둥근 상자 둘을 나란히, 다음엔 9° 기운 알약.
// 둘 다 "웹페이지"로 읽혔다 — 2880픽셀 모니터에서 메뉴가 2880픽셀로 퍼지고,
// 줄마다 테두리·그림자·그러데이션이 붙고, 정작 봐야 할 그림은 작았다.
//
// 지금 지키는 규칙 셋:
//
//   ① **창은 화면이 아니다.** 원작은 256×192 안에 전부 담는다. 우리도 가운데
//      정해진 크기의 창 하나를 두고 그 안에서만 논다. 화면이 넓어지면 창이
//      커지는 게 아니라 **여백이 커진다**.
//   ② **안 고른 줄은 아무것도 아니다.** 원작 목록은 글자만 있고 고른 줄
//      하나에만 밝은 띠가 깔린다. 줄마다 판을 깔면 목록이 아니라 카드 더미다.
//   ③ **기울이지 않는다.** 배틀 명령 칸의 각을 메뉴까지 끌고 왔더니 쓸데없이
//      기운 것이 됐다. 배틀은 네 칸을 한눈에 가르려고 기운 것이고, 세로로
//      늘어선 목록은 그럴 이유가 없다.
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const OVERLAY_Z = 400

/** 창 테두리·구분선. 한 값으로 묶어야 선이 제각각으로 안 논다 */
const EDGE = 'rgba(150, 176, 224, 0.34)'
/** 고른 줄의 띠. 원작도 밝은 띠에 어두운 글자다 */
const PICK_BG = 'linear-gradient(180deg, #eef3ff 0%, #cddaf4 100%)'
const PICK_TEXT = '#111726'

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

/**
 * 화면 전체를 덮는다. 뒤의 3D는 계속 돌지만 흐려진다.
 *
 * `colorScheme`이 여기 있는 이유: 안 주면 넘치는 칸에 **흰 스크롤막대**가
 * 뜬다. 어두운 창 안에 밝은 회색 막대가 서 있는 것이 실제로 화면에 보였다
 */
export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: OVERLAY_Z,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: 'rgba(6, 9, 17, 0.6)',
  backdropFilter: 'blur(3px)',
  colorScheme: 'dark',
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  animation: `${fadeIn} 0.11s ease-out`,
})

export const cinematicOverlay = style([overlay, {
  background: 'rgba(6, 9, 17, 0.28)',
  backdropFilter: 'none',
}])


/**
 * 창 하나.
 *
 * 세로 flex라 자식이 셋이든 넷이든 **본문만 남는 높이를 먹는다**. 전에는
 * `grid-template-rows: auto 1fr auto`였는데 가방처럼 자식이 넷인 화면에서
 * 1fr이 주머니 줄에 걸려, 주머니 이름표가 창 높이의 3분의 2를 차지했다
 */
export const screen = style({
  position: 'relative',
  width: 'min(1040px, 100%)',
  height: 'min(648px, 100%)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: 10,
  border: `1px solid ${EDGE}`,
  background: 'linear-gradient(180deg, #1a2138 0%, #101629 62%, #0d1222 100%)',
  boxShadow: '0 0 0 2px rgba(6, 9, 17, 0.85), 0 22px 56px rgba(0, 0, 0, 0.62)',
})

export const cinematicScreen = style([screen, {
  background: 'linear-gradient(180deg, rgba(18, 25, 46, 0.12), rgba(6, 9, 17, 0.08))',
  borderColor: 'rgba(158, 198, 255, 0.42)',
  boxShadow: '0 0 0 2px rgba(6, 9, 17, 0.35), 0 22px 56px rgba(0, 0, 0, 0.34)',
}])


export const head = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  height: 44,
  padding: '0 16px',
  borderBottom: `1px solid ${EDGE}`,
  background: 'rgba(255, 255, 255, 0.032)',
})

/** 화면 이름. 상자도 띠도 아니고 **금색 막대 하나**가 붙든다 */
export const crest = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 9,
  minWidth: 0,
  paddingLeft: 10,
  borderLeft: `4px solid ${vars.hud.warn}`,
})

export const crestText = style({
  fontSize: 18,
  fontWeight: 700,
})

/** 오른쪽 보조 정보 — 소지금·마릿수 */
export const headNote = style({
  fontSize: 14,
  opacity: 0.78,
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
  gap: 14,
  padding: '10px 14px',
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
  paddingRight: 6,
  scrollbarWidth: 'thin',
})

/**
 * 고를 수 있는 한 줄.
 *
 * 테두리도 배경도 그림자도 없다 — 목록은 글자가 늘어선 것이지 판이 쌓인 게
 * 아니다. 왼쪽 22px은 커서 자리라 고를 때 글자가 안 밀린다.
 * `div`에도 쓰이므로 `button` 전용 속성은 안 넣는다
 */
export const row = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  height: 32,
  flex: '0 0 auto',
  padding: '0 10px 0 22px',
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 15,
  textAlign: 'left',
})

/** 줄 안쪽. 아이콘·이름·숫자를 한 줄로 세운다 */
export const face = style({
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  height: '100%',
})

/** 고른 줄 — 밝은 띠에 어두운 글자 */
export const rowOn = style([row, {
  background: PICK_BG,
  color: PICK_TEXT,
  fontWeight: 700,
}])

/** 못 쓰는 항목·아직 안 본 포켓몬 */
export const rowDim = style([row, { opacity: 0.36 }])

/** 커서. 띠 **안**에 있어서 색을 글자에서 물려받는다 */
export const caret = style({
  position: 'absolute',
  left: 8,
  top: '50%',
  width: 0,
  height: 0,
  borderLeft: '7px solid currentColor',
  borderTop: '5px solid transparent',
  borderBottom: '5px solid transparent',
  transform: 'translateY(-50%)',
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
  fontSize: 14,
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
  fontSize: 14,
  opacity: 0.75,
})

/** 오른쪽 칸. 판이 아니라 세로선 하나로 갈린다 */
export const detail = style({
  minHeight: 0,
  overflowY: 'auto',
  // ⚠️ `overflow-x: hidden`이 꼭 있어야 한다. 전에는 여기에 바깥으로 삐져나온
  // `::before` 번짐을 깔아서, 가로 스크롤막대가 설명칸 아래에 늘 떠 있었다
  overflowX: 'hidden',
  padding: '2px 4px 8px 16px',
  borderLeft: `1px solid ${EDGE}`,
  scrollbarWidth: 'thin',
})

export const detailTitle = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 9,
  fontSize: 19,
  fontWeight: 700,
  marginBottom: 3,
})

export const detailSub = style({
  fontSize: 12,
  opacity: 0.6,
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
})

export const detailText = style({
  fontSize: 15,
  lineHeight: 1.62,
  whiteSpace: 'pre-line',
  opacity: 0.9,
})

/**
 * 설명 안의 작은 제목 — "능력", "기술".
 *
 * 자간을 벌린 영문 대문자표는 안 쓴다. 남은 폭을 실선으로 채우는 쪽이
 * 게임 창에 가깝고, 그 선이 아래 내용의 범위를 알려 준다
 */
export const detailHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '14px 0 6px',
  fontSize: 12,
  fontWeight: 700,
  opacity: 0.52,
  '::after': {
    content: '""',
    flex: 1,
    height: 1,
    background: 'currentColor',
    opacity: 0.34,
  },
})

export const foot = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  height: 28,
  padding: '0 16px',
  borderTop: `1px solid ${EDGE}`,
  fontSize: 12,
  opacity: 0.52,
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
  borderRadius: 3,
  flex: '0 0 auto',
  background: 'currentColor',
  opacity: 0.55,
})

/**
 * 갈래 줄 — 가방 주머니.
 *
 * 창 위쪽에 붙는 **탭**이다. 고른 것만 띠 색으로 차고 아래 본문과 이어진다
 */
export const tabs = style({
  flex: '0 0 auto',
  display: 'flex',
  gap: 2,
  padding: '7px 14px 0',
  borderBottom: `1px solid ${EDGE}`,
})

const tabBase = style({
  padding: '4px 13px 6px',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  borderRadius: '5px 5px 0 0',
  marginBottom: -1,
})

export const tab = styleVariants({
  off: [tabBase, { opacity: 0.48 }],
  on: [tabBase, {
    background: PICK_BG,
    color: PICK_TEXT,
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
  fontSize: 12,
  opacity: 0.52,
  textAlign: 'center',
  paddingBottom: 4,
})

/** 목록이 비었을 때 */
export const empty = style({
  padding: '14px 4px',
  fontSize: 14,
  opacity: 0.42,
})
