// 읽기 전용 탭 안내 — 위쪽 가운데 창 한 벌 (`playNotice.css`와 같은 작은 창)
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, TEXT } from '../theme/scale'
import { WINDOW_SMALL } from '../theme/window.css'

export const box = style({
  ...WINDOW_SMALL,
  position: 'fixed',
  top: GAP.loose,
  left: '50%',
  transform: 'translateX(-50%)',
  maxWidth: 520,
  padding: `${GAP.base}px ${GAP.loose}px`,
  fontFamily: vars.font.pixel,
  fontSize: TEXT.small,
  lineHeight: 1.5,
  // 메뉴(저장 화면)·대사 위에도 서야 한다
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
})

export const title = style({ fontSize: TEXT.base, fontWeight: 700 })
