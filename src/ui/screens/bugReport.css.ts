// 버그 제보 창 — 덮는 창이되 내용 크기(800×496). 왼쪽에 쓰는 자리, 오른쪽에 **약속**(무엇이 가고 무엇이 안 가는가)이다.
//
// 이 화면은 누르기 **전에** 무엇이 나가는지를 말해야 하는 화면이다. 그 약속이 12px 흐린 문단이던 것을 구조(표)로 세운다 —
// 가장 중요한 정보가 가장 흐리면 안 된다. 창의 틀(머리 · 바닥 · 단추)은 `appWindow.css`에서 온다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { RULE } from '../theme/window.css'

export const WIDTH = 800
export const HEIGHT = 496

/** 폼 하나가 본문과 바닥을 감싼다 — 바닥의 「보내기」가 이 폼의 submit이다 */
export const form = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
})

export const split = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 280px',
})

export const write = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  minHeight: 0,
  padding: GAP.wide,
})

export const row = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
})

/** 어떻게 칸은 남는 높이를 먹는다 */
export const rowGrow = style({ flex: '1 1 auto', minHeight: 0 })

export const label = style({
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.normal,
})

/**
 * 글자 칸 — 창 안에 파인 자리.
 *
 * ⚠️ **이름 짓기 칸(`nameScreen.css`)과 같은 몸이다.** 이 게임에 글을 치는 자리가 그 둘뿐인데 서로 다르게 생기면,
 * 둘 다 「어디서 온 칸인지」 알 수 없게 된다
 */
const field = {
  width: '100%',
  boxSizing: 'border-box',
  padding: `${String(GAP.small)}px ${String(GAP.base)}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.small,
  color: vars.ink.strong,
  background: vars.bar.trackTop,
  border: `${String(EDGE.bar)}px solid ${vars.window.edgeDim}`,
  borderRadius: RADIUS.cell,
  ':focus': { outline: `${String(EDGE.bar)}px solid ${vars.pick.edge}`, outlineOffset: 1 },
} as const

export const input = style(field)

export const textarea = style({
  ...field,
  flex: '1 1 auto',
  minHeight: 96,
  resize: 'none',
  lineHeight: 1.5,
})

/** 오른쪽 약속 — 접지 않는다. 첫 화면이 「서버로 안 간다」를 약속한 게임이다 (COPYRIGHT.md §11) */
export const promise = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  minHeight: 0,
  overflowY: 'auto',
  padding: GAP.wide,
  borderLeft: RULE,
})

export const promiseHead = style({
  margin: 0,
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.strong,
})

/** 함께 가는 것 표 — 줄 사이는 `RULE`이다 */
export const table = style({
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  margin: 0,
  fontSize: TEXT.tiny,
})

export const cellHead = style({
  margin: 0,
  padding: `${String(GAP.small - 2)}px ${String(GAP.base)}px ${String(GAP.small - 2)}px 0`,
  color: vars.ink.dim,
  borderTop: RULE,
  selectors: { '&:first-of-type': { borderTop: 'none' } },
})

export const cellValue = style({
  margin: 0,
  padding: `${String(GAP.small - 2)}px 0`,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
  overflowWrap: 'anywhere',
  borderTop: RULE,
  selectors: { '&:first-of-type': { borderTop: 'none' } },
})

export const never = style({
  margin: 0,
  fontSize: TEXT.small,
  lineHeight: 1.6,
  color: vars.ink.normal,
})

/** 실패 문장 — **`state.bad`다.** `hp.red`는 HP 막대의 색이라 실패 문장에 쓰면 뜻이 섞인다 */
export const fail = style({
  margin: 0,
  fontSize: TEXT.small,
  lineHeight: 1.5,
  color: vars.state.bad,
})

export const done = style({
  margin: 0,
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const doneBody = style({
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  padding: GAP.loose,
})

export const intro = style({
  margin: 0,
  fontSize: TEXT.small,
  lineHeight: 1.6,
  color: vars.ink.dim,
})
