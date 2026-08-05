// 배틀 HUD (PLAN §2.5) — **3D 무대 위에 뜨는 판이다.**
//
// 배경을 칠하지 않는다. 무대(`scene/battle/BattleStage`)가 뒤에서 렌더되고 이
// 계층은 그 위에 얹히는 정보만 담당한다. 무대가 없는 경우(타이틀에서 배틀을
// 직접 연 개발용 경로)에만 `fallback`이 임시 배경을 깐다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 떠 있는 판의 공통 재질. 무대가 비치되 글씨는 읽혀야 한다 */
const glass = {
  background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.88), rgba(12, 17, 28, 0.92))',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  boxShadow: '0 6px 22px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(3px)',
} as const

export const screen = style({
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  display: 'grid',
  gridTemplateRows: '1fr auto',
  fontFamily: vars.font.ui,
  color: vars.panel.text,
  userSelect: 'none',
  // 무대가 보여야 하므로 배경이 없다. 대신 위아래에만 옅은 그늘을 둬서
  // 흰 하늘 위에서도 HP 판과 텍스트가 뜬다
  background:
    'linear-gradient(180deg, rgba(6,10,18,0.34) 0%, rgba(6,10,18,0) 26%,' +
    ' rgba(6,10,18,0) 52%, rgba(6,10,18,0.5) 100%)',
})

/** 3D 무대가 없을 때만 깔리는 임시 배경 */
export const fallback = style({
  background: 'linear-gradient(180deg, #16233a 0%, #24354f 55%, #1a2436 100%)',
})

/** 양쪽 포켓몬이 서는 판 — 이제 실제 위치는 3D가 잡고, 여기는 HP 판만 놓는다 */
export const field = style({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: 'auto 1fr',
  // 왼쪽 위는 성능 오버레이(66px)가 쓴다. 트레이너 이름 줄까지 그 밑으로 내린다
  padding: '84px 32px 4px',
  gap: 12,
  pointerEvents: 'none',
})

export const foeSlot = style({ gridColumn: 1, gridRow: 1, justifySelf: 'start' })
export const mineSlot = style({ gridColumn: 2, gridRow: 2, justifySelf: 'end', alignSelf: 'end' })

/** 상대 트레이너 이름. 야생전에는 안 뜬다 */
export const foeTrainer = style({
  marginBottom: 6,
  fontSize: 13,
  letterSpacing: '0.02em',
  opacity: 0.9,
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
})

export const card = style({
  ...glass,
  minWidth: 270,
  padding: '9px 14px 11px',
  borderRadius: 12,
})

export const cardHead = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 7,
})

export const monName = style({ fontSize: 16, fontWeight: 600, letterSpacing: '0.01em' })
export const monLevel = style({ fontSize: 13, opacity: 0.75, fontFamily: vars.font.mono })

/** HP 바. 원작처럼 얇고 길다 — 두꺼우면 게이지가 아니라 진행 표시처럼 보인다 */
export const barTrack = style({
  position: 'relative',
  height: 7,
  borderRadius: 4,
  background: 'rgba(0, 0, 0, 0.55)',
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
  overflow: 'hidden',
})

export const barFill = style({
  height: '100%',
  borderRadius: 4,
  background: `linear-gradient(180deg, color-mix(in srgb, ${vars.hud.accent} 78%, white), ${vars.hud.accent})`,
  // 줄어드는 **시간**은 재생기가 정한다. 원작 게이지는 프레임당 한 칸씩 움직여서
  // 많이 맞을수록 오래 걸린다 (`playback.drainFrames`). 여기서는 기울기만 정하고
  // 길이는 `--drain`으로 받는다 — 고정 길이로 두면 큰 데미지가 순식간에 지나간다
  transition: 'width var(--drain, 420ms) linear, background 200ms linear',
})

/** HP가 낮을 때. 원작처럼 색으로 먼저 알린다 */
export const barLow = style({
  background: 'linear-gradient(180deg, #ffe08a, #f5bf3a)',
})
export const barCritical = style({
  background: `linear-gradient(180deg, color-mix(in srgb, ${vars.hud.warn} 70%, white), ${vars.hud.warn})`,
})

export const hpText = style({
  marginTop: 5,
  fontSize: 12,
  fontFamily: vars.font.mono,
  opacity: 0.85,
  textAlign: 'right',
})

export const statusTag = style({
  marginLeft: 6,
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  background: 'rgba(255, 255, 255, 0.18)',
  border: '1px solid rgba(255,255,255,0.2)',
  verticalAlign: '2px',
})

/** 아래쪽 텍스트 + 명령 */
export const console_ = style({
  display: 'grid',
  gridTemplateColumns: '1fr 340px',
  gap: 12,
  padding: '0 16px 16px',
  minHeight: 172,
})

export const textBox = style({
  ...glass,
  padding: '14px 20px',
  borderRadius: 12,
  fontSize: 15,
  lineHeight: 1.7,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  gap: 2,
  overflow: 'hidden',
})

// 경험치·레벨업처럼 한 사건이 여러 줄인 경우가 있다. 줄바꿈을 살린다
export const textLine = style({ opacity: 0.45, whiteSpace: 'pre-line' })
export const textLast = style({ opacity: 1, whiteSpace: 'pre-line' })

/** 지금 찍는 중인 글. 한 번에 한 문장만 있는다 — 원작의 박자다 */
export const textNow = style({
  whiteSpace: 'pre-line',
  fontSize: 17,
  lineHeight: 1.65,
  minHeight: '3.3em',
})

const blink = keyframes({
  '0%, 45%': { opacity: 1, transform: 'translateY(0)' },
  '55%, 100%': { opacity: 0.2, transform: 'translateY(2px)' },
})

/** 다음을 기다리는 표시 */
export const nextArrow = style({
  alignSelf: 'flex-end',
  fontSize: 13,
  opacity: 0.85,
  animation: `${blink} 0.7s steps(1, end) infinite`,
})

/** 키보드 커서가 올라간 칸. 마우스 hover와 겹쳐도 되게 테두리로만 표시한다 */
export const buttonOn = style({
  borderColor: 'rgba(255,255,255,0.72)',
  boxShadow: '0 8px 26px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.3)',
})

/** 배틀 가방의 갈래 줄 */
export const bagTabs = style({
  gridColumn: '1 / -1',
  display: 'flex',
  gap: 6,
  fontSize: 12,
})

export const bagTab = style({
  padding: '3px 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.18)',
  opacity: 0.55,
})

export const bagTabOn = style([bagTab, {
  opacity: 1,
  background: 'rgba(255,255,255,0.9)',
  color: '#111827',
  fontWeight: 700,
  borderColor: 'transparent',
}])

/** 아이템 아이콘 32×32. 아틀라스를 배경 위치로 잘라 쓴다 */
export const itemIcon = style({
  width: 28,
  height: 28,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'auto',
})

export const itemRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
})

export const menu = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridAutoRows: 'minmax(46px, auto)',
  gap: 8,
  alignContent: 'end',
})

export const button = style({
  ...glass,
  appearance: 'none',
  borderRadius: 10,
  color: vars.panel.text,
  font: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  padding: '7px 12px',
  cursor: 'pointer',
  textAlign: 'left',
  display: 'grid',
  alignContent: 'center',
  gap: 3,
  transition: 'border-color 120ms linear, transform 80ms ease-out, box-shadow 120ms linear',
  selectors: {
    '&:hover:enabled, &:focus-visible:enabled': {
      borderColor: 'rgba(255,255,255,0.5)',
      boxShadow: '0 8px 26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)',
      outline: 'none',
    },
    '&:active:enabled': { transform: 'translateY(1px)' },
    '&:disabled': { opacity: 0.35, cursor: 'default' },
  },
})

export const buttonWide = style({ gridColumn: '1 / -1' })
export const buttonSub = style({ fontSize: 11, opacity: 0.7, fontFamily: vars.font.mono, fontWeight: 400 })

/** 기술 칸 아랫줄 — 왼쪽에 타입, 오른쪽에 PP. 원작도 이 두 가지를 보여준다 */
export const moveFoot = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  fontFamily: vars.font.mono,
  fontWeight: 400,
})

/**
 * 타입 배지. 색은 인라인으로 온다 — 18색을 클래스로 만들면 쓰지도 않는 CSS가
 * 초기 청크에 실린다
 */
export const typeTag = style({
  padding: '1px 7px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.03em',
  color: '#fff',
  textShadow: '0 1px 2px rgba(0,0,0,0.45)',
})

/** 남은 PP가 적을 때. 바닥나기 전에 눈에 띄어야 한다 */
export const ppLow = style({ color: '#ffd166', opacity: 1 })
export const ppOut = style({ color: vars.hud.warn, opacity: 1 })

/** 한 단 들어간 메뉴의 "돌아가기". 명령 격자 맨 아래를 차지한다 */
export const backButton = style({
  gridColumn: '1 / -1',
  appearance: 'none',
  border: '1px solid transparent',
  borderRadius: 8,
  background: 'transparent',
  color: vars.panel.text,
  font: 'inherit',
  fontSize: 13,
  opacity: 0.6,
  padding: '4px 10px',
  cursor: 'pointer',
  textAlign: 'left',
  textShadow: '0 1px 3px rgba(0,0,0,0.7)',
  selectors: {
    '&:hover': { opacity: 1, borderColor: 'rgba(255,255,255,0.22)' },
  },
})

globalStyle(`${button} > *`, { pointerEvents: 'none' })

const pulse = keyframes({
  '0%, 100%': { opacity: 0.35 },
  '50%': { opacity: 1 },
})

/**
 * 배틀에 들어가는 순간.
 *
 * 이게 없으면 걷다가 **한 프레임 만에** 다른 장소에 서 있게 된다 — 상태가 바뀐 것이지
 * 장면이 바뀐 것으로 안 읽힌다. 원작이 조우에 연출을 넣는 이유가 그거다.
 * 롬의 조우 이펙트(`encounter_grass_a.spa` 등 12종)는 아직 안 뽑았으므로 그 자리를
 * 잡아 두는 검은 막이다
 */
const wipeOut = keyframes({
  '0%': { opacity: 1 },
  '38%': { opacity: 1 },
  '100%': { opacity: 0 },
})

export const wipe = style({
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  pointerEvents: 'none',
  background: '#070b12',
  animation: `${wipeOut} 560ms ease-out forwards`,
})

export const waiting = style({
  padding: 12,
  fontSize: 13,
  animation: `${pulse} 1.1s ease-in-out infinite`,
})
