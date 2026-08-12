// 포켓치 — 오른쪽 위에 걸린 손목시계 한 대.
//
// ⚠️ **메뉴 창이 아니다.** 다른 화면과 같은 어두운 판을 쓰면 「HUD 상자」가
// 되는데, 이건 주인공이 차고 다니는 **물건**이다. 회색 플라스틱 몸체 ·
// 안으로 파인 액정 · 옆구리에 붙은 버튼 둘 · 아래에 찍힌 앱 이름 —
// 그 넷이 시계를 만든다.
//
// 색은 CSS 변수 둘로만 바꾼다 (`--dim`·`--lit`). 컬러체인저가 여덟 색을
// 갈아 끼우는데, 규칙마다 색을 적어 두면 여덟 벌이 생긴다.
import { createVar, globalStyle, keyframes, style, styleVariants } from '@vanilla-extract/css'

/** 액정의 바탕색과 켜진 점 색. `POKETCH_PALETTE`가 값을 준다 */
export const dim = createVar()
export const lit = createVar()

const wake = keyframes({
  from: { opacity: 0, transform: 'translateY(-8px) scale(0.96)' },
  to: { opacity: 1, transform: 'none' },
})

export const root = style({
  position: 'fixed',
  top: 16,
  right: 16,
  zIndex: 40,
  // 화면을 가리기만 하고 눌리지는 않는다 — 조작은 키보드다
  pointerEvents: 'none',
  userSelect: 'none',
  animation: `${wake} 0.18s ease-out`,
})

/** 시계 몸체. 위쪽이 밝고 아래가 죽는 회색 플라스틱 */
export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  padding: 8,
  borderRadius: 14,
  background: 'linear-gradient(160deg, #d8d8d0 0%, #a8a8a0 45%, #74746c 100%)',
  border: '1px solid rgba(255,255,255,0.45)',
  boxShadow: '0 10px 26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)',
})

/** 크게·작게 두 자리. 눈금은 액정의 **점 크기**로만 바뀐다 */
export const size = styleVariants({
  small: { width: 176 },
  large: { width: 300 },
})

/** 액정과 옆구리 버튼이 한 줄이다 */
export const deck = style({
  display: 'flex',
  alignItems: 'stretch',
  gap: 6,
})

/** 옆구리 버튼 둘. 원작도 액정 양옆에 붙어 있다 */
export const side = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 8,
})

export const button = style({
  width: 16,
  height: 22,
  borderRadius: 4,
  display: 'grid',
  placeItems: 'center',
  fontSize: 9,
  color: 'rgba(0,0,0,0.55)',
  background: 'linear-gradient(180deg, #ecece4 0%, #9a9a92 100%)',
  border: '1px solid rgba(0,0,0,0.28)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
})

/** 액정. 안으로 파여 보이게 안쪽 그림자를 준다 */
export const screen = style({
  flex: 1,
  position: 'relative',
  minHeight: 92,
  borderRadius: 6,
  padding: 8,
  overflow: 'hidden',
  background: dim,
  color: lit,
  border: '1px solid rgba(0,0,0,0.45)',
  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.55)',
  fontVariantNumeric: 'tabular-nums',
})

export const screenLarge = style({ minHeight: 188 })

/**
 * 액정의 점 무늬. 원작은 진짜 도트 매트릭스라 **격자가 보인다** —
 * 매끈하게 두면 액정이 아니라 그냥 초록 상자가 된다
 */
globalStyle(`${screen}::after`, {
  content: '""',
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 3px),'
    + ' repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 3px)',
})

/** 앱 이름. 몸체 아래쪽에 작게 찍힌다 */
/**
 * 앱 이름. **몸체 안쪽 아래**에 찍는다 — 바깥에 두면 밤 화면에서 안 보인다
 */
export const label = style({
  textAlign: 'center',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.06em',
  color: 'rgba(28,28,24,0.85)',
  textShadow: '0 1px 0 rgba(255,255,255,0.5)',
})

export const hint = style({
  textAlign: 'center',
  fontSize: 8,
  letterSpacing: '0.03em',
  color: 'rgba(28,28,24,0.55)',
})

// ── 액정 안에서 쓰는 것들 ────────────────────────────────────────────────────

export const center = style({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
})

export const bigNumber = style({
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: '0.04em',
  lineHeight: 1.05,
})

export const hugeNumber = style({
  fontSize: 44,
  fontWeight: 800,
  letterSpacing: '0.04em',
  lineHeight: 1.05,
})

export const small = style({
  fontSize: 10,
  opacity: 0.85,
  letterSpacing: '0.05em',
})

export const rows = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  fontSize: 11,
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
})

export const name = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 체력 막대. 액정이라 색이 아니라 **길이**로만 말한다 */
export const bar = style({
  width: 52,
  height: 6,
  border: `1px solid currentColor`,
  padding: 1,
})

export const barFill = style({
  height: '100%',
  background: 'currentColor',
})

/** 하트 한 줄 (친밀도체커) */
export const hearts = style({
  display: 'flex',
  gap: 2,
  fontSize: 11,
})

/** 도트 격자 (도트아트·메모용지·룰렛) */
export const grid = style({
  display: 'grid',
  gap: 1,
  margin: 'auto',
})

export const cell = style({
  background: 'currentColor',
})

/** 지도 (마킹맵·나무열매탐색기). 그림 위에 표식을 얹는다 */
export const mapBox = style({
  position: 'relative',
  margin: 'auto',
  // 액정이라 지도도 두 색으로 눌러 본다
  filter: 'grayscale(1) contrast(1.4)',
  mixBlendMode: 'luminosity',
  opacity: 0.75,
})

export const marker = style({
  position: 'absolute',
  width: 6,
  height: 6,
  marginLeft: -3,
  marginTop: -3,
  borderRadius: '50%',
  background: 'currentColor',
})

export const here = style([marker, {
  width: 8,
  height: 8,
  marginLeft: -4,
  marginTop: -4,
  border: '1px solid currentColor',
  background: 'transparent',
}])

/** 아날로그 시계 판 */
export const dial = style({
  position: 'relative',
  borderRadius: '50%',
  border: '2px solid currentColor',
  margin: 'auto',
})

export const hand = style({
  position: 'absolute',
  left: '50%',
  bottom: '50%',
  transformOrigin: 'bottom center',
  background: 'currentColor',
})

/** 캘린더 한 달 */
export const month = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 1,
  fontSize: 9,
  textAlign: 'center',
  width: '100%',
})

export const day = style({ opacity: 0.8, lineHeight: '11px' })
export const dayMarked = style([day, {
  opacity: 1,
  fontWeight: 800,
  outline: '1px solid currentColor',
}])
export const dayToday = style([day, {
  opacity: 1,
  fontWeight: 800,
  background: 'currentColor',
  color: dim,
}])

/** 색 여덟 칸 (컬러체인저) */
export const swatches = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 4,
  width: '100%',
})

export const swatch = style({
  height: 14,
  border: '1px solid rgba(0,0,0,0.4)',
})

export const swatchOn = style([swatch, {
  outline: '2px solid #fff',
  outlineOffset: 1,
}])

/** 아직 그 계통이 없다고 말하는 자리 */
export const missing = style({
  textAlign: 'center',
  fontSize: 10,
  lineHeight: 1.5,
  opacity: 0.8,
  padding: '0 4px',
})
