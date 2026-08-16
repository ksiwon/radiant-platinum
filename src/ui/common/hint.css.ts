import { style } from '@vanilla-extract/css'
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
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  color: vars.panel.text,
  background: 'rgba(110, 168, 255, 0.18)',
  border: '1px solid rgba(110, 168, 255, 0.55)',
  borderRadius: 999,
  cursor: 'help',
  selectors: {
    '&:hover': { background: 'rgba(110, 168, 255, 0.34)' },
    // 키보드로 왔을 때 어디 있는지 보여야 한다
    '&:focus-visible': { outline: '2px solid rgba(110, 168, 255, 0.9)', outlineOffset: 2 },
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
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(110, 168, 255, 0.45)',
  background: 'rgba(10, 15, 26, 0.97)',
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.55)',
  fontSize: 12.5,
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
  padding: '8px 10px',
  borderRadius: 6,
  background: 'rgba(255, 255, 255, 0.05)',
  fontFamily: vars.font.mono,
  fontSize: 11.5,
  lineHeight: 1.6,
  whiteSpace: 'pre',
  overflowX: 'auto',
})

/** 안내하지 않는다고 말하는 줄. 눈에 띄되 경고처럼 붉지는 않게 */
export const caveat = style({
  display: 'block',
  marginTop: 8,
  paddingTop: 8,
  borderTop: '1px solid rgba(255, 255, 255, 0.12)',
  opacity: 0.78,
})
