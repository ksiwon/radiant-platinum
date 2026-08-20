// 배틀 교체 화면의 모양 (PLAN §2.5)
//
// 원작(BDSP)의 교체 화면은 **왼쪽에 파티, 오른쪽에 그 한 마리의 속사정**이다.
// 우리 것은 오래 명령 메뉴와 같은 알약 여섯 개였는데, 그러면 "누구를 내보낼까"를
// 정할 근거가 화면에 하나도 없다 — 체력도 타입도 기술도 안 보이니 이름만 보고
// 고르게 된다.
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 무대 위에 통째로 덮는다. 고르는 동안은 배틀 화면이 아니라 이 화면이다 */
export const sheet = style({
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(300px, 34%) minmax(0, 1fr)',
  gap: 22,
  padding: '26px 34px 22px',
  // 무대가 비쳐야 여기가 배틀 위라는 것이 남는다. 완전히 가리면 장면이 끊긴다
  background:
    'linear-gradient(100deg, rgba(6,10,20,0.92) 0%, rgba(6,10,20,0.72) 55%,'
    + ' rgba(6,10,20,0.55) 100%)',
  backdropFilter: 'blur(3px)',
  zIndex: 3,
})

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  overflowY: 'auto',
  scrollbarWidth: 'thin',
  paddingRight: 4,
})

/**
 * 파티 한 칸.
 *
 * 기운 알약(명령 메뉴)과 **일부러 다르게** 반듯한 카드다 — 저기는 "지금 무엇을
 * 할까"고 여기는 "누구인가"다. 같은 모양이면 두 화면이 겹쳐 보인다
 */
export const card = style({
  position: 'relative',
  appearance: 'none',
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '9px 14px 10px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'linear-gradient(180deg, rgba(28,38,62,0.92), rgba(13,19,33,0.94))',
  boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
  color: vars.panel.text,
  font: 'inherit',
  cursor: 'pointer',
  transition: 'transform 120ms cubic-bezier(.2,.85,.3,1), border-color 120ms linear',
  selectors: {
    '&:hover:enabled': { transform: 'translateX(4px)' },
    '&:disabled': { cursor: 'default' },
  },
})

/** 고른 칸. 왼쪽 굵은 띠가 커서를 대신한다 */
export const cardOn = style({
  borderColor: 'rgba(255,255,255,0.62)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.55), inset 3px 0 0 rgba(255,255,255,0.85)',
  transform: 'translateX(4px)',
})

/** 못 내보내는 칸 — 쓰러졌거나 이미 나와 있다 */
export const cardOut = style({ opacity: 0.46 })

/** 지금 나와 있는 칸. 흐리게 두되 나와 있다는 표시는 남긴다 */
export const cardHere = style({
  borderColor: 'rgba(120, 200, 255, 0.5)',
})

export const cardTop = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
})

export const name = style({
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: '0.01em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const level = style({
  marginLeft: 'auto',
  fontSize: 12,
  opacity: 0.85,
  fontWeight: 700,
  flex: '0 0 auto',
})

export const bar = style({
  marginTop: 6,
  height: 7,
  borderRadius: 999,
  background: 'rgba(0,0,0,0.55)',
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
  overflow: 'hidden',
})

export const fill = style({
  height: '100%',
  borderRadius: 999,
  transition: 'width 180ms linear',
})

/** 게이지 색. 원작이 픽셀 수로 가르는 그대로다 (`battle/healthbar`) */
export const fillColor: Record<string, string> = {
  green: '#5fd35f', yellow: '#f5c542', red: '#ef5350', empty: '#6b7280',
}

export const numbers = style({
  marginTop: 3,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  opacity: 0.9,
  fontVariantNumeric: 'tabular-nums',
})

/** 상태이상·기절 딱지 */
export const tag = style({
  padding: '1px 7px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 800,
  color: '#101623',
})

// ── 오른쪽: 고른 한 마리의 속사정 ────────────────────────────────────────────

export const detail = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
  alignSelf: 'start',
  padding: 16,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'linear-gradient(180deg, rgba(20,27,46,0.9), rgba(11,16,28,0.92))',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
})

/** 맨 위 띠 — 내보낼 수 있는지를 한 줄로 말한다 */
export const banner = style({
  margin: '-16px -16px 0',
  padding: '10px 16px',
  borderRadius: '18px 18px 0 0',
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: '0.02em',
})

export const bannerKind = styleVariants({
  ok: { background: 'rgba(60, 120, 90, 0.55)' },
  here: { background: 'rgba(50, 100, 150, 0.55)' },
  down: { background: 'rgba(150, 60, 70, 0.55)' },
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
})

export const rowLabel = style({
  fontSize: 12,
  fontWeight: 700,
  opacity: 0.7,
  flex: '0 0 44px',
})

/** 타입 조각. 색은 기술 칸과 같은 표에서 온다 (`typeColor`) */
export const typeChip = style({
  padding: '2px 10px',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 800,
  color: '#0d1220',
  background: 'var(--tint, #888)',
})

export const moves = style({
  display: 'grid',
  gap: 5,
})

export const move = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '5px 10px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.05)',
  minWidth: 0,
})

export const moveName = style({
  fontSize: 14,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const pp = style({
  marginLeft: 'auto',
  fontSize: 12,
  opacity: 0.85,
  fontVariantNumeric: 'tabular-nums',
  flex: '0 0 auto',
})

/**
 * 상대에게 얼마나 통하는가.
 *
 * ⚠️ **판정이 아니라 귀띔이다.** 실제 배틀 계산은 sim이 하고, 여기 뜨는 것은
 * 그 한 수가 상대의 타입에 몇 배인지를 우리 표로 미리 재 본 값이다
 * (`ai/typeChart`). 원작 교체 화면에도 같은 글이 뜬다
 */
export const hint = styleVariants({
  super: { color: '#ffd15c', fontWeight: 800, fontSize: 12, flex: '0 0 auto' },
  weak: { color: '#8fb4d9', fontWeight: 800, fontSize: 12, flex: '0 0 auto' },
  none: { color: '#9aa3b2', fontWeight: 800, fontSize: 12, flex: '0 0 auto' },
})

export const ability = style({
  padding: '9px 12px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
})

export const abilityName = style({ fontSize: 14, fontWeight: 800 })
export const abilityText = style({
  marginTop: 3,
  fontSize: 12,
  lineHeight: 1.5,
  opacity: 0.85,
  whiteSpace: 'pre-line',
})
export const empty = style({
  padding: '18px 14px',
  borderRadius: 14,
  border: '1px dashed rgba(255,255,255,0.16)',
  fontSize: 13,
  opacity: 0.45,
})
