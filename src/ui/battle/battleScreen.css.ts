// 배틀 HUD (PLAN §2.5) — **3D 무대 위에 뜨는 판이다.**
//
// 배경을 칠하지 않는다. 무대(`scene/battle/BattleStage`)가 뒤에서 렌더되고 이
// 계층은 그 위에 얹히는 정보만 담당한다. 무대가 없는 경우(타이틀에서 배틀을
// 직접 연 개발용 경로)에만 `fallback`이 임시 배경을 깐다.
import { globalStyle, keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { BAR_FILL, BAR_TRACK, PICKED, WINDOW } from '../theme/window.css'

/**
 * 떠 있는 판의 재질 — **창 한 벌 그대로다** (DESIGN.md §3).
 *
 * ⚠️ 한때 여기가 반투명 유리였다 (`backdrop-filter: blur(3px)` + 흰 실선 1px +
 * 크게 번지는 그림자). 무대가 비쳐서 좋아 보였지만 그 재질이 곧 「어느 앱이든
 * 될 수 있는 판」이었고, 원작 체력판은 **불투명한 밝은 판에 어두운 글자**다.
 */

export const screen = style({
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  display: 'grid',
  gridTemplateRows: '1fr auto',
  fontFamily: vars.font.ui,
  color: vars.ink.normal,
  userSelect: 'none',
  // 무대가 보여야 하므로 배경이 없다. 대신 위아래에만 옅은 그늘을 둬서
  // 흰 하늘 위에서도 HP 판과 텍스트가 뜬다.
  //
  // ⚠️ **아래쪽 그늘이 내 포켓몬을 덮고 있었다.** 내 포켓몬은 화면 아래 왼쪽에
  // 서는데(BDSP 배치) 그늘이 화면 절반을 지나면서 짙어져서, 모부기가 42%까지
  // 눌린 채로 그려졌다. 대사창은 제 배경이 따로 있으므로 여기서 그만큼 깔 이유가
  // 없다 — 시작을 아래로 내리고 짙기를 줄인다
  background: `linear-gradient(180deg, ${vars.scrim.over} 0%, transparent 24%,`
    + ` transparent 76%, ${vars.scrim.over} 100%)`,
})

/** 3D 무대가 없을 때만 깔리는 임시 배경 */
export const fallback = style({
  background: vars.scrim.deep,
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
/**
 * 상대 트레이너 이름. 야생전에는 안 뜬다.
 *
 * 무대 위에 바로 얹히므로 밝은 글자다 (`ink.onDark`) — 체력판 **안**이 아니다
 */
export const foeTrainer = style({
  marginBottom: 6,
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.onDark,
})

/**
 * 체력판.
 *
 * 원작 healthbox는 판이 **한쪽으로 비스듬하다.** 상대 것은 오른쪽 아래가,
 * 내 것은 왼쪽 아래가 잘려서 서로 화면 안쪽을 향한다. 그 각이 없으면
 * 그냥 둥근 상자가 되어서 어느 게임이든 될 수 있는 모양이 된다.
 */
export const card = style({
  ...WINDOW,
  position: 'relative',
  minWidth: 268,
  padding: `${GAP.small}px ${GAP.wide}px ${GAP.small + 2}px`,
  // 비스듬한 모서리. 테두리가 clip에 잘리므로 안쪽에 선을 하나 더 둔다
  border: 'none',
  boxShadow: 'none',
})

/** 잘린 자리에도 테두리가 보이게 하는 안쪽 선 */
const rim = {
  content: '""',
  position: 'absolute',
  inset: 0,
  borderRadius: RADIUS.window,
  border: `${EDGE.window}px solid ${vars.window.edge}`,
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
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
})

/** 성별 기호. 원작 체력판에도 이름 옆에 붙는다 */
export const genderMark = style({
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
})
export const male = style({ color: vars.state.male })
export const female = style({ color: vars.state.female })

export const monLevel = style({
  marginLeft: 'auto',
  fontSize: TEXT.small,
  fontFamily: vars.font.mono,
  color: vars.ink.dim,
})

/** `HP` 딱지 + 게이지가 한 줄이다 */
export const barRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
})

/** 원작 체력판의 노란 `HP` 글자 */
export const hpTag = style({
  fontSize: 11,
  fontWeight: 800,
  fontStyle: 'italic',
  color: vars.ink.dim,
})

/** HP 바. 원작처럼 얇고 길다 — 두꺼우면 게이지가 아니라 진행 표시처럼 보인다 */
export const barTrack = style({
  position: 'relative',
  flex: 1,
  height: 10,
  ...BAR_TRACK,
})

export const barFill = style({
  ...BAR_FILL,
  // 줄어드는 **시간**은 재생기가 정한다. 원작 게이지는 프레임당 한 칸씩 움직여서
  // 많이 맞을수록 오래 걸린다 (`playback.drainFrames`). 여기서는 기울기만 정하고
  // 길이는 `--drain`으로 받는다 — 고정 길이로 두면 큰 데미지가 순식간에 지나간다
  transition: 'width var(--drain, 420ms) linear, background-color 200ms linear',
})

/**
 * 색 셋. **경계는 `engine/battle/healthbar`가 정한다** — 비율이 아니라
 * 픽셀 수로 가른다(원작 `App_BarColor`)
 */
export const barGreen = style({ vars: { '--lit': vars.hp.greenLit, '--body': vars.hp.green } })
export const barYellow = style({ vars: { '--lit': vars.hp.yellowLit, '--body': vars.hp.yellow } })
export const barRed = style({ vars: { '--lit': vars.hp.redLit, '--body': vars.hp.red } })

export const hpText = style({
  marginTop: 4,
  fontSize: TEXT.tiny,
  fontFamily: vars.font.mono,
  textAlign: 'right',
  color: vars.ink.dim,
})

/** 남은 체력 숫자만 진하게 — 눈이 먼저 가야 하는 쪽이다 */
export const hpNow = style({ fontWeight: 700, color: vars.ink.strong })

/**
 * 이미 잡아 본 종이면 뜨는 공 표시.
 *
 * 원작 `HealthBox_DrawCaughtIcon`이 상대 체력판에만 그린다 — 도감에 등록된
 * 종인지 한눈에 알려 주는 자리다
 */
export const caughtMark = style({
  width: 11,
  height: 11,
  borderRadius: RADIUS.round,
  alignSelf: 'center',
  // 몬스터볼. 위 빨강 · 아래 흰색 · 가운데 검은 띠
  background: `linear-gradient(180deg, ${vars.ball.top} 0 42%,`
    + ` ${vars.ball.band} 42% 58%, ${vars.ball.bottom} 58% 100%)`,
  boxShadow: `0 0 0 1px ${vars.bar.edge}`,
  flex: '0 0 auto',
})

/** 상태 이상 딱지. 원작도 체력판 안에 색 딱지로 붙인다 */
export const statusTag = style({
  padding: '1px 7px',
  border: `1px solid ${vars.bar.edge}`,
  borderRadius: RADIUS.bar,
  fontSize: 11,
  fontWeight: 800,
  color: vars.status.text,
  background: vars.status.slp,
})

/** 상태마다 색이 다르다 — 글자를 안 읽어도 무엇에 걸렸는지 보인다 */
export const statusColor: Record<string, string> = {
  psn: vars.status.psn, tox: vars.status.tox, brn: vars.status.brn,
  par: vars.status.par, slp: vars.status.slp, frz: vars.status.frz,
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
 * 배틀 로그 — **창이다.**
 *
 * ⚠️ 한때 상자를 없애고 글자만 띄운 뒤 뒤에 번짐을 깔았다. 3D 무대를 안 가리려던
 * 것인데, 판을 없앤 자리에 남은 것이 **왼쪽 세로 색줄과 두 겹 글자 그림자**였다 —
 * 웹앱의 장치다. 원작 배틀 글은 화면 아래 창 안에 뜨고, 창이 밝아진 뒤로는
 * 무대 위에 얹혀도 글이 읽힌다.
 */
export const log = style({
  ...WINDOW,
  position: 'relative',
  alignSelf: 'end',
  padding: `${GAP.base}px ${GAP.loose}px`,
  cursor: 'pointer',
  fontFamily: vars.font.pixel,
})

/** 지금 찍는 중인 글. 한 번에 한 문장만 있는다 — 원작의 박자다 */
export const logText = style({
  whiteSpace: 'pre-line',
  fontSize: TEXT.title,
  lineHeight: 1.5,
  color: vars.ink.strong,
  // 두 줄치를 비워 둔다. 문장이 짧아질 때마다 명령 칸이 위아래로 흔들리면 안 된다
  minHeight: '2.2em',
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
  ...WINDOW,
  position: 'relative',
  appearance: 'none',
  display: 'block',
  width: '100%',
  minHeight: 50,
  padding: `${GAP.small}px ${GAP.wide + 4}px ${GAP.small}px ${GAP.base + 2}px`,
  font: 'inherit',
  fontSize: TEXT.base,
  fontWeight: 700,
  textAlign: 'left',
  cursor: 'pointer',
  flex: '0 0 auto',
  transform: `skewX(-${String(SKEW)}deg)`,
  transition: 'transform 120ms ease-out, background 140ms linear,'
    + ' border-color 140ms linear',
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
  width: 22,
  height: 22,
  borderRadius: RADIUS.bar,
  flex: '0 0 auto',
  background: `var(--tint, ${vars.window.edge})`,
  border: `1px solid ${vars.bar.edge}`,
})

/** 이름 + 그 아래 작은 줄 */
export const labelCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
})

export const label = style({
  fontSize: TEXT.base,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

/**
 * 기술 타입·교체 레벨처럼 이름을 거드는 줄.
 *
 * ⚠️ **`opacity`가 아니라 글자색이다.** 투명도는 자식까지 곱해져서, 이 줄 안에
 * 들어오는 상성 표시(`matchLine`)의 색을 되돌릴 방법이 없어진다
 */
export const subLine = style({
  fontSize: TEXT.tiny,
  fontWeight: 500,
  color: vars.ink.dim,
})

/** 타입과 상성 사이의 가운뎃점 */
export const sep = style({ margin: '0 5px', color: vars.ink.faint })

/**
 * 「효과가 굉장함」 (PARITY §2.22).
 *
 * 상자를 따로 두지 않는다 — 타입 이름과 같은 줄에 이어 붙이고 색으로만 가른다.
 * 네 칸마다 알약이 하나씩 더 붙으면 기술 목록이 표가 된다
 */
export const matchLine = style({ fontWeight: 700 })

export const matchTone = styleVariants({
  super: { color: vars.match.superEff },
  resisted: { color: vars.match.resisted },
  immune: { color: vars.match.immune },
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
  fight: vars.cmd.fight,
  bag: vars.cmd.bag,
  party: vars.cmd.party,
  run: vars.cmd.run,
} as const

/**
 * 지금 고른 칸.
 *
 * **금 테두리다.** 게임 안에서 「고른 것」은 어디서나 금 테두리이므로
 * (DESIGN.md §1.2) 여기만 다르게 두면 배틀에서만 규칙이 바뀐다.
 *
 * ⚠️ 한때 **그 칸의 색으로 판을 통째로 채웠다.** 어두운 판이 줄지어 있던 시절의
 * 답이었는데, 창이 밝아진 뒤로는 빨간 판 위의 빨간 글씨가 됐다 — 이름줄도
 * 설명줄도 안 읽혔다. 왼쪽 색 조각이 이미 어느 칸인지를 나르므로 판까지
 * 칠할 이유가 없다.
 *
 * 왼쪽으로 한 걸음 나오는 것까지가 한 벌이다 — 목록에서 뽑혀 나온 것으로 읽힌다.
 * 마우스 hover와 키보드 커서는 **같은 표시**를 쓴다. 둘이 다르면 지금 눌리는
 * 칸이 어느 쪽인지 헷갈린다
 */
export const buttonOn = style({
  transform: `skewX(-${String(SKEW)}deg) translateX(-13px)`,
  ...PICKED,
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
  borderLeft: `11px solid ${vars.pick.edge}`,
  borderTop: '8px solid transparent',
  borderBottom: '8px solid transparent',
  transform: `translateY(-50%) skewX(${String(SKEW)}deg)`,
})

/** 남은 PP가 적을 때. 바닥나기 전에 눈에 띄어야 한다 */
export const ppLow = style({ color: vars.match.superEff, opacity: 1 })
export const ppOut = style({ color: vars.state.bad, opacity: 1 })

/** 한 단 들어간 메뉴의 "돌아가기". 명령 아래에 글자로만 둔다 */
/**
 * 「누구에게?」·「○○은(는) 무엇을 할까?」 한 줄 (PARITY §2.2).
 *
 * 더블은 자리마다 따로 묻는다. 이 줄이 없으면 같은 메뉴가 두 번 뜨는 것으로만
 * 보여서, 첫째에게 물었는지 둘째에게 물었는지를 화면에서 알 수 없다
 */
export const askWho = style({
  color: vars.ink.onDark,
  font: 'inherit',
  fontSize: TEXT.small,
  padding: '2px 6px 6px',
  flex: '0 0 auto',
})

export const backButton = style({
  alignSelf: 'flex-end',
  appearance: 'none',
  border: 'none',
  background: 'none',
  color: vars.ink.onDarkDim,
  font: 'inherit',
  fontSize: TEXT.small,
  padding: '4px 6px',
  cursor: 'pointer',
  flex: '0 0 auto',
  selectors: {
    '&:hover': { color: vars.ink.onDark },
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
  background: vars.scrim.deep,
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
  fontSize: TEXT.tiny,
  color: vars.ink.onDarkDim,
  textAlign: 'right',
})
