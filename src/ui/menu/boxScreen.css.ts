// 포켓몬 보관 시스템 화면.
//
// ⚠️ **이 화면만은 판을 깔지 않는다.** 다른 메뉴는 어두운 창에 글줄이지만,
// 박스는 원작에서 그림이 먼저 온다 — 벽지가 깔리고 그 위에 아이콘 서른 개가
// 붙는다. 벽지를 안 깔고 회색 격자를 그리면 박스 열여덟 개가 전부 같아 보인다.
//
// 자리는 원작에서 잰 것이다 (`ov19_021D79F8`의 `112 + 24*col`, `40 + 24*row`):
//
//   벽지        168 × 160
//   이름 띠     위 21 × 4 타일 = 168 × 32
//   격자 간격   24        ← 아이콘은 32이므로 **8만큼 겹친다**
//
// 세 배로 키워서 쓴다. 겹치는 것까지 그대로 둔다 — 원작 박스가 빽빽한 이유가
// 그거고, 간격을 벌리면 서른 칸이 화면을 넘는다.
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 원작 픽셀을 화면 픽셀로 옮기는 배수 */
const K = 3
/** 벽지 한 장 (`box.narc`의 NSCR 21×20 타일) */
const WALL_W = 168 * K
const WALL_H = 160 * K
/** 이름 띠 높이 — 벽지 그림에 이미 그려져 있는 자리다 */
const BANNER = 32 * K
/** 칸 간격과 아이콘 크기 */
const PITCH = 24 * K
const ICON = 32 * K
/** 격자가 벽지 안에서 앉는 자리. 가로는 가운데, 세로는 띠 바로 아래다 */
const GRID_X = (WALL_W - PITCH * 6) / 2
const GRID_Y = BANNER + 8 * K

const EDGE = 'rgba(150, 176, 224, 0.34)'

/** 왼쪽 박스, 오른쪽 파티. 가르는 것은 판이 아니라 세로선 하나다 */
export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `${String(WALL_W)}px minmax(0, 1fr)`,
  gap: 14,
  padding: '10px 14px',
  overflow: 'auto',
  scrollbarWidth: 'thin',
})

/** 박스 쪽 — 넘김 화살표와 벽지 */
export const boxSide = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
})

export const wall = style({
  position: 'relative',
  width: WALL_W,
  height: WALL_H,
  flex: '0 0 auto',
  borderRadius: 6,
  // 원작 벽지는 픽셀 그림이다. 부드럽게 늘리면 죽이 된다
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
})

/**
 * 박스 이름 — 벽지에 그려진 띠 **위에** 얹는다.
 *
 * 원작은 그림 픽셀에 글자를 직접 찍는다(`ov19_021D7C58`이 Window를 얹는다).
 * 우리는 글자를 HTML로 얹으므로 그림은 손대지 않는다
 */
export const boxName = style({
  position: 'absolute',
  left: 0,
  top: 13 * K,
  width: '100%',
  textAlign: 'center',
  fontSize: 17,
  fontWeight: 700,
  // 벽지 띠가 밝아서 어두운 글자가 원작과 같다
  color: '#26324b',
  textShadow: '0 1px 0 rgba(255, 255, 255, 0.55)',
  pointerEvents: 'none',
})

/** 격자 자리. 칸이 겹치므로 절대 좌표로 놓는다 */
export const grid = style({
  position: 'absolute',
  left: GRID_X,
  top: GRID_Y,
  width: PITCH * 6,
  height: PITCH * 5,
})

/** 한 칸. 아이콘이 간격보다 커서 가운데를 기준으로 삐져나온다 */
export const slot = style({
  position: 'absolute',
  width: ICON,
  height: ICON,
  marginLeft: (PITCH - ICON) / 2,
  marginTop: (PITCH - ICON) / 2,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 칸의 자리를 잡는 값. 컴포넌트가 줄·칸으로 계산한다 */
export const SLOT_PITCH = PITCH

/**
 * 커서.
 *
 * 아이콘 뒤에 깔리는 밝은 원 하나다. 테두리를 두르면 아이콘 여백까지 네모로
 * 갇혀서, 서른 칸 중 어디에 있는지가 오히려 안 보인다
 */
export const cursor = style({
  position: 'absolute',
  width: PITCH,
  height: PITCH,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 70%)',
  boxShadow: `0 0 0 2px ${vars.hud.warn}`,
  pointerEvents: 'none',
  transition: 'left 0.06s linear, top 0.06s linear',
})

/** 집어 든 것. 커서를 따라다니지 않고 제자리에서 떠오른다 */
export const picked = style({
  filter: 'drop-shadow(0 4px 3px rgba(0, 0, 0, 0.55)) brightness(1.25)',
  transform: 'translateY(-6px)',
})

/** 박스를 넘기는 줄 — ◀ 이름 ▶ */
export const pager = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: WALL_W,
  fontSize: 14,
  opacity: 0.8,
})

export const pagerArrow = style({
  padding: '0 8px',
  cursor: 'pointer',
  selectors: { '&:hover': { color: vars.hud.warn } },
})

/** 몇 마리 들어 있는가 */
export const pagerCount = style({
  fontVariantNumeric: 'tabular-nums',
  fontFamily: vars.font.mono,
})

/** 오른쪽 칸 — 파티 여섯과 고른 한 마리의 자세한 것 */
export const side = style({
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  paddingLeft: 14,
  borderLeft: `1px solid ${EDGE}`,
})

export const partyHead = style({
  fontSize: 13,
  letterSpacing: 1,
  opacity: 0.62,
})

/** 파티 여섯 칸. 두 줄로 세운다 — 세로 여섯이면 벽지보다 길어진다 */
export const party = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 6,
})

const partyBase = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 46,
  padding: '0 6px',
  borderRadius: 7,
  background: 'rgba(255, 255, 255, 0.045)',
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
} as const

export const partySlot = styleVariants({
  off: [partyBase],
  on: [partyBase, {
    background: 'rgba(238, 243, 255, 0.14)',
    boxShadow: `inset 0 0 0 2px ${vars.hud.warn}`,
  }],
  empty: [partyBase, { opacity: 0.3 }],
})

/** 파티 칸의 아이콘. 박스보다 작다 — 여기서는 이름이 함께 읽혀야 한다 */
export const partyIcon = style({
  width: 40,
  height: 40,
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

export const partyName = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  lineHeight: 1.25,
  fontSize: 13,
})

export const partyLevel = style({
  fontSize: 11,
  opacity: 0.7,
  fontVariantNumeric: 'tabular-nums',
})

/** 고른 한 마리 */
export const detail = style({
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  paddingTop: 8,
  borderTop: `1px solid ${EDGE}`,
})

export const detailName = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 18,
  fontWeight: 700,
})

export const detailSub = style({
  fontSize: 13,
  opacity: 0.7,
  fontVariantNumeric: 'tabular-nums',
})

export const detailRow = style({
  display: 'flex',
  gap: 8,
  fontSize: 13,
  opacity: 0.86,
})

export const detailLabel = style({
  width: 62,
  flex: '0 0 auto',
  opacity: 0.62,
})

export const male = style({ color: '#7fb2ff' })
export const female = style({ color: '#ff9ac0' })

/** 화면이 하는 말. 원작 글을 그대로 띄운다 (`TEXT_BANK_BOX_MESSAGES`) */
export const notice = style({
  minHeight: 20,
  fontSize: 13,
  color: vars.hud.warn,
})

// ── 비교하기 (`PC_MODE_COMPARE`) ────────────────────────────────────────────

export const compare = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
})

export const compareHead = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
})

export const compareName = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  selectors: { '&:last-child': { textAlign: 'right' } },
})

export const comparePage = style({
  textAlign: 'center',
  fontSize: 11,
  letterSpacing: '0.08em',
  opacity: 0.62,
})

export const compareRows = style({ display: 'flex', flexDirection: 'column', gap: 3 })

export const compareRow = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 13,
})

export const compareLabel = style({
  fontSize: 11,
  opacity: 0.6,
  textAlign: 'center',
  minWidth: 44,
})

export const compareValue = style({
  fontVariantNumeric: 'tabular-nums',
  selectors: { '&:last-child': { textAlign: 'right' } },
})

/** 이긴 쪽. 색이 아니라 **굵기**로 말한다 — 색맹에도 보인다 */
export const compareWin = style([compareValue, { fontWeight: 800 }])

export const compareNote = style({
  fontSize: 12,
  opacity: 0.66,
  lineHeight: 1.55,
  textAlign: 'center',
  paddingTop: 6,
})
