// 트레이너 카드 — 가운데 한 장.
//
// ⚠️ **이건 목록이 아니라 물건이다.** 다른 메뉴는 고르는 화면이지만 이 화면은
// 카드 한 장을 보여 주는 것이 전부라, 다른 화면과 같은 상자를 쓰면 "설정값이
// 적힌 표"로 읽힌다. 원작 카드처럼 **한쪽 모서리를 자르고**, 번호를 크게 박고,
// 배지를 아래에 한 줄로 늘어놓는다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT, TIME } from '../theme/scale'

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
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
  // 파랑에서 남색으로. 세로다 — **대각선이 아니다.** 145도로 흐르는 판에
  // 광택을 얹은 것이 곧 핀테크 앱의 카드 목업이었다 (DESIGN.md §0)
  background: `linear-gradient(180deg, ${vars.card.faceTop}, ${vars.card.faceBottom})`,
  border: `${EDGE.window}px solid ${vars.card.edge}`,
  borderRadius: RADIUS.window,
  color: vars.card.text,
  // 오른쪽 아래를 자른다 — 이 각 하나가 "카드"를 만든다
  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%)',
  animation: `${rise} ${TIME.fade} ease-out`,
})

// ⚠️ **코팅 광택을 안 얹는다.** 여기 있던 `::before`가 대각 흰 띠와 빗금
// 무늬였다 — 원작 카드는 납작하다

export const top = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
})

export const title = style({
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.card.textDim,
})

export const name = style({
  fontSize: TEXT.big + 4,
  fontWeight: 800,
})

/** 번호. 원작 카드도 오른쪽 위에 크게 박는다 */
export const idNo = style({
  textAlign: 'right',
  fontFamily: vars.font.mono,
  fontSize: TEXT.big - 2,
  fontWeight: 800,
})

export const idLabel = style({
  display: 'block',
  fontSize: TEXT.tiny,
  color: vars.card.textDim,
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
globalStyle(`${rows} dt`, { color: vars.card.textDim, fontWeight: 600 })
globalStyle(`${rows} dd`, {
  margin: 0,
  textAlign: 'right',
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 700,
})

export const badgeHead = style({
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.card.textDim,
  marginTop: GAP.tight,
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
  // 배지는 실제로 둥근 것이라 여기는 `round`가 맞다
  borderRadius: RADIUS.round,
  border: `2px dashed ${vars.card.badgeOff}`,
  selectors: {
    '&[data-on="yes"]': {
      border: `2px solid ${vars.bar.edge}`,
      background: vars.card.badgeOn,
    },
  },
})
