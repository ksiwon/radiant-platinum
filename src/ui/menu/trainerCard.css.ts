// 트레이너 카드 — 가운데 한 장.
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const card = style({
  margin: '0 auto',
  width: 'min(520px, calc(100vw - 64px))',
  padding: '26px 30px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  background: 'linear-gradient(150deg, rgba(58, 96, 168, 0.7), rgba(22, 30, 54, 0.85))',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 18,
  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
})

export const name = style({
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '0.01em',
})

export const rows = style({
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '8px 20px',
  margin: 0,
  fontSize: 17,
})

// `<dt>`·`<dd>`는 클래스가 아니라 태그라 globalStyle로만 잡힌다
globalStyle(`${rows} dt`, { opacity: 0.75 })
globalStyle(`${rows} dd`, { margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' })

export const badges = style({
  display: 'flex',
  gap: 10,
  paddingTop: 6,
})

/** 안 받은 배지는 빈 자리로 남는다 — 몇 개 남았는지가 보여야 한다 */
export const badge = style({
  width: 30,
  height: 30,
  borderRadius: '50%',
  border: '2px dashed rgba(255, 255, 255, 0.28)',
  selectors: {
    '&[data-on="yes"]': {
      border: 'none',
      background: `radial-gradient(circle at 35% 30%, #fff6c2, ${vars.hud.accent})`,
      boxShadow: '0 0 12px rgba(61, 220, 132, 0.5)',
    },
  },
})
