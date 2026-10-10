// 가방 — 원작 배치 (DESIGN.md §5 · 설계서 `bag.md` §4).
//
// 원작은 **왼쪽에 가방이 서 있고** 오른쪽이 도구 목록, 아래가 설명이다
// (`applications/bag/windows.c`: 목록 창이 14타일=112px에서 시작하고 설명 창이
// 18타일=144px에서 화면 폭 전체를 먹는다). 그래서 여기도 「왼쪽 목록 / 오른쪽
// 상세」로 안 가른다 — 그 배치는 설정 앱의 것이다.
//
// 판을 깔지 않는다. 창 하나, 가르는 선 둘(왼쪽 무대 | 목록 세로선, 본문 | 설명 띠 가로선), 그리고 떠 있는 갈래 창
// 하나뿐이다 — 줄 · 주머니 어디에도 판이 없다.
//
// ⚠️ **주머니마다 바탕색이 바뀌지 않는다.** 한때 문서에 그렇게 적어 뒀는데
// 실측해 보니 `bag_ui_main.NSCR`이 팔레트 행 셋(0·1·2)을 고정으로 쓰고
// 주머니가 바뀔 때 바꾸는 것은 **가방 그림뿐**이다
// (`ManagedSprite_SetAnim(BAG_SPRITE_BAG, pocketType)`). 색이 바뀌는 것은
// 다른 세대다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { RULE } from '../theme/window.css'
import * as chrome from './menuChrome.css'

/** 왼쪽 무대의 폭. 주머니 레일(32 × 8 + 4 × 7 = 284)이 꼭 맞는다 */
const BAY_WIDTH = 296
/** 설명 띠의 높이 */
const DESC_HEIGHT = 136

const slideIn = keyframes({
  from: { opacity: 0, transform: 'translateX(var(--from, 12px))' },
  to: { opacity: 1, transform: 'translateX(0)' },
})
const listIn = keyframes({
  from: { opacity: 0.4, transform: 'translateX(8px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})
const bagHop = keyframes({
  '0%': { transform: 'translateY(0)' },
  '40%': { transform: 'translateY(-4px)' },
  '100%': { transform: 'translateY(0)' },
})

/**
 * 본문 — 왼쪽 가방 칸 · 오른쪽 목록 · 아래 설명.
 *
 * 가방 칸을 **픽셀로 못 박고** 남는 폭을 목록에 준다 — 창이 넓어지면 목록이 넓어지는 것이 아니라 여백이 는다
 */
export const stage = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `${String(BAY_WIDTH)}px minmax(0, 1fr)`,
  gridTemplateRows: `minmax(0, 1fr) ${String(DESC_HEIGHT)}px`,
  gridTemplateAreas: '"bag list" "desc desc"',
})

/** 왼쪽 무대 — 가방 · 그늘 · 이름표 · 레일 · 칸 수가 세로 가운데에 선다 */
export const bay = style({
  gridArea: 'bag',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP.base,
  borderRight: RULE,
  minHeight: 0,
})

/** 가방 그림. 도트라 부드럽게 늘리면 뭉개진다 — 크기는 `bagArt`가 정수배로 준다 */
export const bag = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 주머니를 바꿀 때 가방이 한 번 들썩인다 (−4px · `TIME.page`) */
export const bagHopping = style({
  animation: `${bagHop} ${TIME.page} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 가방 아래 그늘. 가방과 이름표 사이를 8px 당긴다 */
export const bagShade = style({ marginTop: -GAP.base })

/**
 * 주머니 이름표 (`BAG_UI_WINDOW_POCKET_NAMES`). 원작은 이름 하나가 가운데 서고 양옆에 화살표가 있다 —
 * 좌우로 넘긴다는 것을 그 두 글자가 말한다. 넘길 때 이름이 들어오는 쪽에서 12px 미끄러져 온다(원작 12px/프레임)
 */
export const pocketName = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: BAY_WIDTH - GAP.loose * 2,
  height: 32,
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
  whiteSpace: 'nowrap',
})

export const pocketNameText = style({
  animation: `${slideIn} ${TIME.page} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

export const arrow = style({
  width: 20,
  textAlign: 'center',
  color: vars.ink.faint,
  fontSize: TEXT.small,
})

/**
 * 주머니 줄 (`BAG_UI_WINDOW_POCKET_INDICATOR`). 원작도 여기가 **글자가 아니라 아이콘 여덟**이다.
 * 칸은 32 정사각 여덟이고 사이가 4다 — 「지금 몇 번째 주머니에 있는가」는 아래 금 밑줄이 말한다
 */
export const rail = style({
  position: 'relative',
  display: 'flex',
  gap: 4,
  flex: '0 0 auto',
  paddingBottom: GAP.tight + 3,
})

export const railCell = style({
  width: 32,
  height: 32,
  flex: '0 0 auto',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
})

/** 고르라고 열린 가방은 그 주머니에 못 박힌다 — 다른 일곱은 물러난다 */
export const railCellOff = style({ opacity: 0.3, cursor: 'default' })

/** 밑줄. 칸이 아니라 레일 안의 `aria-hidden` 요소 하나가 `transform`으로 미끄러진다 */
export const railMark = style({
  position: 'absolute',
  left: 0,
  bottom: 0,
  width: 32,
  height: 3,
  background: vars.pick.edge,
  pointerEvents: 'none',
  transition: `transform ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

/** 칸 수 `9 / 40` — 주머니의 성질이라 레일 바로 밑이다 */
export const capacity = style({
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 목록 칸. 세로 스크롤이고 갈래 창이 이 칸 안에 뜬다 */
export const listWrap = style({
  gridArea: 'list',
  position: 'relative',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
})

/** 도구 목록 — 줄 32 × 12. 주머니를 바꾸면 8px 미끄러져 들어온다 */
export const list = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: `${GAP.loose}px ${GAP.loose}px ${GAP.loose}px ${GAP.base}px`,
  animation: `${listIn} ${TIME.page} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 줄 안쪽 — 아이콘 · 이름 · 점선 · 개수가 한 줄로 선다 */
export const line = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  height: '100%',
  minWidth: 0,
})

/** 줄 아이콘이 없는 줄(기술머신 · 닫는다)이 이름을 같은 자리에 세우는 빈 칸 */
export const iconSlot = style({ width: 32, height: 32, flex: '0 0 auto' })

/** 줄 머리 번호 `No01` · `HM01` — 자리가 맞아야 해서 tabular다 */
export const number = style({
  flex: '0 0 auto',
  width: 40,
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 기술머신 줄의 타입 눈금 3px. 색은 `--tint`(엔진 타입 표)로 온다 */
export const typeTick = style({
  flex: '0 0 auto',
  width: 3,
  height: 18,
  background: `var(--tint, ${vars.window.edge})`,
})

/** 고른 줄 안에서는 점선이 `pick.trace`로 바뀐다 — 회색 점선이 금 띠 위에서 지저분해 보인다 */
export const lead = style({
  selectors: { [`${chrome.rowOn} &`]: { borderBottomColor: vars.pick.trace } },
})

/** 개수 열. 자릿수가 맞는다 */
export const countCol = style({
  width: 44,
  textAlign: 'right',
  fontSize: TEXT.small,
  color: vars.ink.dim,
})

/** 갈래 창이 열려 있는 동안 고른 줄 밖의 줄은 한 단 어두워진다 (0.5 — 목록이 사라지면 어느 줄 얘기인지 놓친다) */
export const faded = style({ opacity: 0.5 })

/**
 * 갈래 창의 자리를 잡는 보이지 않는 점. 고른 줄 안에서 오른쪽 끝 24px 안쪽에 서고 `ChoiceMenu`가 이 점의 오른쪽에
 * 앉는다 — 줄 전체를 원인으로 주면 오른쪽에 자리가 없어 창이 왼쪽 가방 칸으로 뒤집힌다
 */
export const popAnchor = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 216,
  width: 1,
  pointerEvents: 'none',
})

/** 빈 주머니 — 「닫는다」 한 줄 밑에 흐린 주머니 아이콘 64(4×)가 가운데 선다 */
export const emptyArt = style({
  flex: '1 1 auto',
  display: 'grid',
  placeItems: 'center',
  opacity: 0.35,
})

/**
 * 설명 칸 (`BAG_UI_WINDOW_ITEM_DESCRIPTION`).
 *
 * 원작은 화면 **아래 폭 전체**를 쓴다. 오른쪽에 세워 두면 목록이 좁아지고, 무엇보다 그게 설정 앱의 배치다
 */
export const desc = style({
  gridArea: 'desc',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.wide,
  minHeight: 0,
  padding: `0 ${GAP.loose}px`,
  borderTop: RULE,
})

/** 그림 64 + 밑 그늘 */
export const art = style({
  flex: '0 0 auto',
  width: 64,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: GAP.tight,
})

/** 고른 물건의 그림. 이 칸에서 제일 큰 것이 그 물건이어야 한다 */
export const icon = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

export const text = style({
  flex: '1 1 auto',
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

/**
 * 대사 줄 — 물음 · 알림 · 옮길 자리. 롬 대사이고 원작도 `FONT_MESSAGE`다(Galmuri11 17 / 26).
 * 통째로 올리고 한 자씩 찍지 않는다
 */
export const speech = style({
  fontFamily: vars.font.pixel,
  fontSize: TEXT.list,
  lineHeight: `${String(LINE.dock)}px`,
  color: vars.ink.strong,
  whiteSpace: 'pre-line',
})

/** 오른쪽 정보 칸(기술머신 · 비전머신) — 실제 값이 있을 때만 선다 */
export const facts = style({
  flex: '0 0 auto',
  width: 240,
  alignSelf: 'center',
  display: 'grid',
  gap: GAP.tight,
  paddingLeft: GAP.wide,
  borderLeft: RULE,
})

/** 머리 `tag` — 건네주기 모드의 표지 (파티 칸의 아이콘 32 + 이름) */
export const modeTag = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: GAP.small,
  height: 32,
  padding: `0 ${GAP.small}px`,
  borderRadius: RADIUS.cell,
  background: vars.pick.face,
  boxShadow: `inset 0 0 0 ${String(EDGE.bar)}px ${vars.pick.edge}`,
  color: vars.pick.text,
  fontSize: TEXT.small,
  fontWeight: 700,
})

/** 등록 표식 (`BagUI_DrawRegisteredIcon`) — 줄 오른쪽 끝에 그 물건을 쓰는 키 이름이다 */
export const registered = style({
  flex: '0 0 auto',
  padding: '0 5px',
  borderRadius: RADIUS.bar,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  background: vars.pick.face,
  boxShadow: `inset 0 0 0 1px ${vars.pick.edge}`,
  color: vars.pick.text,
})

/** 개수 고르기 창 안 — 위아래 화살표와 `×003` */
export const countBox = style({ padding: `${GAP.tight}px ${GAP.wide}px` })

/**
 * 목록 · 상세 두 칸짜리 바탕(`menuChrome.css`의 `stage`)에 갈래 창을 붙일 자리를 낸다 — 메일박스의 갈래가
 * 이 칸의 오른쪽 아래 구석에 뜬다 (`partyScreen.css`의 `choices`). **메일박스가 쓰므로 남긴다**
 */
export const anchorStage = style([chrome.stage, { position: 'relative' }])
