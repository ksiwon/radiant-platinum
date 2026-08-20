// 배틀 HUD (PLAN §2.5) — **3D 무대 위에 뜨는 판이다.**
//
// 배경을 칠하지 않는다. 무대(`scene/battle/BattleStage`)가 뒤에서 렌더되고 이
// 계층은 그 위에 얹히는 정보만 담당한다. 무대가 없는 경우(타이틀에서 배틀을
// 직접 연 개발용 경로)에만 `fallback`이 임시 배경을 깐다.
import { globalStyle, keyframes, style, styleVariants } from '@vanilla-extract/css'
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
  // 흰 하늘 위에서도 HP 판과 텍스트가 뜬다.
  //
  // ⚠️ **아래쪽 그늘이 내 포켓몬을 덮고 있었다.** 내 포켓몬은 화면 아래 왼쪽에
  // 서는데(BDSP 배치) 그늘이 화면 절반을 지나면서 짙어져서, 모부기가 42%까지
  // 눌린 채로 그려졌다. 대사창은 제 배경이 따로 있으므로 여기서 그만큼 깔 이유가
  // 없다 — 시작을 아래로 내리고 짙기를 줄인다
  background:
    'linear-gradient(180deg, rgba(6,10,18,0.30) 0%, rgba(6,10,18,0) 24%,' +
    ' rgba(6,10,18,0) 76%, rgba(6,10,18,0.22) 100%)',
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

/** 아래쪽 — 왼쪽에 배틀 로그, 오른쪽에 명령 */
export const console_ = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 380px',
  alignItems: 'end',
  gap: 24,
  padding: '0 34px 26px',
  minHeight: 168,
})

/**
 * 배틀 로그.
 *
 * **상자를 없앴다.** 원작 대화창은 화면 아래를 가로지르는 판이었지만, 그건 아래
 * 절반이 UI였던 2D 화면의 배치다 — 3D 무대 위에 그대로 얹으면 무대를 가린다.
 * 대신 글자만 띄우고 뒤에 **가장자리 없는** 그늘을 깔아 밝은 배경에서도 읽히게
 * 한다. 왼쪽 세로선 하나가 여기가 글이 나오는 자리라는 표시를 대신한다.
 */
export const log = style({
  position: 'relative',
  isolation: 'isolate',
  alignSelf: 'end',
  padding: '10px 30px 12px 18px',
  borderLeft: '3px solid rgba(255, 255, 255, 0.34)',
  cursor: 'pointer',
  // 상자가 아니라 **번짐**이다. 네 모서리가 없어야 판으로 안 읽힌다
  '::before': {
    content: '""',
    position: 'absolute',
    inset: '-18px -80px -22px -28px',
    zIndex: -1,
    background:
      'radial-gradient(58% 130% at 18% 55%, rgba(4,8,16,0.78) 0%,' +
      ' rgba(4,8,16,0.5) 46%, rgba(4,8,16,0) 100%)',
    pointerEvents: 'none',
  },
})

/** 지금 찍는 중인 글. 한 번에 한 문장만 있는다 — 원작의 박자다 */
export const logText = style({
  whiteSpace: 'pre-line',
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.55,
  letterSpacing: '0.01em',
  // 두 줄치를 비워 둔다. 문장이 짧아질 때마다 명령 칸이 위아래로 흔들리면 안 된다
  minHeight: '2.2em',
  // 판이 없으니 그늘이 글자를 붙잡는다. 두 겹인 이유는 흰 하늘 위에서도 떠야 해서다
  textShadow: '0 2px 4px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.75)',
})

const blink = keyframes({
  '0%, 45%': { opacity: 1, transform: 'translateY(0)' },
  '55%, 100%': { opacity: 0.2, transform: 'translateY(2px)' },
})

/** 다음을 기다리는 표시. 글 끝에 바로 붙는다 — 판이 없으니 붙일 모서리도 없다 */
export const nextArrow = style({
  marginLeft: 10,
  fontSize: 13,
  opacity: 0.85,
  animation: `${blink} 0.7s steps(1, end) infinite`,
})/** 아이템 아이콘 32×32. 아틀라스를 배경 위치로 잘라 쓴다 */
export const itemIcon = style({
  width: 28,
  height: 28,
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'auto',
})

/**
 * 명령 칸.
 *
 * 2×2 격자를 버리고 **세로로 쌓는다.** 격자는 네 칸이 서로 같은 무게라 어디부터
 * 읽어야 할지가 안 정해지는데, 목록은 위에서 아래로 한 방향이라 커서가 어디 있는지
 * 눈이 바로 찾는다.
 *
 * 왼쪽에 26px를 비워 두는 것은 커서 화살표 자리다 — 칸 **밖에** 서야 지금 고른
 * 것이 튀어나온 것으로 읽힌다. `overflow-y: auto`가 x축까지 잘라 버려서
 * 칸을 넘겨 그릴 수가 없다(가방 목록은 길어서 넘침 처리가 필요하다)
 */
export const side = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignSelf: 'end',
  minWidth: 0,
})

export const menu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingLeft: 26,
  // 기운 판이 오른쪽으로 4px쯤 삐져나온다. 넘침 처리가 그걸 자르지 않게 비워 둔다
  paddingRight: 8,
  maxHeight: '46vh',
  overflowY: 'auto',
  scrollbarWidth: 'thin',
})

/**
 * 기울기.
 *
 * 이 하나가 화면 전체의 인상을 정한다. 반듯한 사각형이면 어느 게임이든 될 수 있는
 * 모양이 되는데, 각이 지면 **움직이는 화면 위에 얹힌 판**으로 읽힌다
 */
const SKEW = 9

export const button = style({
  position: 'relative',
  appearance: 'none',
  display: 'block',
  width: '100%',
  minHeight: 50,
  padding: '8px 20px 8px 14px',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  // 기운 알약. 각과 둥근 끝이 같이 있어야 딱딱해 보이지 않는다
  borderRadius: 999,
  background: 'linear-gradient(180deg, rgba(32, 40, 64, 0.9), rgba(15, 21, 36, 0.94))',
  boxShadow: '0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.14)',
  backdropFilter: 'blur(4px)',
  color: vars.panel.text,
  font: 'inherit',
  fontSize: 15,
  fontWeight: 700,
  textAlign: 'left',
  cursor: 'pointer',
  flex: '0 0 auto',
  transform: `skewX(-${String(SKEW)}deg)`,
  transition:
    'transform 130ms cubic-bezier(.2,.85,.3,1), background 140ms linear,' +
    ' border-color 140ms linear, box-shadow 140ms linear',
  selectors: {
    '&:hover:enabled, &:focus-visible:enabled': {
      transform: `skewX(-${String(SKEW)}deg) translateX(-6px)`,
      outline: 'none',
    },
    '&:active:enabled': {
      transform: `skewX(-${String(SKEW)}deg) translateX(-6px) scale(0.985)`,
    },
    '&:disabled': { opacity: 0.32, cursor: 'default' },
  },
})

/** 판이 기울었으니 되돌린다 — **글자는 반듯하게** 선다 */
export const face = style({
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  transform: `skewX(${String(SKEW)}deg)`,
})

/**
 * 왼쪽 색 조각.
 *
 * 아이콘을 그리지 않는다 — 없는 그림을 지어내는 것보다 색 하나가 정직하고,
 * 색만으로도 손이 먼저 간다. 기술 칸에서는 이 색이 곧 타입 색이다
 */
export const dot = style({
  width: 24,
  height: 24,
  borderRadius: 8,
  flex: '0 0 auto',
  background: 'var(--tint, rgba(255,255,255,0.32))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 3px rgba(0,0,0,0.55)',
})

/** 이름 + 그 아래 작은 줄 */
export const labelCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
})

export const label = style({
  fontSize: 16,
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  textShadow: '0 1px 2px rgba(0,0,0,0.55)',
})

/**
 * 기술 타입·교체 레벨처럼 이름을 거드는 줄.
 *
 * ⚠️ **`opacity`가 아니라 글자색이다.** 투명도는 자식까지 곱해져서, 이 줄 안에
 * 들어오는 상성 표시(`matchLine`)의 색을 되돌릴 방법이 없어진다
 */
export const subLine = style({
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.04em',
  color: 'rgba(255, 255, 255, 0.75)',
})

/** 타입과 상성 사이의 가운뎃점 */
export const sep = style({ margin: '0 5px', color: 'rgba(255, 255, 255, 0.4)' })

/**
 * 「효과가 굉장함」 (PARITY §2.22).
 *
 * 상자를 따로 두지 않는다 — 타입 이름과 같은 줄에 이어 붙이고 색으로만 가른다.
 * 네 칸마다 알약이 하나씩 더 붙으면 기술 목록이 표가 된다
 */
export const matchLine = style({ fontWeight: 700 })

export const matchTone = styleVariants({
  super: { color: '#ffd166' },
  resisted: { color: '#8fb8d8' },
  immune: { color: '#ff8f8f' },
})

/** 오른쪽 끝의 PP. 큰 숫자 옆에 작은 분모 — 남은 값에 눈이 먼저 간다 */
export const pp = style({
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'baseline',
  gap: 1,
  fontFamily: vars.font.mono,
  fontStyle: 'italic',
  flex: '0 0 auto',
})

export const ppNow = style({ fontSize: 19, fontWeight: 800, lineHeight: 1 })
export const ppMax = style({ fontSize: 12, opacity: 0.7 })

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

/**
 * 지금 고른 칸.
 *
 * 색을 덧칠하는 게 아니라 **그 칸의 색으로 통째로 채운다.** 어두운 판이 줄지어
 * 있는 가운데 하나만 밝으면 눈이 찾아갈 곳을 고민하지 않는다. 왼쪽으로 한 걸음
 * 나오는 것까지가 한 벌이다 — 목록에서 뽑혀 나온 것으로 읽힌다.
 *
 * 마우스 hover와 키보드 커서는 **같은 표시**를 쓴다. 둘이 다르면 지금 눌리는
 * 칸이 어느 쪽인지 헷갈린다
 */
export const buttonOn = style({
  transform: `skewX(-${String(SKEW)}deg) translateX(-13px)`,
  borderColor: 'rgba(255, 255, 255, 0.9)',
  background:
    'linear-gradient(180deg, var(--tint, #4a6ea8) 0%,' +
    ' color-mix(in srgb, var(--tint, #4a6ea8) 70%, #05070d) 100%)',
  boxShadow: '0 10px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
  color: '#ffffff',
})

// 채운 칸 안에서는 색 조각이 배경색과 겹쳐 안 보인다. 흰색으로 바꿔 남겨 둔다.
// `selectors`가 아니라 `globalStyle`인 이유: vanilla-extract의 selectors는
// 자기 자신만 겨눌 수 있고 자손은 못 겨눈다
globalStyle(`${buttonOn} ${dot}`, {
  background: 'rgba(255,255,255,0.92)',
  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
})

/**
 * 커서 화살표.
 *
 * 칸 **바깥** 왼쪽에 선다. 안에 두면 글자를 밀어내서 고를 때마다 이름이 흔들린다.
 * 판이 기울어 있으니 화살표도 같이 되돌려 세운다
 */
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

/** 남은 PP가 적을 때. 바닥나기 전에 눈에 띄어야 한다 */
export const ppLow = style({ color: '#ffd166', opacity: 1 })
export const ppOut = style({ color: vars.hud.warn, opacity: 1 })

/** 한 단 들어간 메뉴의 "돌아가기". 명령 아래에 글자로만 둔다 */
/**
 * 「누구에게?」·「○○은(는) 무엇을 할까?」 한 줄 (PARITY §2.2).
 *
 * 더블은 자리마다 따로 묻는다. 이 줄이 없으면 같은 메뉴가 두 번 뜨는 것으로만
 * 보여서, 첫째에게 물었는지 둘째에게 물었는지를 화면에서 알 수 없다
 */
export const askWho = style({
  color: vars.panel.text,
  font: 'inherit',
  fontSize: 13,
  opacity: 0.85,
  padding: '2px 6px 6px',
  textShadow: '0 1px 3px rgba(0,0,0,0.85)',
  flex: '0 0 auto',
})

export const backButton = style({
  alignSelf: 'flex-end',
  appearance: 'none',
  border: 'none',
  background: 'none',
  color: vars.panel.text,
  font: 'inherit',
  fontSize: 13,
  opacity: 0.62,
  padding: '4px 6px',
  cursor: 'pointer',
  textShadow: '0 1px 3px rgba(0,0,0,0.85)',
  flex: '0 0 auto',
  selectors: {
    '&:hover': { opacity: 1 },
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
  marginTop: 2,
  fontSize: 11,
  letterSpacing: '0.02em',
  opacity: 0.5,
  textAlign: 'right',
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
})
