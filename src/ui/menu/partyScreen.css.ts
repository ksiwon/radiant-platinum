// 포켓몬 화면 — 명판 여섯이 두 열로 선다 (`.audit/menu-ui/party.md` §4).
//
// 원작 배치를 그대로 옮겼다. 판 여섯이 두 줄 세 칸이고 **오른쪽 줄이 한 칸 아래에 선다**
// (`sMemberPanelTemplates`: 왼쪽 y=0·6·12, 오른쪽 y=1·7·13). 그 어긋남이 여섯을 한 덩어리가 아니라 여섯으로
// 보이게 한다.
//
// ⚠️ **판이 상자가 아니다.** 원반(받침) 하나와 이름이 얹히는 띠 하나, 두 겹이다. 사방 테두리를 두르면 같은 상자
// 여섯이 격자에 놓인 모양으로 돌아간다 (사용자 「투박하다」 지적). 가장 커야 할 것은 그림이고, 그림이 원반 위로
// 넘친다.
//
// ⚠️ **색은 여기서 안 고른다** (DESIGN.md §2). 판 색은 원작 팔레트(`party_menu/menu.pal`)에서 왔고 고른 판은
// 금이다. 숫자는 Pretendard `tabular-nums`다 (mono 금지).
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT, TIME } from '../theme/scale'
import { PICKED } from '../theme/window.css'

// 갈래 창 처방은 `menuChrome`에서 다시 내보낸다 — 가방 · 메일박스 · 상점의 import가 안 바뀐다
export { choice, choiceAsk, choiceOn, choices } from './menuChrome.css'
// 레벨업 창 처방은 `levelPanel.css`로 옮겼다. 다시 내보내기만 한다 (`levelPanel.css`가 정본)
export { levelPanel, levelRow, levelValue } from './levelPanel.css'

/** 판 하나의 크기 — 원반 · 띠 · 글이 이 안에서 절대 좌표로 선다 */
const PLATE = { height: 150, disc: 124, ribbonTop: 27, ribbonHeight: 96, textLeft: 150, sprite: 160 } as const

/** 오른쪽 줄이 내려간 만큼. 원작이 한 타일(판 높이의 1/6)이고 시안은 24다 */
const STAGGER = 24

/** 본문 칸 — 갈래 창 · 레벨업 창이 이 칸 안에서 절대 좌표로 앉는다 */
export const stage = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
})

/**
 * 판 여섯. 두 열 세 줄이고 위는 그림이 원반 위로 넘치는 만큼(25) 비운다.
 *
 * 열 아래에 오른쪽 줄이 내려간 만큼(`STAGGER`)을 비워서 오른쪽 셋째 판이 본문 밖으로 안 나간다. 판은 고정 높이
 * 150이고 줄이 그보다 낮으면 가운데에 걸쳐 앉는다 — 원반과 그림은 판 안 좌표라 흔들리지 않는다
 */
export const grid = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
  columnGap: GAP.loose + GAP.tight,
  rowGap: GAP.small,
  padding: `${GAP.loose + 2}px ${GAP.wide}px ${STAGGER}px`,
  boxSizing: 'border-box',
})

/**
 * 판 하나. 열 안에서 가운데에 앉고, 오른쪽 열은 `top`으로 내려 세운다 (레이아웃을 안 건드려 이웃 칸이 안 밀린다)
 */
export const plate = style({
  position: 'relative',
  alignSelf: 'center',
  height: PLATE.height,
  minWidth: 0,
  cursor: 'pointer',
})

export const plateRight = style({ top: STAGGER })

/**
 * 띠 — 판이 아니라 이름이 얹히는 띠. 원반 가운데에서 시작해 오른쪽으로 옅어진다.
 * 옅어짐은 토큰만 섞는다 (`color-mix`)
 */
export const ribbon = style({
  position: 'absolute',
  left: 70,
  right: 0,
  top: PLATE.ribbonTop,
  height: PLATE.ribbonHeight,
  borderRadius: `0 ${String(RADIUS.window)}px ${String(RADIUS.window)}px 0`,
  background: `linear-gradient(90deg,
    color-mix(in srgb, ${vars.panel.face} 62%, transparent) 0%,
    color-mix(in srgb, ${vars.panel.face} 22%, transparent) 100%)`,
  borderBottom: `${String(EDGE.bar)}px solid color-mix(in srgb, ${vars.panel.edge} 55%, transparent)`,
  transition: `background ${TIME.slide}, box-shadow ${TIME.slide}`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

/** 원반 자리 — 그림을 자르는 원도 이 값을 쓴다 */
const DISC_AT = { left: 8, top: 9 } as const

/** 원반 — 판 색이 여기 실린다. 상태(기절)가 색이다 */
export const disc = style({
  position: 'absolute',
  left: DISC_AT.left,
  top: DISC_AT.top,
  width: PLATE.disc,
  height: PLATE.disc,
  boxSizing: 'border-box',
  borderRadius: RADIUS.round,
  background: `radial-gradient(circle at 50% 32%, ${vars.window.faceTop} 0%, ${vars.panel.face} 72%)`,
  border: `${String(EDGE.window)}px solid ${vars.panel.edge}`,
  transition: `border-color ${TIME.slide}`,
  selectors: {
    // 발밑 — 그림자가 아니라 원반 위에 깐 타원이다
    '&::after': {
      content: '""',
      position: 'absolute',
      left: 22,
      right: 22,
      bottom: 16,
      height: 14,
      borderRadius: RADIUS.round,
      background: `radial-gradient(ellipse at center,
        color-mix(in srgb, ${vars.panel.edge} 45%, transparent) 0%, transparent 70%)`,
    },
  },
})

/** 선두 — 원반 고리가 두 겹이다. 원작 첫 판의 모양을 옮긴 것이다 */
export const discLead = style({
  boxShadow: `inset 0 0 0 ${String(EDGE.window)}px ${vars.window.faceTop}, inset 0 0 0 ${String(EDGE.window + 1)}px ${vars.panel.edge}`,
})

/** 그림 상자의 자리 — 원반 가운데에 발이 오게 위로 올린다 */
const SPRITE_AT = { left: -10, top: -25 } as const

/**
 * 그림. 원작 배틀 그림(80×80)을 **정수 2배**(160)로 그린다 — 1.2배였을 때 도트 폭이 1과 2로 섞였다
 * (`PLATE.sprite`는 원본의 정확히 두 배라 `image-rendering: pixelated`가 고르게 나온다).
 *
 * ⚠️ **그림은 원반 밖으로 안 나간다**(DECISIONS 「그림은 제 틀을 넘지 않는다」). 큰 몸(토대부기의 나무 · 한카리아스의 날개)이
 * 원반을 넘어 머리 줄 선과 이웃 판까지 닿았다 — 원반과 같은 원으로 잘라 메달처럼 담는다. 원의 가운데는 원반 가운데를
 * 그림 상자 좌표로 옮긴 것이다
 */
export const sprite = style({
  position: 'absolute',
  left: SPRITE_AT.left,
  top: SPRITE_AT.top,
  width: PLATE.sprite,
  height: PLATE.sprite,
  imageRendering: 'pixelated',
  pointerEvents: 'none',
  clipPath: `circle(${String(PLATE.disc / 2)}px at ${String(DISC_AT.left + PLATE.disc / 2 - SPRITE_AT.left)}px ${String(DISC_AT.top + PLATE.disc / 2 - SPRITE_AT.top)}px)`,
})

/** 잡은 볼 — 도구 아이콘 아틀라스의 그 볼 칸 (`mon.ball`). 원반 왼쪽 아래다 */
export const ball = style({
  position: 'absolute',
  left: 6,
  top: 104,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 글 칸. 세 줄을 띠 안에 세로 가운데로 세운다 */
export const text = style({
  position: 'absolute',
  left: PLATE.textLeft,
  right: GAP.base + 2,
  top: PLATE.ribbonTop + 4,
  height: PLATE.ribbonHeight - 8,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 7,
  minWidth: 0,
})

export const nameRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.tight + 2,
  minWidth: 0,
})

export const name = style({
  fontSize: 19,
  fontWeight: 700,
  color: vars.ink.strong,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const level = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontSize: TEXT.base - 1,
  // 숫자도 UI 글꼴이다 — 폭은 `tnum`이 맞춘다 (mono 금지)
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.dim,
})

/** 상태 딱지 옆 간격만 — 딱지 모양은 `StatusTag`가 갖는다 */
export const tagSlot = style({ alignSelf: 'center', display: 'inline-flex' })

export const barRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.tight + 2,
})

/** 원작 체력판의 `HP` 글자 */
export const hpTag = style({
  flex: '0 0 auto',
  fontSize: TEXT.tiny,
  fontWeight: 800,
  fontStyle: 'italic',
  color: vars.ink.dim,
})

/** 막대. 홈과 채움은 `HpBar`가 그리고 여기는 폭만 준다 */
export const barSlot = style({ flex: 1, minWidth: 0, display: 'flex' })
// `HpBar`는 클래스를 못 받는다 — 자식 한 칸이 폭을 다 쓰게 한다 (`selectors`는 `&` 자신만 겨눌 수 있다)
globalStyle(`${barSlot} > *`, { flex: 1 })

/** 갈래 창의 비전 · 필드 기술 줄 — 롬 `{COLOR 1}`이다 (`emphasis.one`) */
export const fieldMove = style({ color: vars.emphasis.one })

export const lowerRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.tight,
  minHeight: 28,
})

/** 지닌 도구 — 아이콘 32 + 이름 */
export const held = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  marginLeft: -GAP.tight,
  minWidth: 0,
  fontSize: 13,
  color: vars.ink.dim,
  whiteSpace: 'nowrap',
})

export const heldIcon = style({ flex: '0 0 auto', imageRendering: 'pixelated', backgroundRepeat: 'no-repeat' })

export const heldName = style({ overflow: 'hidden', textOverflow: 'ellipsis' })

export const hpNumbers = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontSize: TEXT.base - 1,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.normal,
})
export const hpMax = style({ color: vars.ink.faint, fontSize: 13 })

/** 기술머신 · 진화의돌 모드의 한 줄 — HP 막대 자리를 대신한다 (롬 175~179) */
export const verdict = style({
  fontFamily: vars.font.pixel,
  fontSize: TEXT.base,
  color: vars.ink.faint,
  minHeight: 14,
})
export const verdictGood = style({ color: vars.state.good, fontWeight: 700 })

/** 못 하는 판 — 그림과 글을 흐린다 (원반은 그대로다) */
export const unable = style({ opacity: 0.45 })

/** 고른 판 — 띠 전체가 금 면이다. 원반 고리와 이름도 금빛이다 */
export const ribbonOn = style({
  ...PICKED,
  left: 64,
  borderRadius: RADIUS.window,
  borderBottomColor: 'transparent',
  background: `linear-gradient(90deg, ${vars.pick.face}, color-mix(in srgb, ${vars.pick.face} 40%, transparent))`,
})
export const discOn = style({ borderColor: vars.pick.edge })
export const nameOn = style({ color: vars.pick.text })

/** 자리를 바꾸려고 집어 든 판 — 띠에 금 점선 바깥선 */
export const ribbonHeld = style({
  outline: `${String(EDGE.bar)}px dashed ${vars.pick.edge}`,
  outlineOffset: -2,
})

/**
 * 기절한 판. 원작도 **색으로 말한다** — 기절한 칸만 팔레트가 주황으로 바뀐다 (`main.c:1426`의 `palette += 2`).
 * 그림만 회색으로 빼서 「이 마리가 못 싸운다」가 두 번 보이게 한다
 */
export const ribbonFainted = style({
  background: `linear-gradient(90deg,
    color-mix(in srgb, ${vars.panel.faintedFace} 55%, transparent),
    color-mix(in srgb, ${vars.panel.faintedFace} 14%, transparent))`,
  borderBottomColor: `color-mix(in srgb, ${vars.panel.faintedEdge} 50%, transparent)`,
})
export const discFainted = style({
  background: `radial-gradient(circle at 50% 32%, ${vars.window.faceTop} 0%, ${vars.panel.faintedFace} 72%)`,
  borderColor: vars.panel.faintedEdge,
})
export const spriteFainted = style({ filter: 'grayscale(0.85)', opacity: 0.6 })

/** 빈 자리 — 상자가 아니라 점선 원반 하나. 「여섯 중 몇」이 상자 없이도 보인다 */
export const ghost = style({
  position: 'absolute',
  left: 8,
  top: 9,
  width: PLATE.disc,
  height: PLATE.disc,
  boxSizing: 'border-box',
  borderRadius: RADIUS.round,
  border: `${String(EDGE.bar)}px dashed ${vars.window.rule}`,
})

/** 아래 글 띠의 「취소」 단추 (453:1) — 마우스용이다. 키 커서 자리는 아니다 */
export const cancel = style({
  appearance: 'none',
  font: 'inherit',
  fontFamily: vars.font.ui,
  fontSize: TEXT.base - 1,
  fontWeight: 700,
  color: vars.ink.normal,
  height: 34,
  padding: `0 ${GAP.wide}px`,
  borderRadius: RADIUS.cell,
  border: `${String(EDGE.window)}px solid ${vars.window.edge}`,
  boxShadow: `inset 0 0 0 1px ${vars.window.edgeDim}`,
  background: `linear-gradient(180deg, ${vars.window.faceTop}, ${vars.window.faceBottom})`,
  cursor: 'pointer',
})

/** 글 띠 왼쪽의 도구 아이콘과 이름 (기술머신 · 도구 모드) */
export const messageItem = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.tight,
  fontFamily: vars.font.ui,
  fontSize: TEXT.small - 1,
  color: vars.ink.dim,
  whiteSpace: 'nowrap',
})
