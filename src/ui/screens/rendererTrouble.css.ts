// 그래픽이 멈췄을 때 뜨는 창 (기획서 RP-03).
//
// ⚠️ **새 창 문법을 들이지 않는다.** 타이틀 위에 서는 창들과 같은 몸이어야
// 한다 — 사람이 제일 불안할 때 보는 화면이 낯선 게임처럼 생기면 안 된다
// (DESIGN.md §3, `moreMenu.css.ts`와 같은 자리).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW, WINDOW_SMALL, scrim } from '../theme/window.css'

/**
 * ⚠️ **제일 위에 선다.** 장치를 잃으면 그 아래 3D는 이미 멎어 있는데,
 * 메뉴·대사창은 DOM이라 멀쩡히 떠 있다 — 그 위를 덮지 않으면 사람이
 * 「메뉴는 되는데 화면만 검다」로 읽고 계속 누른다
 */
export const over = style([scrim, { zIndex: 100 }])

export const panel = style({
  ...WINDOW,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  width: 'min(440px, calc(100vw - 32px))',
  boxSizing: 'border-box',
  padding: `${GAP.wide}px ${GAP.wide}px ${GAP.base}px`,
  fontFamily: vars.font.ui,
})

export const title = style({
  margin: 0,
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const body = style({
  margin: 0,
  fontSize: TEXT.base,
  lineHeight: 1.6,
  color: vars.ink.normal,
})

/**
 * 한 뭉치의 머리 — 「가능한 원인」·「다음에 해 볼 것」·「지금 관찰된 것」.
 *
 * ⚠️ **원인을 단정하지 않으려면 갈래를 눈으로 갈라야 한다.** 한 문단에 섞어
 * 적으면 추측과 관찰이 같은 무게로 읽힌다
 */
export const head = style({
  margin: `0 0 ${GAP.tight}px`,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.ink.dim,
})

export const list = style({
  margin: 0,
  paddingLeft: GAP.wide,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: TEXT.base,
  lineHeight: 1.6,
  color: vars.ink.normal,
})

/** 「지금 관찰된 것」 머리와 「복사」 단추 한 줄 */
export const headRow = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: GAP.tight,
})

/**
 * 브라우저·예외가 준 말 그대로.
 *
 * ⚠️ **번역하거나 다듬지 않는다.** 이 줄을 그대로 옮겨 적어야 제보가 쓸모
 * 있고, 우리가 지어낸 말로 바꾸면 검색해도 아무것도 안 나온다.
 *
 * ⚠️ **끌어서 고를 수 있어야 한다.** `body`(index.html)와 밑의 `scrim`이 둘 다
 * `user-select: none`이라, 여기서 되살리지 않으면 옮겨 적으라는 글을 못 고른다
 */
export const detail = style({
  userSelect: 'text',
  cursor: 'text',
  margin: 0,
  padding: GAP.tight,
  borderRadius: RADIUS.cell,
  background: vars.window.faceBottom,
  fontFamily: vars.font.mono,
  fontSize: TEXT.small,
  lineHeight: 1.5,
  color: vars.ink.dim,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
})

/** 사람 말 한 줄 아래 접힌 원문 — 먼저 읽을 것은 위의 한 줄이다 */
export const fold = style({
  marginTop: GAP.tight,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
})

export const foldHead = style({
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  cursor: 'pointer',
})

export const row = style({
  display: 'flex',
  gap: GAP.tight,
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  marginTop: GAP.tight,
})

/** 고를 것 하나. 「더보기」의 단추와 같은 몸이다 — 낯선 화면을 만들지 않는다 */
export const button = style({
  ...WINDOW_SMALL,
  appearance: 'none',
  padding: `7px ${GAP.base}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
  selectors: { '&:hover': { borderColor: vars.pick.edge } },
})

/** 눌러야 할 쪽 하나. 원작대로 **색이 아니라 테두리**로 가리킨다 */
export const primary = style([button, { ...PICKED }])

/**
 * 물러선 단추 — init 실패의 「3D 다시 세우기」.
 *
 * ⚠️ **설정을 안 바꾸면 같은 까닭으로 또 실패한다.** 같은 무게로 세워 두면
 * 사람이 그것부터 누르고 같은 창으로 돌아온다
 */
export const minor = style([button, {
  background: 'transparent',
  borderColor: 'transparent',
  boxShadow: 'none',
  color: vars.ink.dim,
}])

/** 「복사」 — 머리 줄에 붙는 작은 단추 */
export const copy = style([button, { padding: `2px ${GAP.tight}px` }])
