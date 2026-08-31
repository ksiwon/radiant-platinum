// 가방 — 원작 배치 (DESIGN.md §5).
//
// 원작은 **왼쪽에 가방이 서 있고** 오른쪽이 도구 목록, 아래가 설명이다
// (`applications/bag/windows.c`: 목록 창이 14타일=112px에서 시작하고 설명 창이
// 18타일=144px에서 화면 폭 전체를 먹는다). 그래서 여기도 「왼쪽 목록 / 오른쪽
// 상세」로 안 가른다 — 그 배치는 설정 앱의 것이다.
//
// ⚠️ **주머니마다 바탕색이 바뀌지 않는다.** 한때 문서에 그렇게 적어 뒀는데
// 실측해 보니 `bag_ui_main.NSCR`이 팔레트 행 셋(0·1·2)을 고정으로 쓰고
// 주머니가 바뀔 때 바꾸는 것은 **가방 그림뿐**이다
// (`ManagedSprite_SetAnim(BAG_SPRITE_BAG, pocketType)`). 색이 바뀌는 것은
// 다른 세대다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { RULE } from '../theme/window.css'

/**
 * 본문 — 왼쪽 가방 칸 · 오른쪽 목록 · 아래 설명.
 *
 * 원작 비율은 왼쪽이 112/256 = 44%인데, 우리 창은 훨씬 넓어서 그대로 두면
 * 목록 줄이 우스꽝스럽게 길어진다. 가방 칸을 **픽셀로 못 박고** 남는 폭을
 * 목록에 준다 — 창이 넓어지면 목록이 넓어지는 것이 아니라 여백이 는다
 */
export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '272px minmax(0, 1fr)',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  gridTemplateAreas: '"bag list" "desc desc"',
  gap: `${GAP.small}px ${GAP.wide}px`,
  padding: `${GAP.small}px ${GAP.base}px`,
  '@media': {
    // 좁아지면 가방을 접는다. 목록이 먼저다
    '(max-width: 760px)': {
      gridTemplateColumns: '1fr',
      gridTemplateAreas: '"list" "desc"',
    },
  },
})

/** 왼쪽 칸 — 가방이 서고 그 밑에 주머니 줄이 붙는다 */
export const bay = style({
  gridArea: 'bag',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP.base,
  borderRight: RULE,
  paddingRight: GAP.wide,
  '@media': {
    '(max-width: 760px)': { display: 'none' },
  },
})

/** 가방 그림. 도트라 부드럽게 늘리면 뭉개진다 */
export const bag = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/**
 * 주머니 줄 (`BAG_UI_WINDOW_POCKET_INDICATOR`).
 *
 * 원작도 여기가 **글자가 아니라 아이콘 여덟**이다. 이름은 아래 이름표가
 * 나르고, 이 줄은 「지금 몇 번째 주머니에 있는가」만 말한다
 */
export const pockets = style({
  display: 'flex',
  gap: 2,
  flex: '0 0 auto',
})

const pocketBase = style({
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  borderRadius: RADIUS.bar,
  cursor: 'pointer',
})

export const pocketOff = pocketBase
export const pocketOn = style([pocketBase, {
  boxShadow: `inset 0 0 0 2px ${vars.pick.edge}`,
  background: vars.pick.face,
}])

/**
 * 주머니 이름표 (`BAG_UI_WINDOW_POCKET_NAMES`).
 *
 * 원작은 이름 하나가 가운데 서고 양옆에 화살표가 있다 — 좌우로 넘긴다는 것을
 * 그 두 글자가 말한다
 */
export const pocketName = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP.small,
  minWidth: 172,
  padding: `${GAP.tight}px ${GAP.small}px`,
  borderTop: RULE,
  borderBottom: RULE,
  fontSize: TEXT.list,
  fontWeight: 700,
  color: vars.ink.strong,
  whiteSpace: 'nowrap',
})

export const arrow = style({
  color: vars.ink.faint,
  fontSize: TEXT.small,
})

/** 도구 목록 */
export const list = style({
  gridArea: 'list',
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  paddingRight: GAP.tight,
  scrollbarWidth: 'thin',
})

/**
 * 설명 칸 (`BAG_UI_WINDOW_ITEM_DESCRIPTION`).
 *
 * 원작은 화면 **아래 폭 전체**를 쓴다. 오른쪽에 세워 두면 목록이 좁아지고,
 * 무엇보다 그게 설정 앱의 배치다
 */
export const desc = style({
  gridArea: 'desc',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.wide,
  minHeight: 96,
  padding: `${GAP.small}px ${GAP.tight}px 0`,
  borderTop: RULE,
})

/** 고른 물건의 그림. 이 칸에서 제일 큰 것이 그 물건이어야 한다 */
export const icon = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

export const text = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
})

export const name = style({
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const body = style({
  fontSize: TEXT.base,
  lineHeight: 1.55,
  whiteSpace: 'pre-line',
})

/** 아무것도 안 골랐을 때 — 칸이 무너지지 않게 자리만 지킨다 */
export const descEmpty = style({
  fontSize: TEXT.small,
  color: vars.ink.faint,
})

/**
 * 등록 표식 (`BagUI_DrawRegisteredIcon`).
 *
 * 원작은 줄 오른쪽 끝에 작은 그림을 찍는다. 우리는 그 그림을 아직 안 굽고
 * 있어서 키 이름을 그대로 쓴다 — **무슨 키로 쓰는지가 표식보다 쓸모 있다**
 */
export const registered = style({
  marginLeft: 6,
  padding: '0 5px',
  borderRadius: RADIUS.bar,
  fontSize: 11,
  fontWeight: 700,
  background: vars.pick.face,
  boxShadow: `inset 0 0 0 1px ${vars.pick.edge}`,
  color: vars.pick.text,
})
