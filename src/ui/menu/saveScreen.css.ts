// 리포트 — 요약 장 · 대사창 · 예/아니오를 필드 위에 흩어 놓는다 (`save.md` §4).
//
// 원작 배치를 따른다: 요약은 **왼쪽 위**, 물음은 **아래 대사창**, 예/아니오는 대사창 위 오른쪽이고 가운데의 주인공은
// 비워 둔다. 한때 창 넷~다섯 장을 화면 한가운데에 세로로 쌓아서 정작 「지금 선 곳」을 가렸다.
//
// ⚠️ **키 입력을 막는 움직임이 없다.** 하네스가 열자마자 Space를 120ms 간격으로 친다(`journey.mjs` `writeReport`).
// 아래 움직임은 전부 보이기만 하고 입력은 처음부터 받는다.
// `prefers-reduced-motion`이면 미끄러짐과 빛띠를 끄고 다이얼(원작 프레임 움직임)만 남는다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, ICON, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { RULE, WINDOW, WINDOW_SMALL } from '../theme/window.css'
import { overlay } from './menuChrome.css'

// ─────────────────────────────────────────────────────────────────
// 무대
// ─────────────────────────────────────────────────────────────────

/**
 * 뿌리. 덮개(`scrim.over`)가 3D를 어둡게 눌러 주고, 안에 창들을 흩는다.
 *
 * `overlay`의 안쪽 여백 16을 걷는다 — 요약 장이 화면 왼쪽 위 24에 서야 한다(원작 `Window_Add(…, 1, 1, …)`).
 * `position: 'fixed'`를 다시 적은 것은 `menuLayer.test`가 뿌리의 층을 **글로** 읽기 때문이다
 */
export const root = style([overlay, { position: 'fixed', padding: 0 }])

/** 960×640 무대. 이보다 작은 창에서는 줄어든다 */
export const stage = style({
  position: 'relative',
  width: 'min(960px, 100%)',
  height: 'min(640px, 100%)',
  pointerEvents: 'none',
})

// ─────────────────────────────────────────────────────────────────
// 리포트 장
// ─────────────────────────────────────────────────────────────────

const slideIn = keyframes({
  from: { opacity: 0, transform: 'translateX(-12px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
/** 다 썼다 — 테두리가 금빛으로 한 번 숨 쉬고 돌아온다. 0.4s는 설계서의 값이다(`TIME`에 같은 단이 없다) */
const BREATH = '0.4s'
const breathe = keyframes({
  '50%': { borderColor: vars.pick.edge, boxShadow: `inset 0 0 0 1px ${vars.pick.edge}` },
})

/** 요약 장이 오는 자리. 필드 `SaveInfoWindow`도 같은 장이다 — 창은 한 벌이다 */
export const sheet = style({
  ...WINDOW,
  position: 'absolute',
  left: GAP.loose,
  top: GAP.loose,
  width: 392,
  maxWidth: `calc(100% - ${String(GAP.loose * 2)}px)`,
  boxSizing: 'border-box',
  padding: `${GAP.wide}px 22px ${GAP.wide + 2}px`,
  overflow: 'hidden',
  animation: `${slideIn} ${TIME.fade} ease-out both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: `${fadeIn} ${TIME.fade} ease-out both` } },
})

/** 다 씀 — 열릴 때 움직임에 숨쉬기를 더한다 (끄는 설정이면 숨쉬기도 끈다) */
export const sheetDone = style({
  animation: `${slideIn} ${TIME.fade} ease-out both, ${breathe} ${BREATH} ease-in-out 0.05s 1`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: `${fadeIn} ${TIME.fade} ease-out both` } },
})

/** 지명 — 원작이 `{COLOR 1}`로 색을 바꿔 찍는 유일한 글이다. 필드 팔레트의 파랑 자리(`emphasis.two`) */
export const place = style({
  paddingBottom: GAP.small + 2,
  borderBottom: RULE,
  fontSize: 22,
  fontWeight: 700,
  color: vars.emphasis.two,
})

export const who = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.wide + 2,
  padding: `${GAP.base + 2}px 0 ${GAP.base}px`,
})

/** 주인공 그림 — 36×66을 정수 2배(72×132)로. 자리는 인라인이 준다 */
export const trainer = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 이름표와 값 — **`dl` 하나다.** `dd` 수(도감 전 3 · 후 4)를 하네스가 센다(`run.mjs`) */
export const info = style({
  flex: 1,
  minWidth: 0,
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'auto auto',
  columnGap: GAP.loose,
  rowGap: GAP.small + 2,
  fontSize: TEXT.list,
})
globalStyle(`${info} dt`, { color: vars.ink.dim })
globalStyle(`${info} dd`, {
  margin: 0,
  textAlign: 'right',
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})

/** 배지 여덟 자리 — `dl` 밖이다 (`dd`가 아니다) */
export const badges = style({
  display: 'flex',
  justifyContent: 'center',
  padding: `${GAP.tight}px 0 ${GAP.base}px`,
})

/** 파티 여섯 자리. 위에 점선 한 줄 */
export const party = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  height: 54,
  paddingTop: GAP.small + 2,
  borderTop: `${String(EDGE.rule)}px dashed ${vars.window.rule}`,
})

/** 한 자리 40. 아이콘은 정수 1배(32)라 칸 가운데에 놓는다 */
export const slot = style({
  flex: '0 0 auto',
  width: ICON.cell + GAP.small,
  height: ICON.cell + GAP.small,
  display: 'grid',
  placeItems: 'center',
})

/** 빈 자리는 판이 아니라 작은 점이다 */
export const slotEmpty = style({
  selectors: {
    '&::after': {
      content: '""',
      width: 6,
      height: 6,
      borderRadius: RADIUS.round,
      background: vars.window.rule,
    },
  },
})

const sweepFrames = keyframes({
  '0%': { transform: 'translateY(-100%)', opacity: 0 },
  '15%': { opacity: 1 },
  '85%': { opacity: 1 },
  '100%': { transform: 'translateY(250%)', opacity: 0 },
})

/** 쓰는 중 — 옅은 빛띠가 위에서 아래로 한 번 지나간다 (되풀이하지 않는다) */
export const sweep = style({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  height: '40%',
  pointerEvents: 'none',
  background: `linear-gradient(180deg, transparent,`
    + ` color-mix(in srgb, ${vars.window.faceTop} 85%, transparent), transparent)`,
  opacity: 0,
  animation: `${sweepFrames} 0.9s ease-in-out 1 both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

// ─────────────────────────────────────────────────────────────────
// 대사창 · 예/아니오 · 백업 줄 · 안내
// ─────────────────────────────────────────────────────────────────

const messageIn = keyframes({
  from: { opacity: 0, transform: 'translate(-50%, 8px)' },
  to: { opacity: 1, transform: 'translate(-50%, 0)' },
})
const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
})

/** 대사창이 서는 폭. 필드 대사창과 같은 760 (`messageBox.css`의 `MAX_WIDTH`) */
const MESSAGE_WIDTH = 760
/** 대사창 아래 끝 — 안내 창이 그 밑에 선다 */
const MESSAGE_BOTTOM = 44
/** 대사창 두 줄의 높이(안쪽 여백 포함)에 틈 10을 더한 자리 — 예/아니오와 백업 줄이 그 위에 선다 */
const ABOVE_MESSAGE = MESSAGE_BOTTOM + LINE.message * 2 + GAP.base * 2 + 6 + 10

/** 대사창 자리. 창 자체는 `MessageWindow`다 — 위치만 여기서 준다 */
export const messageBar = style({
  position: 'absolute',
  left: '50%',
  bottom: MESSAGE_BOTTOM,
  width: `min(${String(MESSAGE_WIDTH)}px, calc(100% - ${String(GAP.loose * 2)}px))`,
  transform: 'translateX(-50%)',
  animation: `${messageIn} ${TIME.open} ease-out both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 대사창 오른쪽 끝에 맞춘다 */
const RIGHT_EDGE = `max(${String(GAP.wide)}px, calc(50% - ${String(MESSAGE_WIDTH / 2)}px))`

/** 예/아니오 — 창 한 장에 두 줄. 대사창 뒤에 0.06s 늦게 나타난다 (입력은 처음부터 받는다) */
export const choices = style({
  position: 'absolute',
  right: RIGHT_EDGE,
  bottom: ABOVE_MESSAGE,
  animation: `${rise} ${TIME.open} ease-out 0.06s both`,
  pointerEvents: 'auto',
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 예/아니오 글꼴 — 필드 예/아니오와 같은 창이라 같은 픽셀 글꼴이다 */
export const choiceList = style({ fontFamily: vars.font.pixel })

/** 백업 줄 — 다 쓴 뒤에만 뜨는 작은 창. 막혔으면 `state.bad` 굵게 */
export const backup = style({
  ...WINDOW_SMALL,
  position: 'absolute',
  left: RIGHT_EDGE,
  bottom: ABOVE_MESSAGE,
  maxWidth: `calc(100% - ${String(GAP.wide * 2)}px)`,
  boxSizing: 'border-box',
  padding: `${GAP.small - 1}px ${GAP.wide}px`,
  fontSize: TEXT.small,
  lineHeight: 1.6,
  animation: `${rise} ${TIME.open} ease-out both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

export const backupBad = style({ color: vars.state.bad, fontWeight: 700 })

/**
 * 조작 안내 — 어두운 덮개 위라 **작은 창 한 장** 안의 키캡이다 (§0 L6). 단계마다 자리가 같다 —
 * 덩어리 높이를 따라 오르내리지 않는다
 */
export const hint = style({
  ...WINDOW_SMALL,
  position: 'absolute',
  left: '50%',
  bottom: GAP.small + 2,
  transform: 'translateX(-50%)',
  boxSizing: 'border-box',
  padding: `${GAP.tight}px ${GAP.base}px`,
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  whiteSpace: 'nowrap',
})
