// 「이런 게임은 어떠세요?」 — 타이틀 위에 서는 창 하나.
//
// ⚠️ **새 카드 문법을 들이지 않는다.** 이 창이 하는 일은 고를 것 몇을 세우는
// 것이라, 타이틀의 단추와 같은 창 한 벌(`WINDOW_SMALL`·`PICKED`)에서 나와야
// 한다. 여기만 다른 판을 쓰면 X를 누르는 순간 다른 게임이 된다 (DESIGN.md §3).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW_SMALL } from '../theme/window.css'

/** 창 폭. 틀(머리 · 바닥)은 `appWindow.css`다 */
export const WIDTH = 560

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  padding: GAP.wide,
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
  selectors: {
    // ⚠️ **브라우저 포커스 링을 따로 안 돌린다** — 타이틀 단추(`titleScreen.css`의
    // `button`)와 같다. 표시는 `cardOn`이 한다. 링을 남기면 게임 커서와 브라우저
    // 커서 둘이 한 창에 선다
    '&:focus-visible': { outline: 'none' },
  },
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

export const close = style({
  ...WINDOW_SMALL,
  appearance: 'none',
  padding: `7px ${GAP.base}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.tiny,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
  selectors: {
    '&:hover': { borderColor: vars.pick.edge },
    // 고를 것과 같다 — 링 대신 테두리가 표시다
    '&:focus-visible': { outline: 'none', borderColor: vars.pick.edge },
  },
})
