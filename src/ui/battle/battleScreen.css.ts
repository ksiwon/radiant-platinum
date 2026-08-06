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
    'linear-gradient(180deg, rgba(6,10,18,0.30) 0%, rgba(6,10,18,0) 24%,' +
    ' rgba(6,10,18,0) 56%, rgba(6,10,18,0.42) 100%)',
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

/**
 * 체력판.
 *
 * 원작 healthbox는 판이 **한쪽으로 비스듬하다.** 상대 것은 오른쪽 아래가,
 * 내 것은 왼쪽 아래가 잘려서 서로 화면 안쪽을 향한다. 그 각이 없으면
 * 그냥 둥근 상자가 되어서 어느 게임이든 될 수 있는 모양이 된다.
 */
export const card = style({
  ...glass,
  position: 'relative',
  minWidth: 268,
  padding: '8px 16px 10px',
  borderRadius: 10,
  // 비스듬한 모서리. 테두리가 clip에 잘리므로 안쪽에 선을 하나 더 둔다
  border: 'none',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
})

/** 잘린 자리에도 테두리가 보이게 하는 안쪽 선 */
const rim = {
  content: '""',
  position: 'absolute',
  inset: 0,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.18)',
  pointerEvents: 'none',
} as const

export const cardFoe = style({
  clipPath: 'polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%)',
  paddingRight: 30,
  '::after': { ...rim, clipPath: 'polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%)' },
})

export const cardMine = style({
  clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%)',
  paddingLeft: 30,
  '::after': { ...rim, clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%)' },
})

export const cardHead = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  marginBottom: 6,
})

export const monName = style({
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '0.01em',
  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
})

/** 성별 기호. 원작 체력판에도 이름 옆에 붙는다 */
export const genderMark = style({
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
})
export const male = style({ color: '#6db3f2' })
export const female = style({ color: '#f28ab2' })

export const monLevel = style({
  marginLeft: 'auto',
  fontSize: 13,
  fontFamily: vars.font.mono,
  opacity: 0.8,
})

/** `HP` 딱지 + 게이지가 한 줄이다 */
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
  textShadow: '0 1px 0 rgba(0,0,0,0.7)',
})

/** HP 바. 원작처럼 얇고 길다 — 두꺼우면 게이지가 아니라 진행 표시처럼 보인다 */
export const barTrack = style({
  position: 'relative',
  flex: 1,
  height: 8,
  borderRadius: 5,
  background: 'rgba(0, 0, 0, 0.62)',
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.08)',
  overflow: 'hidden',
})

export const barFill = style({
  height: '100%',
  borderRadius: 5,
  // 위쪽에 밝은 선을 하나 넣어 게이지가 납작한 띠가 아니라 **덩어리**로 보이게 한다
  backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0 40%, rgba(0,0,0,0.12) 100%)',
  backgroundColor: '#5fd35f',
  // 줄어드는 **시간**은 재생기가 정한다. 원작 게이지는 프레임당 한 칸씩 움직여서
  // 많이 맞을수록 오래 걸린다 (`playback.drainFrames`). 여기서는 기울기만 정하고
  // 길이는 `--drain`으로 받는다 — 고정 길이로 두면 큰 데미지가 순식간에 지나간다
  transition: 'width var(--drain, 420ms) linear, background-color 200ms linear',
})

/**
 * 색 셋. **경계는 `engine/battle/healthbar`가 정한다** — 비율이 아니라
 * 픽셀 수로 가른다(원작 `App_BarColor`)
 */
export const barGreen = style({ backgroundColor: '#5fd35f' })
export const barYellow = style({ backgroundColor: '#f5c542' })
export const barRed = style({ backgroundColor: '#ef5350' })

export const hpText = style({
  marginTop: 4,
  fontSize: 12,
  fontFamily: vars.font.mono,
  textAlign: 'right',
  letterSpacing: '0.02em',
  opacity: 0.9,
})

/** 남은 체력 숫자만 진하게 — 눈이 먼저 가야 하는 쪽이다 */
export const hpNow = style({ fontWeight: 700, opacity: 1 })

/**
 * 이미 잡아 본 종이면 뜨는 공 표시.
 *
 * 원작 `HealthBox_DrawCaughtIcon`이 상대 체력판에만 그린다 — 도감에 등록된
 * 종인지 한눈에 알려 주는 자리다
 */
export const caughtMark = style({
  width: 11,
  height: 11,
  borderRadius: '50%',
  alignSelf: 'center',
  // 몬스터볼. 위 빨강 · 아래 흰색 · 가운데 검은 띠
  background:
    'linear-gradient(180deg, #e8554e 0 42%, #1b1f27 42% 58%, #f4f6fa 58% 100%)',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.5)',
  flex: '0 0 auto',
})

/** 상태 이상 딱지. 원작도 체력판 안에 색 딱지로 붙인다 */
export const statusTag = style({
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.06em',
  color: '#fff',
  textShadow: '0 1px 1px rgba(0,0,0,0.45)',
  background: '#6b7280',
})

/** 상태마다 색이 다르다 — 글자를 안 읽어도 무엇에 걸렸는지 보인다 */
export const statusColor: Record<string, string> = {
  psn: '#a25bc4', tox: '#8b3fae', brn: '#e8763a',
  par: '#d8b12a', slp: '#7b8794', frz: '#4aa8d8',
}

/** 아래쪽 텍스트 + 명령 */
export const console_ = style({
  display: 'grid',
  // 명령 칸에 자리를 더 준다. 340px면 "도망친다"가 한 줄에 겨우 들어가서
  // 칸이 글자에 끼인 것처럼 보인다
  gridTemplateColumns: 'minmax(0, 1fr) 384px',
  gap: 14,
  padding: '0 20px 20px',
  minHeight: 150,
})

export const textBox = style({
  ...glass,
  position: 'relative',
  padding: '16px 22px',
  borderRadius: 12,
  // 원작 대화창은 안쪽에 선이 한 겹 더 있다. 그 두 겹이 "창"으로 읽히게 한다
  '::before': {
    content: '""',
    position: 'absolute',
    inset: 4,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.09)',
    pointerEvents: 'none',
  },
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
  fontSize: 18,
  lineHeight: 1.6,
  // 두 줄치를 비워 둔다. 세 줄이면 짧은 문장일 때 위가 뻥 뚫려 보인다
  minHeight: '2.4em',
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
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

/**
 * 키보드 커서가 올라간 칸.
 *
 * 마우스 hover와 겹쳐도 되게 테두리로 표시하고, 왼쪽 색 띠를 넓혀서 **어느 칸에
 * 있는지가 색으로도** 보이게 한다
 */
export const buttonOn = style({
  borderColor: 'rgba(255,255,255,0.72)',
  boxShadow: '0 8px 26px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.3)',
  background:
    'linear-gradient(180deg, rgba(38, 48, 70, 0.92), rgba(24, 32, 48, 0.94))',
  selectors: {
    '&::before': { width: 9 },
  },
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
  gridAutoRows: 'minmax(52px, auto)',
  gap: 9,
  alignContent: 'end',
})

export const button = style({
  ...glass,
  position: 'relative',
  appearance: 'none',
  borderRadius: 10,
  color: vars.panel.text,
  font: 'inherit',
  fontSize: 15,
  fontWeight: 700,
  padding: '7px 12px 7px 18px',
  cursor: 'pointer',
  textAlign: 'left',
  display: 'grid',
  alignContent: 'center',
  gap: 3,
  overflow: 'hidden',
  transition: 'border-color 120ms linear, transform 80ms ease-out, box-shadow 120ms linear',
  selectors: {
    // 왼쪽 색 띠. 칸마다 `--tint`로 다른 색을 받는다
    '&::before': {
      content: '""',
      position: 'absolute',
      left: 0, top: 0, bottom: 0,
      width: 5,
      background: 'var(--tint, transparent)',
    },
    '&:hover:enabled, &:focus-visible:enabled': {
      borderColor: 'rgba(255,255,255,0.5)',
      boxShadow: '0 8px 26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)',
      outline: 'none',
    },
    '&:active:enabled': { transform: 'translateY(1px)' },
    '&:disabled': { opacity: 0.35, cursor: 'default' },
  },
})

/**
 * 명령 넷의 색.
 *
 * 원작 배틀 메뉴는 칸마다 색이 다르다 — 싸운다는 붉고, 가방은 노랗고, 포켓몬은
 * 푸르고, 도망친다는 하늘색이다. 글자를 안 읽어도 손이 먼저 간다
 */
export const TINT = {
  fight: '#e2574c',
  bag: '#e0a83a',
  party: '#4fa96b',
  run: '#4a8fd0',
} as const

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

/**
 * 명령 칸 아래 조작 안내.
 *
 * 키보드로 고를 수 있다는 것을 화면이 말해 주지 않으면 마우스로만 쓰게 된다 —
 * 원작에는 마우스가 없었으니 키가 주인공이어야 한다
 */
export const keyHint = style({
  gridColumn: '1 / -1',
  marginTop: 2,
  fontSize: 11,
  letterSpacing: '0.02em',
  opacity: 0.5,
  textAlign: 'right',
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
})
