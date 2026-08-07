// 포켓몬 화면.
//
// ⚠️ **글줄 여섯 개로는 파티가 안 읽힌다.** 전에는 이름·레벨·막대를 한 줄에
// 늘어놓았는데, 그러면 여섯 마리가 서로 구별이 안 되고 무엇을 데리고 다니는지가
// 화면에서 안 보인다. 원작 파티 화면이 **카드 여섯 장**인 이유가 그거다.
//
// 그래서 카드로 세운다. 카드마다 원작 배틀 그림이 서고, 선두는 한 단 위로
// 나와서 크다 — 원작도 첫 칸만 따로 띄운다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { SKEW } from './menuChrome.css'

/** 카드 여섯 장. 두 줄로 세우고 선두만 위로 뺀다 */
export const grid = style({
  minHeight: 0,
  overflowY: 'auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '12px 16px',
  alignContent: 'start',
  padding: '6px 10px 14px 22px',
  scrollbarWidth: 'thin',
})

/**
 * 카드 하나.
 *
 * 한쪽이 비스듬하다 — 배틀 체력판과 같은 각이다. 반듯한 사각형이면 카드가
 * 아니라 표의 한 칸으로 읽힌다
 */
export const card = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 74,
  padding: '8px 14px 8px 8px',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 12,
  background: 'linear-gradient(150deg, rgba(32, 41, 66, 0.9), rgba(14, 20, 34, 0.92))',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)',
  clipPath: `polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)`,
  transition: 'transform 130ms cubic-bezier(.2,.85,.3,1), border-color 140ms linear',
})

/** 선두는 한 단 위로 나온다. 원작도 첫 칸만 따로 띄운다 */
export const cardLead = style([card, {
  gridColumn: '1 / -1',
  minHeight: 92,
}])

export const cardOn = style({
  transform: 'translateX(-10px)',
  borderColor: 'rgba(255, 210, 63, 0.85)',
  background: 'linear-gradient(150deg, rgba(52, 66, 100, 0.94), rgba(22, 30, 50, 0.95))',
  boxShadow: '0 10px 26px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255, 210, 63, 0.35)',
})

/** 쓰러진 카드는 눈에 띄게 죽인다 — 회복해야 한다는 것이 한눈에 보여야 한다 */
export const cardFainted = style({
  filter: 'grayscale(0.75)',
  opacity: 0.66,
})

/** 카드 바깥 왼쪽의 커서 */
export const caret = style({
  position: 'absolute',
  left: -20,
  top: '50%',
  width: 0,
  height: 0,
  borderLeft: '11px solid #ffd23f',
  borderTop: '8px solid transparent',
  borderBottom: '8px solid transparent',
  transform: `translateY(-50%) skewX(${String(SKEW)}deg)`,
  filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.75))',
})

/**
 * 그림 자리.
 *
 * 원작 배틀 그림(80×80)을 그대로 쓴다 — 파티용 아이콘을 따로 안 뽑았고,
 * 지어내는 것보다 있는 그림이 낫다. 못 받으면 빈 칸으로 남는다
 */
export const portrait = style({
  width: 62,
  height: 62,
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  objectFit: 'contain',
  filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.5))',
})

export const portraitLead = style([portrait, { width: 80, height: 80 }])

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
})

export const nameRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 7,
  minWidth: 0,
})

export const name = style({
  fontSize: 17,
  fontWeight: 700,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
})

export const male = style({ color: '#6db3f2', fontWeight: 700 })
export const female = style({ color: '#f28ab2', fontWeight: 700 })

export const level = style({
  marginLeft: 'auto',
  fontSize: 14,
  fontFamily: vars.font.mono,
  opacity: 0.85,
  flex: '0 0 auto',
})

/** 상태 이상. 색이 무엇에 걸렸는지를 나른다 */
export const status = style({
  padding: '1px 7px',
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.05em',
  color: '#fff',
  textShadow: '0 1px 1px rgba(0,0,0,0.45)',
  flex: '0 0 auto',
})

/** 배틀 화면과 같은 색표다 — 두 화면에서 같은 상태가 같은 색이어야 한다 */
export const statusColor: Record<string, string> = {
  psn: '#a25bc4', tox: '#8b3fae', brn: '#e8763a',
  par: '#d8b12a', slp: '#7b8794', frz: '#4aa8d8', ko: '#6b7280',
}

export const barRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
})

/** 원작 체력판의 노란 `HP` 글자 */
export const hpTag = style({
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.08em',
  fontStyle: 'italic',
  color: '#f5cf5a',
  flex: '0 0 auto',
})

export const hpTrack = style({
  position: 'relative',
  flex: 1,
  height: 8,
  borderRadius: 5,
  background: 'rgba(0,0,0,0.62)',
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.7)',
  overflow: 'hidden',
})

export const hpFill = style({
  height: '100%',
  borderRadius: 5,
  backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0 40%, rgba(0,0,0,0.12) 100%)',
  transition: 'width 220ms linear, background-color 200ms linear',
})

export const hpText = style({
  fontSize: 13,
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  minWidth: 62,
  textAlign: 'right',
  flex: '0 0 auto',
})

/** 오른쪽 자세히 보기 — 능력 여섯 */
export const stats = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
})

export const statRow = style({
  display: 'grid',
  gridTemplateColumns: '68px 1fr 46px',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
})

/** 성격 보정 화살표. 값이 아니라 **이름 쪽**에 붙는다 — 원작도 그렇다 */
export const statName = style({
  opacity: 0.75,
  selectors: {
    '&[data-nature="up"]::after': { content: '"▲"', color: '#7ee08a', fontSize: 10, marginLeft: 4 },
    '&[data-nature="down"]::after': { content: '"▼"', color: '#f2a2a2', fontSize: 10, marginLeft: 4 },
  },
})

/**
 * 능력 막대.
 *
 * 숫자만 있으면 어느 쪽이 센지가 한눈에 안 들어온다. 4세대 실전 상한이
 * 대략 400이라 그것을 꽉 찬 길이로 본다 — 절대 기준이 아니라 **견주는 자**다
 */
export const statBar = style({
  height: 6,
  borderRadius: 4,
  background: 'rgba(0,0,0,0.45)',
  overflow: 'hidden',
})

export const statFill = style({
  height: '100%',
  borderRadius: 4,
  background: 'linear-gradient(90deg, #6ea8e8, #9fd0ff)',
})

export const statValue = style({
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 700,
  textAlign: 'right',
})

export const moveRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 12px',
  marginBottom: 5,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  fontSize: 15,
  transform: `skewX(-${String(SKEW)}deg)`,
})

export const moveFace = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  transform: `skewX(${String(SKEW)}deg)`,
})

export const movePp = style({
  marginLeft: 'auto',
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 13,
  opacity: 0.8,
})
