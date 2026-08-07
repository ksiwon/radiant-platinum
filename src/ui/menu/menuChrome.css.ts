// 메뉴 화면 공통 껍데기.
//
// 원작은 두 화면(위·아래)에 나눠 그리지만 우리는 한 화면이다. "위 화면에 보여
// 주던 설명"은 오른쪽으로 옮긴다 — 정보의 관계는 그대로 두고 배치만 편다.
//
// ⚠️ **판을 늘어놓지 않는다.** 전에는 둥근 상자 둘을 나란히 놓고 그 안에 줄을
// 채웠는데, 그러면 화면마다 "상자 안의 목록"이 되어 무엇을 보는 화면인지가
// 배치로 안 읽힌다. 배틀 화면에서 이미 같은 지적을 받았다.
//
// 대신 배틀 화면과 **같은 말투**를 쓴다: 9° 기운 알약, 고른 칸을 색으로 채우기,
// 칸 바깥의 커서 화살표, 판 없는 설명글. 두 화면이 한 게임으로 읽혀야 한다.
import { globalStyle, keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

export const OVERLAY_Z = 400

/** 배틀 명령 칸과 같은 각. 다르면 두 화면이 다른 게임처럼 보인다 */
export const SKEW = 9

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'none' },
})

/**
 * 화면 전체를 덮는다. 뒤의 3D는 계속 돌지만 흐려진다.
 *
 * 위에서 아래로 훑는 빗금 한 겹을 얹는다 — 단색 어둠은 "로딩 중"으로 읽히고,
 * 아주 옅은 무늬가 있으면 화면이 하나의 판으로 선다
 */
export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: OVERLAY_Z,
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  background:
    'radial-gradient(120% 90% at 12% 0%, rgba(34, 46, 78, 0.95), rgba(8, 12, 22, 0.975)),'
    + ' repeating-linear-gradient(115deg, rgba(255,255,255,0.022) 0 2px, transparent 2px 9px)',
  backdropFilter: 'blur(4px)',
  color: vars.panel.text,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  animation: `${fadeIn} 0.14s cubic-bezier(.2,.85,.3,1)`,
})

/**
 * 화면 이름.
 *
 * 상자가 아니라 **기운 띠**다. 왼쪽 위 모서리에 걸쳐 두면 화면 이름을 읽으려고
 * 눈이 가운데로 갈 일이 없다 — 목록은 그 아래에서 바로 시작한다
 */
export const head = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 20,
  padding: '22px 42px 14px',
})

export const crest = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 12,
  padding: '7px 26px 7px 20px',
  transform: `skewX(-${String(SKEW)}deg)`,
  background: 'linear-gradient(100deg, rgba(247, 224, 138, 0.92), rgba(226, 179, 74, 0.86))',
  borderRadius: 4,
  boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
})

export const crestText = style({
  transform: `skewX(${String(SKEW)}deg)`,
  fontSize: 21,
  fontWeight: 800,
  letterSpacing: '0.04em',
  color: '#191203',
})

/** 오른쪽 보조 정보 — 소지금·마릿수 */
export const headNote = style({
  fontSize: 17,
  fontWeight: 600,
  opacity: 0.9,
  fontVariantNumeric: 'tabular-nums',
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
})

/**
 * 본문.
 *
 * 왼쪽이 고르는 것, 오른쪽이 그것에 대한 것. **가르는 것은 상자가 아니라 여백과
 * 실선 하나**다
 */
export const stage = style({
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(360px, 1.05fr) minmax(300px, 0.95fr)',
  gap: 34,
  padding: '0 42px 8px',
  '@media': {
    '(max-width: 900px)': { gridTemplateColumns: '1fr', gap: 18 },
  },
})

/** 한 칸 전체를 쓰는 본문 (트레이너 카드처럼 목록이 없는 화면) */
export const stageWide = style([stage, { gridTemplateColumns: '1fr' }])

export const list = style({
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  // 커서 화살표가 칸 **바깥**에 선다. 안에 두면 고를 때마다 글자가 밀린다
  paddingLeft: 26,
  paddingRight: 10,
  paddingBottom: 12,
  scrollbarWidth: 'thin',
})

/**
 * 고를 수 있는 한 줄. 배틀 명령 칸과 같은 알약이다.
 *
 * `div`에도 쓰이므로 `button` 전용 속성은 안 넣는다
 */
export const row = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  minHeight: 46,
  padding: '7px 20px 7px 14px',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  borderRadius: 999,
  background: 'linear-gradient(180deg, rgba(30, 38, 62, 0.86), rgba(14, 20, 34, 0.9))',
  boxShadow: '0 5px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
  color: vars.panel.text,
  font: 'inherit',
  fontSize: 16,
  fontWeight: 600,
  textAlign: 'left',
  flex: '0 0 auto',
  transform: `skewX(-${String(SKEW)}deg)`,
  transition:
    'transform 130ms cubic-bezier(.2,.85,.3,1), background 140ms linear,'
    + ' border-color 140ms linear, box-shadow 140ms linear',
})

/** 기운 판을 되돌려 **글자는 반듯하게** 세운다 */
export const face = style({
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  transform: `skewX(${String(SKEW)}deg)`,
})

/**
 * 고른 줄.
 *
 * 색을 덧칠하는 게 아니라 그 줄의 색으로 **통째로 채우고** 한 걸음 나온다.
 * `--tint`를 안 주면 밝은 남색이다
 */
export const rowOn = style([row, {
  transform: `skewX(-${String(SKEW)}deg) translateX(-13px)`,
  borderColor: 'rgba(255,255,255,0.9)',
  background:
    'linear-gradient(180deg, var(--tint, #4a6ea8) 0%,'
    + ' color-mix(in srgb, var(--tint, #4a6ea8) 70%, #05070d) 100%)',
  boxShadow: '0 9px 26px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
  color: '#ffffff',
  fontWeight: 700,
}])

/** 못 쓰는 항목·아직 안 본 포켓몬 */
export const rowDim = style([row, { opacity: 0.38 }])

/** 칸 바깥 왼쪽의 커서 */
export const caret = style({
  position: 'absolute',
  left: -21,
  top: '50%',
  width: 0,
  height: 0,
  borderLeft: '11px solid #ffd23f',
  borderTop: '8px solid transparent',
  borderBottom: '8px solid transparent',
  transform: `translateY(-50%) skewX(${String(SKEW)}deg)`,
  filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.75))',
})

/** 이름 — 길면 잘린다. 목록이 흔들리지 않게 */
export const label = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** 줄 오른쪽 끝의 숫자 */
export const count = style({
  marginLeft: 'auto',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: vars.font.mono,
  flex: '0 0 auto',
})

/**
 * 오른쪽 칸.
 *
 * **판이 아니다.** 왼쪽 세로선 하나가 "여기가 설명"이라는 표시를 대신하고,
 * 뒤에는 모서리 없는 번짐만 깐다 — 배틀 로그와 같은 규칙이다
 */
export const detail = style({
  position: 'relative',
  isolation: 'isolate',
  minHeight: 0,
  overflowY: 'auto',
  padding: '4px 8px 16px 20px',
  borderLeft: '3px solid rgba(255, 255, 255, 0.28)',
  scrollbarWidth: 'thin',
  '::before': {
    content: '""',
    position: 'absolute',
    inset: '-10px -30px -10px -26px',
    zIndex: -1,
    background:
      'radial-gradient(60% 70% at 25% 30%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)',
    pointerEvents: 'none',
  },
})

export const detailTitle = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '0.01em',
  marginBottom: 4,
  textShadow: '0 2px 4px rgba(0,0,0,0.6)',
})

export const detailSub = style({
  fontSize: 13,
  opacity: 0.62,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
})

export const detailText = style({
  fontSize: 16,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
  opacity: 0.92,
})

/** 설명 안의 작은 제목 — "능력", "기술" */
export const detailHead = style({
  marginTop: 18,
  marginBottom: 7,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.16em',
  opacity: 0.5,
})

export const foot = style({
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '0 42px 20px',
  fontSize: 12,
  letterSpacing: '0.02em',
  opacity: 0.5,
  textShadow: '0 1px 3px rgba(0,0,0,0.85)',
})

/** 32×32 아이콘 한 칸. 아틀라스를 배경으로 잘라 쓴다 */
export const icon = style({
  width: 32,
  height: 32,
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 왼쪽 색 조각. 아이콘이 없는 목록에서 색이 갈래를 나른다 */
export const dot = style({
  width: 22,
  height: 22,
  borderRadius: 7,
  flex: '0 0 auto',
  background: 'var(--tint, rgba(255,255,255,0.3))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 3px rgba(0,0,0,0.55)',
})

globalStyle(`${rowOn} .${dot}`, {
  background: 'rgba(255,255,255,0.92)',
  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
})

/** 갈래 줄 — 가방 주머니, 도감 정렬 */
export const tabs = style({
  display: 'flex',
  gap: 7,
  padding: '0 42px 14px',
  flexWrap: 'wrap',
})

const tabBase = style({
  padding: '5px 16px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(16, 22, 38, 0.66)',
  transform: `skewX(-${String(SKEW)}deg)`,
})

export const tab = styleVariants({
  off: [tabBase, { opacity: 0.55 }],
  on: [tabBase, {
    background: 'linear-gradient(180deg, #f7e08a, #e2b34a)',
    borderColor: 'transparent',
    color: '#191203',
    fontWeight: 800,
    boxShadow: '0 5px 16px rgba(0,0,0,0.45)',
  }],
})

/** 갈래 이름도 반듯하게 세운다 */
globalStyle(`${tabBase} > span`, { display: 'inline-block', transform: `skewX(${String(SKEW)}deg)` })

/** 목록이 비었을 때 */
export const empty = style({
  padding: '18px 20px',
  fontSize: 15,
  opacity: 0.45,
})
