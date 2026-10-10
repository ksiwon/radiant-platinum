// 이름 짓기 — 가운데 창 하나 (`MenuScreen variant="center"`). 창 틀은 거기서 오고 여기는 본문만 안다.
//
// 왼쪽에 개체 아이콘(포켓몬 64 · 박스 벽지 한 조각), 오른쪽에 물음 · 입력 · 길이 계기 · 바닥 줄이 선다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'

export const WIDTH = 496

export const body = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: GAP.wide + 4,
  padding: `${String(GAP.wide + 4)}px ${String(GAP.loose)}px ${String(GAP.wide)}px`,
})

/** 개체 아이콘 칸 — 폭 80, 성별은 그 아래 */
export const hero = style({
  flex: '0 0 auto',
  width: 80,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: GAP.small - 2,
})

/** 박스 벽지 한 조각 — 정수배(1배) 그대로 가운데를 64×64로 잘라 쓴다. 줄이지 않는다 */
export const piece = style({
  width: 64,
  height: 64,
  overflow: 'hidden',
  position: 'relative',
  borderRadius: RADIUS.bar,
  border: `${String(EDGE.rule)}px solid ${vars.window.rule}`,
  boxSizing: 'content-box',
})

export const pieceArt = style({
  position: 'absolute',
  // 168×160 벽지의 가운데가 칸 가운데에 온다
  left: -52,
  top: -48,
  imageRendering: 'pixelated',
})

export const form = style({
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small + 2,
})

export const prompt = style({
  margin: 0,
  minHeight: TEXT.list * 1.5,
  fontSize: TEXT.list,
  lineHeight: 1.5,
  color: vars.ink.strong,
})

export const row = style({
  display: 'flex',
  gap: GAP.small,
  alignItems: 'stretch',
})

/** 글 쓰는 칸. 창 안에 파인 자리라 테두리가 창 테두리보다 얇다 */
export const input = style({
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  height: 40,
  padding: `0 ${String(GAP.base)}px`,
  fontSize: TEXT.list,
  fontFamily: 'inherit',
  color: vars.ink.strong,
  background: vars.bar.trackTop,
  border: `${String(EDGE.bar)}px solid ${vars.window.edgeDim}`,
  borderRadius: RADIUS.cell,
  ':focus': { outline: `${String(EDGE.bar)}px solid ${vars.pick.edge}`, outlineOffset: 1 },
})

/** 「결정」 — 금 띠 모양 단추 */
export const ok = style({
  flex: '0 0 auto',
  boxSizing: 'border-box',
  height: 40,
  padding: `0 ${String(GAP.wide + 2)}px`,
  fontSize: TEXT.list,
  fontFamily: 'inherit',
  fontWeight: 700,
  color: vars.pick.text,
  background: vars.pick.face,
  border: `${String(EDGE.bar)}px solid ${vars.pick.edge}`,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
})

/** 길이 계기 — 열 칸(`what.max`). 글자 수만큼 금으로 찬다. `input`이 아니라 `aria-hidden` 요소다 */
export const meter = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
})

export const cells = style({
  flex: 1,
  display: 'flex',
  gap: 3,
})

export const cell = style({
  flex: 1,
  height: 4,
  borderRadius: RADIUS.bar / 2,
  background: vars.window.rule,
})

export const cellOn = style({ background: vars.pick.edge })

export const count = style({
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

export const skipRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})

/** 안 짓고 넘어가는 줄. 단추보다 약하게 둔다 — 원작의 B에 해당한다 */
export const skip = style({
  padding: `${String(GAP.tight)}px 2px`,
  fontSize: TEXT.small,
  fontFamily: 'inherit',
  color: vars.ink.dim,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
})
