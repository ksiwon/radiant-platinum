// 메뉴 화면 공통 껍데기.
//
// 원작은 두 화면(위·아래)에 나눠 그리지만 우리는 한 화면이다. 그래서 "위 화면에
// 보여 주던 설명"은 오른쪽 칸으로 옮긴다 — 정보의 관계는 그대로 두고 배치만 편다.
//
// 색은 원작 UI의 인상을 따른다: 짙은 남색 바탕에 밝은 카드, 고른 줄만 흰 알약.
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const OVERLAY_Z = 400

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

/** 화면 전체를 덮는다. 뒤의 3D는 계속 돌지만 흐려진다 */
export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: OVERLAY_Z,
  display: 'flex',
  flexDirection: 'column',
  background: 'radial-gradient(120% 100% at 50% 0%, rgba(28, 38, 66, 0.94), rgba(10, 14, 26, 0.97))',
  backdropFilter: 'blur(3px)',
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  animation: `${fadeIn} 0.12s ease-out`,
})

/** 화면 이름 + 오른쪽 보조 정보(소지금 등) */
export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '18px 32px 12px',
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: '0.02em',
})

export const headerNote = style({
  fontSize: 17,
  fontWeight: 500,
  opacity: 0.85,
  fontVariantNumeric: 'tabular-nums',
})

/** 본문 — 왼쪽 목록, 오른쪽 자세히 */
export const body = style({
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 0.9fr)',
  gap: 20,
  padding: '0 32px 20px',
  '@media': {
    '(max-width: 860px)': { gridTemplateColumns: '1fr' },
  },
})

export const panel = style({
  background: 'rgba(18, 24, 42, 0.72)',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 14,
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
})

export const scroll = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: 8,
  scrollbarWidth: 'thin',
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '9px 14px',
  borderRadius: 10,
  fontSize: 18,
  lineHeight: '24px',
  cursor: 'default',
})

export const rowOn = style([row, {
  background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.94), rgba(226, 234, 250, 0.9))',
  color: '#131a2c',
  fontWeight: 700,
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
}])

/** 흐린 줄 — 못 쓰는 항목, 아직 안 본 포켓몬 */
export const rowDim = style([row, { opacity: 0.42 }])

/** 오른쪽 칸의 설명문 */
export const detail = style({
  padding: '18px 20px',
  fontSize: 17,
  lineHeight: '27px',
  whiteSpace: 'pre-line',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
})

export const footer = style({
  padding: '0 32px 18px',
  fontSize: 14,
  opacity: 0.6,
})

/** 목록 오른쪽에 붙는 숫자(개수·레벨). 자릿수가 흔들리지 않게 고정폭 */
export const count = style({
  marginLeft: 'auto',
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.9,
})

/** 32×32 아이콘 한 칸. 아틀라스를 배경으로 잘라 쓴다 */
export const icon = style({
  width: 32,
  height: 32,
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 탭 줄 — 가방 주머니, 도감 정렬 */
export const tabs = style({
  display: 'flex',
  gap: 6,
  padding: '0 32px 12px',
  flexWrap: 'wrap',
})

const tabBase = style({
  padding: '6px 14px',
  borderRadius: 999,
  fontSize: 15,
  border: `1px solid ${vars.panel.border}`,
  background: 'rgba(18, 24, 42, 0.6)',
})

export const tab = styleVariants({
  off: [tabBase, { opacity: 0.6 }],
  on: [tabBase, {
    background: vars.hud.accent,
    borderColor: 'transparent',
    color: '#0c1220',
    fontWeight: 700,
  }],
})
