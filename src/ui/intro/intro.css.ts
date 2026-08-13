// 인트로 화면.
//
// 원작은 위 화면에 마박사 그림, 아래 화면에 창이다. 우리는 한 화면이라 그림 자리를
// 위에 비워 두고 창을 아래에 붙인다 — 초상이 들어오면 그 자리에 그대로 얹힌다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

export const wrap = style({
  position: 'fixed',
  inset: 0,
  zIndex: 500,
  display: 'flex',
  flexDirection: 'column',
  // 원작 인트로는 검은 바탕에서 마박사만 떠오른다
  background: 'rgba(5, 7, 13, 0.08)',
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  animation: `${fadeIn} 0.4s ease-out`,
})

/** 그림 자리. 지금은 몬스터볼만 선다 */
export const stage = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
})

const ballBase = style({
  width: 120,
  height: 120,
  borderRadius: '50%',
  border: '4px solid #10151f',
  cursor: 'pointer',
  padding: 0,
  // 위 빨강 아래 흰색, 가운데 띠 — 몬스터볼의 생김새다
  background: 'linear-gradient(180deg, #e5484d 0 46%, #10151f 46% 54%, #f4f6fb 54% 100%)',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset -10px -12px 24px rgba(0, 0, 0, 0.28)',
  transition: 'transform 160ms ease-out, box-shadow 220ms ease-out',
  ':hover': { transform: 'scale(1.04)' },
})

export const ball = style([ballBase, {}])

/**
 * 열린 볼. 원작은 여기서 이어롭이 나온다 — 우리는 포켓몬 그림을 아직 못 뽑아서
 * 빛만 남는다 (`engine/intro/beats.ts` 머리말)
 */
export const ballOpen = style([
  ballBase,
  {
    transform: 'scale(1.15)',
    boxShadow: '0 0 90px 30px rgba(255, 246, 200, 0.75), 0 12px 40px rgba(0, 0, 0, 0.6)',
  },
])

/** Transparent hit target; the visible ball is rendered by IntroStage. */
export const ballHit = style({
  width: 150,
  height: 150,
  borderRadius: '50%',
  border: 0,
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
  outline: 'none',
  ':focus-visible': { boxShadow: '0 0 0 3px rgba(255, 238, 164, 0.72)' },
})

export const box = style({
  margin: '0 auto 28px',
  width: 'min(760px, 92vw)',
  minHeight: 132,
  padding: '20px 26px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  background: 'rgba(12, 17, 30, 0.9)',
  border: '2px solid rgba(150, 176, 224, 0.5)',
  borderRadius: 14,
  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
})

export const text = style({
  fontSize: 19,
  lineHeight: '30px',
  whiteSpace: 'pre-line',
  minHeight: 60,
})

export const choices = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
})

const choiceBase = style({
  padding: '7px 16px',
  borderRadius: 999,
  fontSize: 16,
  border: `1px solid ${vars.panel.border}`,
})

export const choice = style([choiceBase, { opacity: 0.55 }])

export const choiceOn = style([
  choiceBase,
  {
    background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.95), rgba(222, 232, 252, 0.9))',
    color: '#131a2c',
    fontWeight: 700,
    borderColor: 'transparent',
  },
])

export const nameRow = style({
  display: 'flex',
  gap: 10,
})

export const input = style({
  flex: 1,
  padding: '10px 14px',
  fontSize: 19,
  fontFamily: vars.font.ui,
  color: vars.panel.text,
  background: 'rgba(255, 255, 255, 0.08)',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 10,
  outline: 'none',
  ':focus': { borderColor: vars.hud.accent },
})

export const ok = style({
  padding: '10px 22px',
  fontSize: 17,
  fontFamily: vars.font.ui,
  color: '#0c1220',
  background: vars.hud.accent,
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
})

export const hint = style({
  padding: '0 0 18px',
  textAlign: 'center',
  fontSize: 13,
  opacity: 0.6,
})
