// 인트로 화면.
//
// 원작은 위 화면에 마박사 그림, 아래 화면에 창이다. 우리는 한 화면이라 그림 자리를
// 위에 비워 두고 창을 아래에 붙인다 — 초상이 들어오면 그 자리에 그대로 얹힌다.
import { keyframes, style } from '@vanilla-extract/css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { WINDOW } from '../theme/window.css'
import { vars } from '../theme/contract.css'

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

export const wrap = style({
  position: 'fixed',
  inset: 0,
  zIndex: 500,
  display: 'flex',
  flexDirection: 'column',
  // 원작 인트로는 검은 바탕에서 마박사만 떠오른다
  background: vars.scrim.over,
  color: vars.ink.normal,
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
  borderRadius: RADIUS.round,
  border: `4px solid ${vars.ball.band}`,
  cursor: 'pointer',
  padding: 0,
  // 위 빨강 아래 흰색, 가운데 띠 — 몬스터볼의 생김새다
  background: `linear-gradient(180deg, ${vars.ball.top} 0 46%,`
    + ` ${vars.ball.band} 46% 54%, ${vars.ball.bottom} 54% 100%)`,
  transition: 'transform 160ms ease-out',
  ':hover': { transform: 'scale(1.04)' },
})

export const ball = style([ballBase, {}])

/**
 * 볼 가운데 버튼을 누르는 자리. 보이는 볼은 3D(`scene/IntroStage`)가 그린다.
 *
 * ⚠️ **자리와 크기를 여기서 정하지 않는다.** 3D 버튼이 화면 어디에 찍히는지는
 * 카메라가 정하므로 `scene/introPlace`가 재고, 화면이 그 값을 그대로 얹는다.
 * 한때 이 단추가 **대사창 위 빈 곳의 한가운데**에 있었는데 버튼은 카메라가
 * 겨누는 화면 한가운데라, 누르는 곳과 보이는 곳이 어긋나 있었다
 */
export const ballHit = style({
  position: 'fixed',
  transform: 'translate(-50%, -50%)',
  borderRadius: RADIUS.round,
  border: 0,
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
  outline: 'none',
  ':focus-visible': { boxShadow: `0 0 0 3px ${vars.pick.edge}` },
})

export const box = style({
  margin: '0 auto 28px',
  width: 'min(760px, 92vw)',
  minHeight: 132,
  padding: '20px 26px',
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base + 2,
  ...WINDOW,
  fontFamily: vars.font.pixel,
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
  padding: `7px ${GAP.wide}px`,
  borderRadius: RADIUS.cell,
  fontSize: TEXT.base,
  border: `2px solid ${vars.window.rule}`,
})

export const choice = style([choiceBase, { color: vars.ink.dim }])

export const choiceOn = style([choiceBase, {
  background: vars.pick.face,
  borderColor: vars.pick.edge,
  color: vars.pick.text,
  fontWeight: 700,
}])

export const nameRow = style({
  display: 'flex',
  gap: 10,
})

export const input = style({
  flex: 1,
  padding: '10px 14px',
  fontSize: 19,
  fontFamily: vars.font.ui,
  color: vars.ink.strong,
  background: vars.bar.trackTop,
  border: `2px solid ${vars.window.edgeDim}`,
  borderRadius: RADIUS.cell,
  outline: 'none',
  ':focus': { borderColor: vars.pick.edge },
})

export const ok = style({
  padding: `${GAP.small + 2}px ${GAP.loose - 2}px`,
  fontSize: TEXT.list,
  fontWeight: 700,
  fontFamily: vars.font.ui,
  color: vars.pick.text,
  background: vars.pick.face,
  border: `2px solid ${vars.pick.edge}`,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
})

export const hint = style({
  padding: '0 0 18px',
  textAlign: 'center',
  fontSize: 13,
  opacity: 0.6,
})
