// 타이틀 위에 서는 앱 창의 틀 — 패치노트 · 버그 제보 · 이런 게임은 어떠세요?가 한 벌을 쓴다.
//
// 셋이 각자 `scrim` + `WINDOW`로 창을 따로 만들고 `panel` · `foot` · `close` · `hint`를 베끼고 있었다. 여기서 한 번만
// 그린다 — 머리(제목 + 오른쪽 한 줄) · 본문 · 바닥(키캡)의 틀은 메뉴의 덮는 창(`MenuScreen`)과 같다. 크기는 쓰는 쪽이
// `--w` · `--h`로 준다(내용에 맞추고 `SCREEN`을 넘지 않는다).
//
// ⚠️ **그림 위에 맨 글자를 두지 않는다.** 이 창들은 타이틀 그림 위에 서므로 글은 전부 창 얼굴 위에 있다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { RULE, WINDOW, riseIn, scrim } from '../theme/window.css'

export const over = style([scrim, { zIndex: 20 }])

export const window_ = style([riseIn, {
  ...WINDOW,
  position: 'relative',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  width: 'min(var(--w), 100%)',
  height: 'var(--h, auto)',
  maxHeight: '100%',
  overflow: 'hidden',
  fontFamily: vars.font.ui,
}])

export const head = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: GAP.wide,
  height: 44,
  padding: `0 ${String(GAP.wide)}px`,
  borderBottom: RULE,
})

export const title = style({
  margin: 0,
  // ⚠️ **제목은 줄을 안 바꾼다.** 머리 높이가 44로 못 박혀 있어 두 줄이 되면 위아래로 삐져나간다 — 줄어드는 것은 오른쪽 요약(`note`)이다
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

/** 머리 오른쪽의 한 줄 요약 */
export const note = style({
  fontSize: TEXT.small,
  color: vars.ink.dim,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const body = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
})

export const foot = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base,
  height: 40,
  padding: `0 ${String(GAP.wide)}px`,
  borderTop: RULE,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})

/** 바닥 왼쪽 안내가 남는 폭을 먹고 단추가 오른쪽 끝에 붙는다 */
export const hint = style({ flex: '1 1 auto', minWidth: 0 })

const buttonBase = {
  appearance: 'none',
  boxSizing: 'border-box',
  height: 28,
  padding: `0 ${String(GAP.base + 2)}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.small,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
} as const

/** 글자 단추 — 테두리 없이 글자만. 「그만두기」 · 「돌아가기」 */
export const plain = style({
  ...buttonBase,
  border: 'none',
  background: 'none',
  color: vars.ink.dim,
  selectors: {
    '&:hover:not(:disabled)': { color: vars.ink.strong },
    '&:disabled': { opacity: 0.45, cursor: 'not-allowed' },
    '&:focus-visible': { outline: `${String(EDGE.bar)}px solid ${vars.pick.edge}` },
  },
})

/** 금 테두리 단추 — 이 창에서 하려던 일 (「보내기」) */
export const primary = style({
  ...buttonBase,
  fontWeight: 700,
  color: vars.pick.text,
  background: vars.pick.face,
  border: `${String(EDGE.bar)}px solid ${vars.pick.edge}`,
  selectors: {
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
    '&:focus-visible': { outline: `${String(EDGE.bar)}px solid ${vars.pick.edge}`, outlineOffset: 1 },
  },
})
