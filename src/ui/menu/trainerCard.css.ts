// 트레이너 카드 — 가운데 한 장.
//
// ⚠️ **이건 목록이 아니라 물건이다.** 다른 메뉴는 고르는 화면이지만 이 화면은
// 카드 한 장을 보여 주는 것이 전부라, 다른 화면과 같은 상자를 쓰면 "설정값이
// 적힌 표"로 읽힌다. 원작 카드처럼 **한쪽 모서리를 자르고**, 번호를 크게 박고,
// 배지를 아래에 한 줄로 늘어놓는다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(14px) rotate(-0.6deg)' },
  to: { opacity: 1, transform: 'none' },
})

export const card = style({
  position: 'relative',
  margin: 'auto',
  width: 'min(560px, calc(100vw - 72px))',
  padding: '28px 32px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  // 파랑에서 남색으로. 원작 카드도 한 가지 색이 아니라 옅게 흐른다
  background:
    'linear-gradient(145deg, #3f6db4 0%, #2d4d86 42%, #1b2a4c 100%)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 16,
  // 오른쪽 아래를 자른다 — 이 각 하나가 "카드"를 만든다
  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%)',
  boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
  animation: `${rise} 0.22s cubic-bezier(.2,.85,.3,1)`,
})

/** 카드 위쪽을 훑는 빛. 코팅된 카드처럼 보이게 하는 한 겹이다 */
globalStyle(`${card}::before`, {
  content: '""',
  position: 'absolute',
  inset: 0,
  background:
    'linear-gradient(118deg, rgba(255,255,255,0.16) 0 18%, rgba(255,255,255,0) 34%),'
    + ' repeating-linear-gradient(118deg, rgba(255,255,255,0.03) 0 3px, transparent 3px 12px)',
  pointerEvents: 'none',
})

export const top = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
})

export const title = style({
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.24em',
  opacity: 0.7,
})

export const name = style({
  fontSize: 32,
  fontWeight: 800,
  letterSpacing: '0.01em',
  textShadow: '0 2px 6px rgba(0,0,0,0.5)',
})

/** 번호. 원작 카드도 오른쪽 위에 크게 박는다 */
export const idNo = style({
  textAlign: 'right',
  fontFamily: vars.font.mono,
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: '0.06em',
  opacity: 0.92,
  textShadow: '0 2px 6px rgba(0,0,0,0.5)',
})

export const idLabel = style({
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.2em',
  opacity: 0.6,
  fontWeight: 700,
})

export const rows = style({
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '9px 20px',
  margin: 0,
  fontSize: 17,
})

// `<dt>`·`<dd>`는 클래스가 아니라 태그라 globalStyle로만 잡힌다
globalStyle(`${rows} dt`, { opacity: 0.72, fontWeight: 600 })
globalStyle(`${rows} dd`, {
  margin: 0,
  textAlign: 'right',
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 700,
})

export const badgeHead = style({
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.2em',
  opacity: 0.6,
  marginTop: 4,
})

export const badges = style({
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
})

/**
 * 배지 한 자리.
 *
 * ⚠️ **안 받은 자리를 지우지 않는다.** 빈 테두리로 남겨야 여덟 중 몇 개인지가
 * 보인다 — 받은 것만 늘어놓으면 얼마나 남았는지를 세어야 안다
 */
export const badge = style({
  width: 34,
  height: 34,
  borderRadius: '50%',
  border: '2px dashed rgba(255, 255, 255, 0.26)',
  selectors: {
    '&[data-on="yes"]': {
      border: 'none',
      background: 'radial-gradient(circle at 34% 28%, #fff6c2 0%, #f7d24a 45%, #b8862a 100%)',
      boxShadow: '0 0 14px rgba(247, 210, 74, 0.55), 0 2px 5px rgba(0,0,0,0.5)',
    },
  },
})
