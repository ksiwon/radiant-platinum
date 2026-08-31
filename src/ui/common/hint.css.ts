import { style } from '@vanilla-extract/css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { WINDOW } from '../theme/window.css'
import { vars } from '../theme/contract.css'

/** 물음표를 붙일 자리. 글줄 안에 섞이므로 `inline-flex`다 */
export const wrap = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  verticalAlign: 'middle',
})

export const button = style({
  appearance: 'none',
  width: 18,
  height: 18,
  padding: 0,
  display: 'grid',
  placeItems: 'center',
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  lineHeight: 1,
  color: vars.ink.normal,
  background: 'transparent',
  border: `1px solid ${vars.window.edge}`,
  // 물음표 표는 실제로 둥근 것이라 여기는 `round`가 맞다
  borderRadius: RADIUS.round,
  cursor: 'help',
  selectors: {
    '&:hover': { background: vars.pick.face, borderColor: vars.pick.edge },
    // 키보드로 왔을 때 어디 있는지 보여야 한다
    '&:focus-visible': { outline: `2px solid ${vars.pick.edge}`, outlineOffset: 2 },
  },
})

/**
 * 펼쳐지는 설명.
 *
 * ⚠️ **`title` 속성으로 안 한다.** 그건 여러 줄도 안 되고, 터치에서는 아예 안
 * 뜨며, 스크린 리더가 읽을지도 브라우저마다 다르다. 여는 단추와 내용을
 * `aria-controls`로 묶어 **실제 요소**로 둔다
 */
export const bubble = style({
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  zIndex: 5,
  width: 'min(420px, 78vw)',
  padding: `${GAP.base}px ${GAP.base + 2}px`,
  ...WINDOW,
  fontSize: TEXT.small,
  fontWeight: 400,
  lineHeight: 1.75,
  whiteSpace: 'pre-line',
  textAlign: 'left',
  cursor: 'auto',
})

/**
 * 폴더 나무. 칸이 어긋나면 어느 폴더가 어느 폴더 안인지 안 보인다.
 *
 * ⚠️ `span`에 붙이므로 `display: block`을 직접 준다 — 인라인인 채로 두면
 * 세로 여백이 안 먹고 `pre`가 줄을 안 지킨다
 */
export const tree = style({
  display: 'block',
  margin: '8px 0',
  padding: `${GAP.small}px ${GAP.small + 2}px`,
  borderRadius: RADIUS.bar,
  border: `1px solid ${vars.window.rule}`,
  fontFamily: vars.font.mono,
  fontSize: 11.5,
  lineHeight: 1.6,
  whiteSpace: 'pre',
  overflowX: 'auto',
})

/** 안내하지 않는다고 말하는 줄. 눈에 띄되 경고처럼 붉지는 않게 */
export const caveat = style({
  display: 'block',
  marginTop: GAP.small,
  paddingTop: GAP.small,
  borderTop: `1px solid ${vars.window.rule}`,
  color: vars.ink.dim,
})
