// 타이틀 화면.
//
// 여기가 게임의 첫인상이라 **게임 화면처럼 보여야 한다.** 가운데 정렬한 버튼
// 두 개가 아니라, 제목이 화면을 차지하고 그 아래에 고를 것이 놓인 모양이다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 배경이 천천히 흐른다. 정지 화면이면 게임이 멈춘 것처럼 보인다 */
const drift = keyframes({
  '0%': { transform: 'translate3d(0, 0, 0) scale(1.06)' },
  '50%': { transform: 'translate3d(-1.4%, -1%, 0) scale(1.1)' },
  '100%': { transform: 'translate3d(0, 0, 0) scale(1.06)' },
})

export const wrap = style({
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateRows: '1fr auto 1fr',
  justifyItems: 'center',
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  zIndex: 10,
  overflow: 'hidden',
  userSelect: 'none',
  background: '#070c16',
})

/**
 * 하늘.
 *
 * 3D 무대를 띄우지 않는다 — 타이틀은 three.js 없이 떠야 한다(PLAN §10.4).
 * 대신 필드의 낮 하늘과 같은 계열로 칠해서 이어지는 느낌만 남긴다
 */
export const sky = style({
  position: 'absolute',
  inset: 0,
  zIndex: -2,
  backgroundImage: "url('/assets/radiant-platinum-intro.png')",
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
  animation: `${drift} 26s ease-in-out infinite`,
})

/** 아래쪽 땅. 지평선이 있으면 하늘이 하늘로 읽힌다 */
export const ground = style({
  position: 'absolute',
  inset: 0,
  zIndex: -1,
  background:
    'linear-gradient(180deg, transparent 58%, rgba(2, 3, 6, 0.2) 72%, rgba(2, 3, 6, 0.82) 100%)',
  pointerEvents: 'none',
})

export const head = style({
  position: 'absolute',
  left: '50%',
  bottom: 'clamp(20px, 3.5vh, 42px)',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  width: 'min(560px, calc(100vw - 32px))',
  transform: 'translateX(-50%)',
})

export const crest = style({
  display: 'none',
})

/** 위에 작게 얹히는 줄 */
export const brand = style({
  fontSize: 'clamp(15px, 1.9vw, 22px)',
  fontWeight: 700,
  letterSpacing: '0.42em',
  textIndent: '0.42em',
  color: '#f7e08a',
  textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 18px rgba(247, 224, 138, 0.35)',
})

/**
 * 제목.
 *
 * 백금이라 **금속처럼** 보여야 한다 — 위아래로 밝기가 뒤집히는 그라디언트가
 * 그 느낌을 낸다. 글자에 직접 칠하려고 `background-clip`을 쓴다
 */
export const title = style({
  margin: 0,
  fontSize: 'clamp(38px, 7.4vw, 92px)',
  fontWeight: 800,
  lineHeight: 1.02,
  letterSpacing: '0.02em',
  textAlign: 'center',
  backgroundImage:
    'linear-gradient(180deg, #ffffff 0%, #dfe8f2 26%, #9fb2c6 48%,' +
    ' #f2f6fa 56%, #b9c8d8 74%, #7f92a8 100%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
  filter: 'drop-shadow(0 3px 0 rgba(30, 48, 74, 0.55)) drop-shadow(0 10px 26px rgba(0,0,0,0.6))',
})

/** 팬이 만든 것이라는 표시. 감추지 않는다 */
export const sub = style({
  fontSize: 'clamp(11px, 1.25vw, 14px)',
  letterSpacing: '0.16em',
  opacity: 0.72,
  textShadow: '0 1px 4px rgba(0,0,0,0.7)',
})

export const menu = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  width: '100%',
})

export const button = style({
  position: 'relative',
  flex: 1,
  appearance: 'none',
  padding: '13px 22px',
  fontSize: 17,
  fontWeight: 700,
  fontFamily: vars.font.ui,
  color: '#eef3fa',
  textAlign: 'center',
  background: 'linear-gradient(180deg, rgba(22, 32, 50, 0.86), rgba(12, 19, 32, 0.9))',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
  backdropFilter: 'blur(3px)',
  cursor: 'pointer',
  transition: 'transform 90ms ease-out, border-color 120ms linear, box-shadow 120ms linear',
  selectors: {
    '&:active': { transform: 'translateY(1px)' },
  },
})

/**
 * 커서가 올라간 칸.
 *
 * 마우스 hover와 키보드 커서를 **같은 표시**로 둔다 — 둘이 다르면 어느 쪽이
 * 지금 눌리는 칸인지 헷갈린다
 */
export const buttonOn = style({
  borderColor: 'rgba(247, 224, 138, 0.75)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(247, 224, 138, 0.3)',
  background: 'linear-gradient(180deg, rgba(34, 48, 72, 0.92), rgba(18, 27, 44, 0.94))',
})

/** 지금 고른 칸 앞의 화살표. 원작 메뉴도 커서를 글자 앞에 둔다 */
export const caret = style({
  position: 'absolute',
  left: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#f7e08a',
  fontSize: 13,
})

export const hint = style({
  fontSize: 12,
  opacity: 0.62,
  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
})

/** 화면 아래에 붙는 조작 안내 */
export const foot = style({
  display: 'none',
})

/** 리포트 요약. 원작 메인 메뉴도 이 넷을 보여준다 */
export const summary = style({
  display: 'grid',
  gridTemplateColumns: 'auto auto',
  columnGap: 28,
  rowGap: 5,
  margin: 0,
  padding: '12px 20px',
  fontSize: 14,
  background: 'linear-gradient(180deg, rgba(18, 26, 42, 0.78), rgba(11, 17, 29, 0.82))',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  backdropFilter: 'blur(3px)',
  boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
})

globalStyle(`${summary} dt`, { opacity: 0.62 })
globalStyle(`${summary} dd`, {
  margin: 0,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
})

/** 리포트가 있을 때만 뜨는 "처음부터". 실수로 누르면 안 되므로 글자로만 둔다 */
export const restart = style({
  appearance: 'none',
  background: 'none',
  border: 'none',
  padding: '4px 8px',
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.panel.text,
  opacity: 0.5,
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  selectors: {
    '&:hover': { opacity: 0.9 },
  },
})
