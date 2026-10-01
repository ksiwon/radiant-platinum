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

/**
 * 접힌 표의 살갗. 눈에 걸리지 않게 **글자만** 흐리게 두고 손이 오면 또렷해진다.
 *
 * ⚠️ **창을 통째로 흐리게 하지 않는다** (I-p01-14 · I-p15-13). 한때 `opacity: 0.5`였는데,
 * 그러면 글자만이 아니라 창 바탕과 테두리까지 비쳐서 방에서는 회색, 하늘 앞에서는
 * 하늘색, 깨어진 세계에서는 분홍이 됐다 — 같은 단추가 장면마다 다른 색이었고, 분홍
 * 바닥과 흰 하늘 위에서는 글자가 묻혔다. 창은 `WINDOW_SMALL` 그대로 불투명하게 두고
 * (밑색 `faceMid`까지 깔린다) 흐림은 `ink.dim`이 맡는다 — 창 바닥색에 대해 4.5:1을
 * 넘기는 색이다 (`theme/day.css`)
 */
export const CHIP = {
  ...WINDOW_SMALL,
  pointerEvents: 'auto',
  cursor: 'pointer',
  // ⚠️ `<button>`은 글꼴을 물려받지 않는다 — 안 적으면 브라우저 기본 단추 글꼴이다.
  // 단축 속성이라 크기보다 먼저 온다
  font: 'inherit',
  padding: `${GAP.tight}px ${GAP.base}px`,
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  transition: 'color 160ms ease-out',
} as const

/** 손이 왔거나 펴져 있을 때의 글자 */
export const CHIP_LIT = { color: vars.ink.strong } as const

export const chip = style({
  ...CHIP,
  ':hover': CHIP_LIT,
  ':focus-visible': { ...CHIP_LIT, outline: `2px solid ${vars.pick.edge}` },
})

export const chipOpen = style([chip, CHIP_LIT])

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
