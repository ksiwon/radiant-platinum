// 세이브가 가리키는 세계를 세우는 동안 덮는 화면 (야간 실행서 N1).
//
// ⚠️ **스크립트 페이드가 아니다.** 맵을 갈아 끼우는 `enterMap`이 `resetFade`로
// 덮개를 지우므로(`engine/script/fade`), 그 위에 얹은 로딩 화면은 제 손으로
// 사라지지 않는 별개의 것이어야 한다. 그래서 DOM이고, 걷는 것은
// `state/restoreStore`의 상태뿐이다.
//
// ⚠️ **새 창 문법을 들이지 않는다** — 실패 창의 몸은 `rendererTrouble.css.ts`와
// 같다 (DESIGN.md §3).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW, WINDOW_SMALL, scrim } from '../theme/window.css'

/**
 * 덮개.
 *
 * ⚠️ **비쳐 보이면 안 된다.** 아래에 서 있는 것은 아직 저장한 자리가 **아닌**
 * 세계고, 그것이 반쯤 비치면 사람은 거기 서 있는 줄 안다. `scrim`은 반투명이라
 * 배경만 불투명으로 갈아 끼운다.
 *
 * ⚠️ **`RendererTrouble`(100)보다 아래다.** 장치를 잃은 것이 더 큰 일이고,
 * 그때는 이 화면이 무엇을 적든 읽을 수 없다
 */
export const over = style([scrim, { zIndex: 90, background: vars.scrim.black }])

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

/** 기다리는 동안의 한 줄. 창도 안 띄운다 — 아직 아무 일도 안 일어났다 */
export const waiting = style({
  margin: 0,
  fontSize: TEXT.base,
  lineHeight: 1.6,
  color: vars.ink.dim,
  fontFamily: vars.font.ui,
})

/** 브라우저·자료가 준 말 그대로. 번역하거나 다듬지 않는다 */
export const detail = style({
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

export const row = style({
  display: 'flex',
  gap: GAP.tight,
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  marginTop: GAP.tight,
})

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
