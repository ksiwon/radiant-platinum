// 「이런 게임은 어떠세요?」 — 타이틀 위에 서는 창 하나.
//
// ⚠️ **새 카드 문법을 들이지 않는다.** 이 창이 하는 일은 고를 것 둘을 세우는
// 것이라, 타이틀의 단추와 같은 창 한 벌(`WINDOW_SMALL`·`PICKED`)에서 나와야
// 한다. 여기만 다른 판을 쓰면 X를 누르는 순간 다른 게임이 된다 (DESIGN.md §3).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW, WINDOW_SMALL, scrim } from '../theme/window.css'

/** 타이틀 위를 덮는다. 창 한 벌의 것을 그대로 쓴다 */
export const over = style([scrim, { zIndex: 20 }])

export const panel = style({
  ...WINDOW,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  width: 'min(560px, calc(100vw - 32px))',
  // ⚠️ **테두리와 여백을 폭 안에 넣는다.** 안 넣으면 `100vw - 32px`에 좌우 여백
  // 32px과 테두리 6px이 더 붙어 좁은 화면에서 창이 화면 밖으로 22px 나간다
  // (실측 375px). `titleScreen.css`의 고지가 같은 이유로 이 줄을 들고 있다
  boxSizing: 'border-box',
  maxHeight: 'calc(100vh - 48px)',
  overflowY: 'auto',
  padding: `${GAP.wide}px ${GAP.wide}px ${GAP.base}px`,
  fontFamily: vars.font.ui,
})

export const title = style({
  margin: 0,
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const intro = style({
  margin: 0,
  fontSize: TEXT.small,
  lineHeight: 1.6,
  color: vars.ink.dim,
})

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
})

/**
 * 고를 것 하나.
 *
 * ⚠️ **단추가 아니라 링크다.** 겉모습은 타이틀 단추와 같게 두되 `<a>`로 만든다 —
 * 그래야 가운데 클릭·오른쪽 클릭·주소 복사가 다 된다. `onClick`만 단 `<button>`은
 * 그 셋을 전부 죽인다
 */
export const card = style({
  ...WINDOW_SMALL,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
  padding: `${GAP.base}px ${GAP.wide}px`,
  borderRadius: RADIUS.cell,
  textAlign: 'left',
  textDecoration: 'none',
  cursor: 'pointer',
})

/** 커서가 올라간 칸. 마우스 hover와 키보드 커서를 **같은 표시**로 둔다 */
export const cardOn = style({ ...PICKED })

export const name = style({
  fontSize: TEXT.base,
  fontWeight: 700,
})

export const line = style({
  fontSize: TEXT.small,
  lineHeight: 1.5,
})

/** 어디로 가는지 미리 보인다 — 새 탭은 되돌리는 데 손이 하나 더 든다 */
export const go = style({
  marginTop: GAP.tight,
  fontSize: TEXT.tiny,
  opacity: 0.7,
})

export const foot = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base,
  flexWrap: 'wrap',
})

export const hint = style({
  flex: '1 1 auto',
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})

export const close = style({
  ...WINDOW_SMALL,
  appearance: 'none',
  padding: `7px ${GAP.base}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
  selectors: { '&:hover': { borderColor: vars.pick.edge } },
})
