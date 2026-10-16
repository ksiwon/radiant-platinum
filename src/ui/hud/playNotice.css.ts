// 오래 한 판 경고 — 왼쪽 아래 창 한 벌. 이름표(`zoneBanner`)와 같은 작은 창을 쓴다 (DESIGN.md §2 · 알약 금지)
//
// ⚠️ **대사창 · 메뉴 · 배틀이 떠 있으면 숨긴다.** 대사창은 가로 760px로 아래 가운데에 서서, 960px 창에서는 그 왼쪽
// 끝이 100px이다 — 이 창(최대 440px)과 겹쳐 대사를 가렸다(2026-10-15 최종 연쇄 칸 7 캡처). 경고는 사라지지 않고
// 그것들이 닫히면 다시 선다. 떠 있는지는 문서에 적힌 표식으로 본다(`app/sceneMark`)
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, TEXT } from '../theme/scale'
import { WINDOW_SMALL } from '../theme/window.css'

export const box = style({
  ...WINDOW_SMALL,
  position: 'fixed',
  left: GAP.loose,
  bottom: GAP.loose,
  maxWidth: 440,
  padding: `${GAP.base}px ${GAP.loose}px`,
  fontFamily: vars.font.pixel,
  fontSize: TEXT.small,
  lineHeight: 1.5,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  selectors: {
    'html[data-talk] &, html[data-script] &, html[data-cutin] &, html[data-menu] &, html[data-scene="battle"] &': {
      display: 'none',
    },
  },
})

export const title = style({ fontSize: TEXT.base, fontWeight: 700 })

export const actions = style({ display: 'flex', gap: GAP.base, justifyContent: 'flex-end' })

export const button = style({
  font: 'inherit',
  fontWeight: 700,
  color: 'inherit',
  background: 'transparent',
  border: 'none',
  padding: `${GAP.small / 2}px ${GAP.small}px`,
  cursor: 'pointer',
  selectors: {
    '&:hover': { color: vars.pick.text },
    '&:disabled': { opacity: 0.42, cursor: 'default' },
  },
})
