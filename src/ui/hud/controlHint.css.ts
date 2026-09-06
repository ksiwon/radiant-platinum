// 조작 쪽지 — 화면 왼쪽 위에 접혀 있다가 펴진다.
//
// ⚠️ **판을 늘어놓지 않는다.** 접혀 있을 때는 글자 몇 자짜리 표 하나고,
// 펴도 「키 → 무엇」 두 칸짜리 목록이다.
//
// ⚠️ **왼쪽 위다.** 아래는 대사창이 가로 760px로 가운데에 서는데, 960px 창에서는
// 그 왼쪽 끝이 100px이라 펼친 쪽지(215px)와 겹친다. 위는 가운데가 지역 이름표,
// 오른쪽이 포켓치고 **왼쪽은 비어 있다** (계기판은 개발 서버에서만 뜬다).
//
// ⚠️ **알약이 아니다** (DESIGN.md §2 금지 목록). 접힌 표도 펼친 판도 창 한 벌이다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, TEXT } from '../theme/scale'
import { WINDOW, WINDOW_SMALL } from '../theme/window.css'
import { HUD_LEFT_TOP } from './hudStack'

export const wrap = style({
  position: 'fixed',
  // ⚠️ **감싼 상자가 클릭을 먹으면 안 된다.** 펴면 이 상자가 판만큼 넓어지는데
  // 접힌 표는 그보다 좁아서, 그 옆 여백과 사이 틈이 그대로 **3D 화면 왼쪽 위를
  // 못 누르는 자리**가 된다. 받는 것은 접힌 표 하나뿐이다
  pointerEvents: 'none',
  left: GAP.base + 2,
  // 계기판이 이미 차지한 높이 아래에 붙는다 (`hudStack`). 계기판이 없으면 0이다
  top: `calc(var(${HUD_LEFT_TOP}, 0px) + ${GAP.base + 2}px)`,
  zIndex: 150,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: GAP.small,
})

/** 접힌 표. 눈에 걸리지 않게 흐리게 두고 손이 오면 또렷해진다 */
export const chip = style({
  ...WINDOW_SMALL,
  pointerEvents: 'auto',
  cursor: 'pointer',
  padding: `${GAP.tight}px ${GAP.base}px`,
  fontSize: TEXT.tiny,
  opacity: 0.5,
  transition: 'opacity 160ms ease-out',
  ':hover': { opacity: 1 },
  ':focus-visible': { opacity: 1, outline: `2px solid ${vars.pick.edge}` },
})

export const chipOpen = style([chip, { opacity: 0.95 }])

export const panel = style({
  ...WINDOW,
  pointerEvents: 'none',
  padding: `${GAP.small}px ${GAP.base}px`,
  fontSize: TEXT.tiny,
  lineHeight: '19px',
  display: 'grid',
  // 키 칸은 내용만큼, 이름 칸은 남는 만큼
  gridTemplateColumns: 'auto auto',
  columnGap: GAP.base,
  whiteSpace: 'nowrap',
})

/** 키 이름. 자판 글자라 자릿수가 안 흔들려야 한다 */
export const keys = style({
  color: vars.ink.strong,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
})

export const what = style({ color: vars.ink.dim })
