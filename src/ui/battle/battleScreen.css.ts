// 배틀 HUD (PLAN §2.5) — **3D 무대 위에 뜨는 판이다.**
//
// 배경을 칠하지 않는다. 무대(`scene/battle/BattleStage`)가 뒤에서 렌더되고 이 계층은 그 위에 얹히는
// 정보만 담당한다. 무대가 없는 경우(타이틀에서 배틀을 직접 연 개발용 경로)에만 `fallback`이 임시
// 배경을 깐다.
//
// 구획은 `HUD`(`theme/scale`)가 쥔다. 명령 구역은 **380×264로 고정**이고(`--battle-cmd-h`) 내 판은 그
// 위 12px에 박힌다 — 단이 바뀌어도 판이 안 움직인다. 명령 칸의 스타일은 `command.css`다.
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, HUD, RADIUS, TEXT, TIME } from '../theme/scale'
import { BAR_FILL, BAR_TRACK, STATUS_TAG, WINDOW, WINDOW_SMALL } from '../theme/window.css'

/** 명령 구역의 폭 — `command.css`의 `side`와 글창이 같은 값을 본다 */
export const CMD_WIDTH = 380

/** 키 안내 창 위의 틈 */
const TRAY_GAP = 8
/** 판 아래와 명령 구역 사이 */
const PLATE_GAP = 12
/** 아래 끝에서 명령 구역 아래 끝까지 — 바깥 여백 + 키 안내 창 + 틈 */
export const CMD_BOTTOM = HUD.bottom + HUD.tray + TRAY_GAP
/** 개발 서버의 계기판이 왼쪽 위를 쓴다. 배포본에는 이 변수가 없어서 0이다 (`ui/hud/hudStack`) */
const DEV_TOP = 'var(--hud-left-top, 0px)'

export const screen = style({
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  fontFamily: vars.font.ui,
  color: vars.ink.normal,
  userSelect: 'none',
  vars: { '--battle-cmd-h': `${String(HUD.cmdHeight)}px` },
  // 위 그늘은 없다 — 판이 불투명하고 맨 글자가 없어졌다. 아래 그늘만 남긴다: 명령 구역의 「돌아간다」 띠가
  // 무대 위에 바로 얹힌다.
  //
  // ⚠️ **그늘이 내 포켓몬을 덮으면 안 된다.** 내 포켓몬은 화면 아래 왼쪽에 서므로 시작을 아래로 내리고
  // 짙기를 줄인다
  background: `linear-gradient(180deg, transparent 76%, ${vars.scrim.over} 100%)`,
})

/** 3D 무대가 없을 때만 깔리는 임시 배경 */
export const fallback = style({
  background: vars.scrim.deep,
})

/** 판이 서는 판 — 자리는 아래 두 묶음이 절대 닻으로 쥔다. 눌림은 안 받는다 */
export const field = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
})

/** 상대 묶음 — 왼쪽 위. 공 줄 탭 → 판 → (더블) 둘째 판 순으로 아래로 쌓는다 */
export const foeSlot = style({
  position: 'absolute',
  left: HUD.edge,
  top: `calc(${String(HUD.bottom)}px + ${DEV_TOP})`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: GAP.tight,
})

/**
 * 내 묶음 — 오른쪽. **아래 끝이 명령 구역 위 12px에 박힌다.** 아래에서 위로 자라므로 명령 구역의 단이
 * 바뀌어도 판이 안 움직인다
 */
export const mineSlot = style({
  position: 'absolute',
  right: HUD.edge,
  bottom: CMD_BOTTOM + HUD.cmdHeight + PLATE_GAP,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: GAP.tight,
})

/** 공 줄 탭과 판 사이 — 탭은 판의 바깥 끝에서 12px 안쪽에 선다 */
export const trayInset = style({ marginLeft: GAP.base })
export const trayInsetMine = style({ marginRight: GAP.base })

/**
 * 공 줄 탭 (PARITY §2.2b · `PartyGaugeData_New`) — 작은 창 한 장이다. 이름과 공 여섯이 이 안에 든다.
 *
 * 한때 이름과 공이 **무대 위 맨 글자**였다 — 흰 하늘 · 모래 위에서 안 읽혔다. 창 안에 두면 무대가
 * 어디든 읽힌다
 */
export const tray = style({
  ...WINDOW_SMALL,
  boxSizing: 'border-box',
  height: HUD.tray,
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  padding: `0 ${GAP.base}px`,
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const trayName = style({
  maxWidth: 150,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const trayBalls = style({ display: 'flex', alignItems: 'center', gap: GAP.tight })

/** 공 하나. 원작 `party_gauge`의 넷 — 멀쩡함 · 상태 이상 · 기절 · 빈 칸. **색이 아니라 모양으로 갈린다** */
const BALL = 14
const ballBase = {
  position: 'relative',
  boxSizing: 'border-box',
  flex: '0 0 auto',
  width: BALL,
  height: BALL,
  // 몬스터볼이라 실제로 둥글다 — `RADIUS.round`가 그 자리다
  borderRadius: RADIUS.round,
  border: `1px solid ${vars.bar.edge}`,
} as const
const ballFace = (top: string, band: string, bottom: string): string =>
  `linear-gradient(180deg, ${top} 0 40%, ${band} 40% 60%, ${bottom} 60% 100%)`
export const gaugeBall = styleVariants({
  alive: { ...ballBase, background: ballFace(vars.ball.top, vars.ball.band, vars.ball.bottom) },
  // 몬스터볼 + 귀퉁이의 상태 색 점. 점 색(`--body`)은 쓰는 쪽이 `STATUS_VARS`로 준다
  status: {
    ...ballBase,
    background: ballFace(vars.ball.top, vars.ball.band, vars.ball.bottom),
    '::after': {
      content: '""',
      position: 'absolute',
      right: -3,
      bottom: -3,
      width: 8,
      height: 8,
      borderRadius: RADIUS.round,
      background: 'var(--body)',
      border: `1px solid ${vars.bar.edge}`,
      boxSizing: 'border-box',
    },
  },
  // 위아래가 같은 회색 공
  fainted: { ...ballBase, background: ballFace(vars.hp.emptyLit, vars.bar.edge, vars.hp.empty) },
  // 점선 원, 안은 비운다
  empty: {
    ...ballBase,
    border: `1px dashed ${vars.ink.faint}`,
    background: 'transparent',
  },
})

// ── 체력판 ─────────────────────────────────────────────────────────────────────────────────
//
// 원작 healthbox는 판이 **한쪽으로 비스듬하다.** 상대 것은 오른쪽 아래가, 내 것은 왼쪽 위가 잘려서
// 서로 화면 안쪽을 향한다.
//
// ⚠️ **테두리도 그 사다리꼴을 따라 돈다** (DECISIONS 사용자 지적 ⑤). 네모 테두리를 사다리꼴로 잘라
// 비스듬한 변의 테두리가 끊기던 것을 **두 겹 `clip-path`**로 바꿨다 — 바깥 판은 테두리 색으로 사다리꼴
// 전체를 칠하고, 안쪽 판(`::before`)은 같은 사다리꼴을 안으로 `EDGE.window`만큼 줄여 몸통을 칠한다.
// 비스듬한 변은 바깥 변에서 수직으로 3px 안쪽의 평행선이다 — 두 겹의 사이가 곧 테두리다

/** 비스듬한 변이 깎는 폭 */
const CUT = 18
/** 테두리 굵기(px). 안쪽 판의 `inset`이 이것이다 */
const RIM = EDGE.window
/**
 * 비스듬한 변을 안으로 RIM만큼 민 값(가로). 변의 기울기가 `CUT / 높이`라 수직 거리 RIM은 가로로
 * RIM × √(1 + (CUT/높이)²)이고, 판 높이 66~140에서 1.00~1.04배라 한 값으로 둔다
 */
const RIM_X = 3.1
/** 안쪽 판(`inset: RIM`) 기준으로 옮긴 변의 어긋남 — 위쪽 끝과 아래쪽 끝 */
const IN_TOP = RIM_X - RIM + (CUT * RIM) / 100
const IN_BOT = CUT + RIM_X - RIM - (CUT * RIM) / 100

/** 판 몸통의 색 — 줄무늬 없이 **판 색 그러데이션**이다 */
const PLATE_BODY = `linear-gradient(165deg, ${vars.window.faceTop} 0%, ${vars.window.faceMid} 55%,`
  + ` ${vars.window.faceBottom} 100%)`

/**
 * 판 하나의 바깥 판. 테두리 색(`--rim`)으로 사다리꼴 전체를 칠하고, 몸통은 `::before`가 칠한다.
 * 안 내용은 `isolation`으로 한 층 위에 선다
 */
export const card = style({
  position: 'relative',
  isolation: 'isolate',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 4,
  minHeight: 66,
  padding: `${GAP.small + RIM}px ${GAP.wide + RIM}px`,
  background: `var(--rim, ${vars.window.edge})`,
  color: vars.ink.normal,
  '::before': {
    content: '""',
    position: 'absolute',
    inset: RIM,
    zIndex: -1,
    background: PLATE_BODY,
    backgroundColor: vars.window.faceMid,
  },
})

export const cardFoe = style({
  width: HUD.plateFoe,
  paddingRight: GAP.wide + CUT,
  clipPath: `polygon(0 0, 100% 0, calc(100% - ${String(CUT)}px) 100%, 0 100%)`,
  selectors: {
    '&::before': {
      clipPath: `polygon(0 0, calc(100% - ${String(IN_TOP)}px) 0,`
        + ` calc(100% - ${String(IN_BOT)}px) 100%, 0 100%)`,
    },
  },
})

export const cardMine = style({
  width: HUD.plateMine,
  paddingLeft: GAP.wide + CUT,
  clipPath: `polygon(${String(CUT)}px 0, 100% 0, 100% 100%, 0 100%)`,
  selectors: {
    '&::before': {
      clipPath: `polygon(${String(IN_BOT)}px 0, 100% 0, 100% 100%, ${String(IN_TOP)}px 100%)`,
    },
  },
})

/** 내 판이 단식이면 한 줄이 더 서서 높다 */
export const cardTall = style({ minHeight: 106 })
/** 더블의 내 판은 낮고 조금 좁다 */
export const cardDouble = style({ width: HUD.plateDouble, minHeight: 66 })

/**
 * 판 뿌리를 한 겹 감싼다. 판은 `clip-path`로 잘려서 **그 밖에 서는 것**(겨눈 삼각)이 못 서므로 이 겹이 그 자리를 준다.
 * `useSlide`가 이 요소의 `transform`을 쓴다 — 흔들림은 `translate` 속성이라 서로 안 밟는다
 */
export const plateWrap = style({
  position: 'relative',
  pointerEvents: 'none',
})

/** 더블 첫 칸은 안쪽으로 12px — 원작이 첫 칸을 6px 안쪽에 둔다 */
export const inwardFoe = style({ marginLeft: HUD.inward })
export const inwardMine = style({ marginRight: HUD.inward })

const shake = keyframes({
  '0%, 100%': { translate: '0 -2px' },
  '50%': { translate: '0 2px' },
})

/**
 * 더블에서 **지금 명령을 묻는** 내 판 — 테두리가 금이 되고 원작처럼 위아래로 흔들린다
 * (`Healthbox_StartBobAnimation` · 18프레임 한 바퀴 = 0.3초). 안 묻는 판은 그대로 둔다
 * (한동안 `opacity: 0.55`로 흐렸다 — 밝은 창이 무대 위에서 탁해졌다)
 */
export const asking = style({
  vars: { '--rim': vars.pick.edge },
  animation: `${shake} 0.3s linear infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 더블에서 **겨눠지는** 상대 판 — 테두리가 금이고 왼쪽에 삼각이 선다 */
export const aimed = style({ vars: { '--rim': vars.pick.edge } })

export const aimCaret = style({
  position: 'absolute',
  left: -17,
  top: '50%',
  width: 0,
  height: 0,
  borderLeft: `11px solid ${vars.pick.edge}`,
  borderTop: '8px solid transparent',
  borderBottom: '8px solid transparent',
  transform: 'translateY(-50%)',
})

/** 사파리 볼 판 — 내 판 자리에 선다. `cardMine`이라는 이름을 쓰지 않는다(하네스가 그 이름으로 HP 판을 찾는다) */
export const safariPlate = style([card, {
  width: HUD.plateFoe,
  paddingLeft: GAP.wide + CUT,
  clipPath: `polygon(${String(CUT)}px 0, 100% 0, 100% 100%, 0 100%)`,
  selectors: {
    '&::before': {
      clipPath: `polygon(${String(IN_BOT)}px 0, 100% 0, 100% 100%, ${String(IN_TOP)}px 100%)`,
    },
  },
}])
export const safariLabel = style({ fontSize: TEXT.small, fontWeight: 700, color: vars.ink.dim })
export const safariCount = style({
  fontSize: TEXT.title,
  fontWeight: 800,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})

/** 이름 · 성별 · 도감 공 · 오른쪽 끝 Lv */
export const cardHead = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  height: 24,
})

export const monName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: TEXT.list,
  fontWeight: 800,
  color: vars.ink.strong,
})

/** 성별 기호. Galmuri11이다 — Pretendard 서브셋에 ♂♀가 없다 */
export const genderMark = style({
  flex: '0 0 auto',
  fontFamily: vars.font.pixel,
  fontSize: TEXT.base,
  fontWeight: 700,
  lineHeight: 1,
})
export const male = style({ color: vars.state.male })
export const female = style({ color: vars.state.female })

/** 「Lv」는 작고 수는 크다 — 얼마나 센 놈인가는 이름 다음으로 큰 정보다 */
export const monLevel = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 2,
  fontSize: TEXT.list,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.strong,
})
export const monLevelTag = style({ fontSize: TEXT.tiny, fontWeight: 700, color: vars.ink.dim })

/** 홈(40px: 「HP」나 상태 딱지) + 막대가 한 줄이다. 막대 왼쪽 끝이 EXP 줄과 맞는다 */
export const barRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
})

const HOME = 40
/** 원작 체력판의 `HP` 글자. 상태 딱지가 있으면 그 자리를 딱지가 대신한다 */
export const hpTag = style({
  flex: `0 0 ${String(HOME)}px`,
  fontSize: TEXT.tiny,
  fontWeight: 800,
  fontStyle: 'italic',
  color: vars.ink.dim,
})

/** 상태 딱지가 홈을 대신한다 (`healthbox.c:703-723`) */
export const hpHome = style({
  flex: `0 0 ${String(HOME)}px`,
  display: 'flex',
})

/** HP 바. 원작처럼 얇고 길다 */
export const barTrack = style({
  position: 'relative',
  flex: 1,
  height: 12,
  ...BAR_TRACK,
})
export const barTrackTall = style({ height: 14 })

/**
 * 채운 쪽.
 *
 * 색(`--lit`·`--body`)은 여기서 안 정한다 — **게이지가 지금 보이는 픽셀 수**로 훅이 프레임마다 고른다
 * (`hpDrain`의 `shownColor` · 원작 `App_BarColor`). 첫 그림 전의 기본은 초록이다
 */
export const barFill = style({
  ...BAR_FILL,
  vars: { '--lit': vars.hp.greenLit, '--body': vars.hp.green },
  // ⚠️ **폭은 전환하지 않는다.** 줄어드는 시간은 재생기가 정하고 그 시간을 미는 것은 공통 연출 시계다
  // (`ui/battle/hpDrain`). CSS 전환은 벽시계라 재생기가 서 있는 동안 게이지만 마저 줄어드는 자리가 여기였다.
  // 색은 그대로 전환한다 — 초록→노랑이 한 프레임에 튀면 눈에 거슬린다
  transition: 'background-color 200ms linear',
})

/** 경험치 줄 — 내 단식 판에만 있다. 홈에 「EXP」, 막대는 HP 막대와 왼쪽 끝이 맞는다 */
export const expRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
})

export const expTag = style({
  flex: `0 0 ${String(HOME)}px`,
  fontSize: TEXT.tiny,
  fontWeight: 800,
  fontStyle: 'italic',
  color: vars.ink.dim,
})

export const expTrack = style({
  position: 'relative',
  flex: 1,
  height: 8,
  ...BAR_TRACK,
  borderWidth: 1,
})

export const expFill = style({
  ...BAR_FILL,
  vars: { '--lit': vars.bar.expLit, '--body': vars.bar.exp },
})

/** 내 단식 판의 숫자 줄 — 오른쪽 정렬. 현재가 주인공이다 */
export const hpText = style({
  textAlign: 'right',
  fontSize: TEXT.small,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.dim,
})
/** 더블 판은 숫자를 막대 오른쪽 칸에 붙인다 */
export const hpTextInline = style({
  flex: '0 0 62px',
  fontSize: TEXT.tiny + 1,
  whiteSpace: 'nowrap',
})

/** 남은 체력 숫자만 진하게 — 눈이 먼저 가야 하는 쪽이다 */
export const hpNow = style({ fontSize: TEXT.list, fontWeight: 800, color: vars.ink.strong })
export const hpNowInline = style({ fontSize: TEXT.tiny + 1 })

/** 능력 변화 · 혼란 줄. 있을 때만 선다 */
export const changeRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: GAP.small,
  rowGap: 2,
  paddingTop: GAP.tight,
  borderTop: `1px solid ${vars.window.rule}`,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.ink.normal,
})
export const changeUp = style({ color: vars.state.good })
export const changeDown = style({ color: vars.state.bad })
export const changeItem = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontVariantNumeric: 'tabular-nums',
})
/** ▲▼는 글꼴에 없어서 CSS 세모다 */
const triBase = { width: 0, height: 0, borderStyle: 'solid', borderColor: 'transparent' } as const
export const triUp = style({ ...triBase, borderWidth: '0 4px 6px', borderBottomColor: 'currentColor' })
export const triDown = style({ ...triBase, borderWidth: '6px 4px 0', borderTopColor: 'currentColor' })

/**
 * 이미 잡아 본 종이면 뜨는 공 표시.
 *
 * 원작 `HealthBox_DrawCaughtIcon`이 **야생 상대 판에만** 그린다 (`healthbox.c:664`) — 트레이너전에는 없다
 */
export const caughtMark = style({
  width: 12,
  height: 12,
  borderRadius: RADIUS.round,
  alignSelf: 'center',
  // 몬스터볼. 위 빨강 · 아래 흰색 · 가운데 검은 띠
  background: `linear-gradient(180deg, ${vars.ball.top} 0 42%,`
    + ` ${vars.ball.band} 42% 58%, ${vars.ball.bottom} 58% 100%)`,
  boxShadow: `0 0 0 1px ${vars.bar.edge}`,
  flex: '0 0 auto',
})

/** 상태 이상 딱지. 색은 쓰는 쪽이 `STATUS_VARS`로 준다 — 파티 화면과 **같은 표**다 */
export const statusTag = style({ ...STATUS_TAG, display: 'inline-block', lineHeight: 1.3 })

/** 날씨 · 필드 띠 — 위 가운데, 있을 때만 (`FieldStrip`) */
export const fieldStrip = style({
  ...WINDOW_SMALL,
  position: 'absolute',
  left: '50%',
  top: `calc(${String(HUD.bottom)}px + ${DEV_TOP})`,
  transform: 'translateX(-50%)',
  boxSizing: 'border-box',
  height: HUD.tray,
  maxWidth: 300,
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${GAP.base}px`,
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.strong,
})
export const fieldCell = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  selectors: {
    '& + &': { marginLeft: GAP.small, paddingLeft: GAP.small, borderLeft: `1px solid ${vars.window.rule}` },
  },
})

/** 아래쪽 — 글창과 명령 구역을 감싸는 층. 눌림은 안쪽 둘이 받는다 */
export const console_ = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
})

/**
 * 배틀 로그 — **창이다.** x32 · 아래 끝 24 · 폭 488. 두 줄이 기본이고 기술 정보(`LearnMove`의 상세)가 붙으면
 * **위로** 자란다 — 내 포켓몬이 서는 자리라 그 순간은 무대가 서 있다
 */
export const log = style({
  ...WINDOW,
  position: 'absolute',
  left: HUD.edge,
  bottom: HUD.bottom,
  width: `min(488px, calc(100vw - ${String(CMD_WIDTH + HUD.edge * 3)}px))`,
  boxSizing: 'border-box',
  padding: `${GAP.base}px ${GAP.loose}px`,
  cursor: 'pointer',
  pointerEvents: 'auto',
  fontFamily: vars.font.pixel,
})

/** 글창의 줄 높이(em)와 줄 수. 최소 높이가 이 둘의 곱이라 따로 놀 수 없다 */
const LOG_LINE = 1.5
const LOG_LINES = 2

/**
 * 배틀 글창의 글 처방 — Galmuri11 20. 배틀 · 교체 · 배틀 가방이 같은 글자로 말한다
 * (SYSTEM §2.2 `BATTLE_LINE`)
 */
export const BATTLE_LINE = {
  fontFamily: vars.font.pixel,
  whiteSpace: 'pre-line',
  fontSize: TEXT.title,
  lineHeight: LOG_LINE,
  color: vars.ink.strong,
} as const

/** 지금 찍는 중인 글. 한 번에 한 문장만 있는다 — 원작의 박자다 */
export const logText = style({
  ...BATTLE_LINE,
  // 두 줄치를 비워 둔다. 한 줄 문장과 두 줄 문장이 번갈아 뜰 때 창이 줄었다 늘었다 하면 안 된다
  minHeight: `${String(LOG_LINE * LOG_LINES)}em`,
})

/** 글창 안 상세(기술 정보) — 물음 줄 아래에 가는 선으로 가른다 */
export const logFacts = style({
  marginTop: GAP.small,
  paddingTop: GAP.small,
  borderTop: `1px solid ${vars.window.rule}`,
  fontFamily: vars.font.ui,
  whiteSpace: 'normal',
})

/**
 * 다음을 기다리는 표시. **글자가 아니라 오른쪽 아래 구석에 박힌 삼각**(폭 12 · 높이 8)이라 문장 길이에 따라
 * 위치가 안 흔들린다. `logText`의 형제다 — `textContent`가 문장만 남는다
 */
const blink = keyframes({
  '0%, 45%': { opacity: 1 },
  '55%, 100%': { opacity: 0.2 },
})
export const nextArrow = style({
  position: 'absolute',
  right: GAP.base,
  bottom: GAP.small + 2,
  width: 0,
  height: 0,
  borderStyle: 'solid',
  borderWidth: '8px 6px 0',
  borderColor: `${vars.ink.strong} transparent transparent`,
  animation: `${blink} ${TIME.blink} steps(1, end) infinite`,
})

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

const wipeBase = {
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  pointerEvents: 'none',
  background: vars.scrim.deep,
} as const

/**
 * 아직 무대를 못 세운 동안 **덮은 채로 세워 둔다.**
 *
 * ⚠️ 막이 560ms 고정이라, 준비가 그보다 길면 걷히고 나서 **빈 무대**가 보인다 —
 * 첫 배틀은 규칙기(`battle-sim`, 483KB)를 그때 받으므로 실제로 더 길다.
 * 실측으로 `pnpm shot rival`이 그 순간을 찍었다: 무대만 있고 포켓몬도 창도
 * 없는 그림이었다. 준비가 끝날 때까지 걷지 않는다
 */
export const wipeHold = style(wipeBase)

export const wipe = style({
  ...wipeBase,
  animation: `${wipeOut} 560ms ease-out forwards`,
})

/**
 * 배틀이 **열리는 순간의 막** — 원작 것이다 (PARITY §7.13).
 *
 * `SysTask_SetupUI`가 열째 프레임부터 화면을 **흰색으로** 물들이고
 * (`PaletteData_StartFade(..., 0, 16, fadeTarget)`) 스물여덟째부터 걷는다.
 * 그 사이에 땅 입자 두 벌이 터진다 (`scene/battle/EncounterBurst`).
 *
 * ⚠️ **색과 짙기를 여기서 안 정한다.** 프레임마다 달라지는 값이라 rAF가
 * 직접 쓴다 (`BattleOpenVeil`) — 리액트 상태로 두면 초당 예순 번 다시 그린다
 */
export const openVeil = style({
  ...wipeBase,
  opacity: 0,
})

/**
 * 준비 중 알림.
 *
 * ⚠️ **막보다 위다.** 막이 준비가 끝날 때까지 덮고 있으므로 밑에 두면 아무것도
 * 안 보인다 — 오래 걸리는 판에서 「멈췄나」로 읽힌다.
 *
 * ⚠️ **누름을 안 먹는다.** 화면 전체를 덮는 판이라 클릭을 받으면 그 밑의 단추가
 * 안 눌린다 — 「필드로 돌아가기」(`loadingBack`)만 따로 받는다
 */
export const loading = style({
  position: 'fixed',
  inset: 0,
  zIndex: 401,
  display: 'grid',
  placeContent: 'center',
  justifyItems: 'center',
  gap: GAP.base,
  padding: 12,
  fontSize: 13,
  color: vars.ink.onDark,
  pointerEvents: 'none',
})

/** 깜빡이는 것은 글뿐이다. 단추까지 깜빡이면 눌러도 되는 것인지 헷갈린다 */
export const loadingText = style({
  animation: `${pulse} 1.1s ease-in-out infinite`,
})

/** 배틀이 안 열릴 때 필드로 나가는 단추. 막 위에서 이것만 누름을 받는다 */
export const loadingBack = style({
  ...WINDOW_SMALL,
  pointerEvents: 'auto',
  appearance: 'none',
  font: 'inherit',
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.strong,
  padding: `${GAP.small}px ${GAP.wide}px`,
  cursor: 'pointer',
})

/**
 * 배틀이 닫히는 검은 막 — 16프레임에 내려앉는다.
 *
 * 들어갈 때는 흰 막과 조우 연출이 있는데 나올 때 아무것도 없으면 한 프레임 만에
 * 걷던 필드로 돌아간다. 원작도 끝나면 화면을 검게 내렸다가 필드를 다시 연다
 */
export const closeVeil = style({
  position: 'absolute',
  inset: 0,
  zIndex: 50,
  background: vars.scrim.black,
  pointerEvents: 'none',
  opacity: 0,
  transition: 'opacity 267ms linear',
})

export const closeVeilOn = style({ opacity: 1 })

/**
 * 배틀의 레벨업 능력치 창 (`LevelPanel`) — 명령 칸 위, 내 체력판 옆이다.
 *
 * 원작은 아래 화면 대신 위 화면 오른쪽에 띄운다(`SEQ_GET_EXP_LEVEL_UP_SUMMARY_INIT`).
 * 우리 한 화면에서는 글창을 안 덮는 오른쪽 열이 그 자리다
 */
export const levelPanel = style({
  ...WINDOW_SMALL,
  alignSelf: 'stretch',
  boxSizing: 'border-box',
  padding: `${GAP.small}px ${GAP.base}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
})



/**
 * 조작 안내 — **작은 창 한 장**이다 (`WINDOW_SMALL` + 키캡, SYSTEM §0 L6). 무대가 밝든 어둡든 읽힌다.
 * 비어 있으면 안 그린다
 */
export const keyHint = style({
  ...WINDOW_SMALL,
  position: 'absolute',
  right: HUD.edge,
  bottom: HUD.bottom,
  boxSizing: 'border-box',
  height: HUD.tray,
  display: 'inline-flex',
  alignItems: 'center',
  padding: `0 ${GAP.base}px`,
  fontSize: TEXT.tiny,
  fontWeight: 600,
  color: vars.ink.dim,
  whiteSpace: 'nowrap',
  pointerEvents: 'auto',
  selectors: {
    '&:empty': { display: 'none' },
  },
})
