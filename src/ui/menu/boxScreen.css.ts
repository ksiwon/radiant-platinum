// 포켓몬 보관 시스템 화면.
//
// ⚠️ **이 화면만은 판을 깔지 않는다.** 다른 메뉴는 밝은 창에 글줄이지만, 박스는 원작에서 그림이 먼저 온다 — 벽지가 깔리고 그 위에
// 아이콘 서른 개가 앉는다. 벽지를 안 깔고 회색 격자를 그리면 박스 열여덟 개가 전부 같아 보인다.
//
// 자리 셈은 `box/boxMenus.ts` 한 곳이다 (벽지 안쪽에서 아이콘 배율을 거꾸로 정한다). 여기서는 상자의 **모양**만 적는다 —
// 칸의 위치와 크기는 컴포넌트가 인라인으로 넣는다.
//
// 본문 높이는 960×640 창에서 약 528px이다(창 928×608 − 테두리 · 머리 · 바닥). 벽지(480) + 필름 띠(28)가 그 안에 든다.
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { GAP, LINE, RADIUS, TEXT, TIME } from '../theme/scale'
import { vars } from '../theme/contract.css'
import { pickHalo, RULE } from '../theme/window.css'
import { PARTY_CELL, WALL_PX } from './box/wallGeometry'

/** 필름 띠 썸네일 한 장의 폭 · 사이 · 현재 칸이 오르는 높이 */
export const THUMB = { w: 22, gap: 3, lift: 3 } as const

// ── 본문 ────────────────────────────────────────────────────────────────────

/** 왼쪽 벽지 · 오른쪽 기둥. 가르는 것은 판이 아니라 세로선 하나다 */
export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `${String(WALL_PX.w)}px minmax(0, 1fr)`,
  // 줄 높이를 본문 높이로 못 박는다 — 기둥은 그 안에서 줄어든다(말이 서면 상세가 먼저 빠진다)
  gridTemplateRows: 'minmax(0, 1fr)',
  gap: 14,
  padding: '6px 14px 4px',
  overflow: 'hidden',
})

/** 벽지와 그 아래 필름 띠 */
export const boxSide = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
  minWidth: 0,
})

/**
 * 벽지 한 장. 그림은 168×160의 정수 3배(504×480)이고 테두리가 없다 — 그림 안에 틀이 이미 그려져 있다.
 * 원작 벽지는 픽셀 그림이다. 부드럽게 늘리면 죽이 된다
 */
export const wall = style({
  position: 'relative',
  width: WALL_PX.w,
  height: WALL_PX.h,
  flex: '0 0 auto',
  boxSizing: 'border-box',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

// ── 이름 띠 ──────────────────────────────────────────────────────────────────

/** 벽지 그림에 그려져 있는 이름 띠 자리. 글자는 HTML로 얹는다(원작은 그림 픽셀에 직접 찍는다) */
export const banner = style({
  position: 'absolute',
  left: WALL_PX.banner.x,
  top: WALL_PX.banner.y,
  width: WALL_PX.banner.w,
  height: WALL_PX.banner.h,
  display: 'grid',
  placeItems: 'center',
  boxSizing: 'border-box',
  fontSize: TEXT.big,
  fontWeight: 700,
  // 벽지 띠가 밝아서 어두운 글자가 원작과 같다
  color: vars.ink.strong,
  cursor: 'pointer',
})

/** 머리에 커서가 섰다 — 띠 둘레에 금 고리 */
export const bannerOn = style([pickHalo, { borderRadius: RADIUS.cell }])

export const bannerName = style({
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

/** ◀ ▶ — 글자가 아니라 세모다. 칸은 40×32의 눌리는 자리 */
export const arrow = style({
  position: 'absolute',
  top: WALL_PX.banner.y + (WALL_PX.banner.h - 32) / 2,
  width: 40,
  height: 32,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  color: vars.ink.strong,
  selectors: { '&:hover': { color: vars.pick.edge } },
  '::before': {
    content: '""',
    width: 0,
    height: 0,
    borderTop: '9px solid transparent',
    borderBottom: '9px solid transparent',
  },
})

export const arrowLeft = style({
  left: (WALL_PX.banner.x - 40) / 2,
  '::before': { borderRight: '12px solid currentColor' },
})

export const arrowRight = style({
  left: WALL_PX.banner.x + WALL_PX.banner.w + (WALL_PX.w - WALL_PX.banner.x - WALL_PX.banner.w - 40) / 2,
  '::before': { borderLeft: '12px solid currentColor' },
})

// ── 격자 ─────────────────────────────────────────────────────────────────────

/** 한 칸의 아이콘. 크기는 `pokeIconAt`이, 자리는 컴포넌트가 준다 */
export const slot = style({
  position: 'absolute',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 든 마리의 원래 자리에 남는 옅은 자국 — 「실제로 흐린」 상태 표현이라 불투명도가 맞다 */
export const slotGhost = style({ opacity: 0.35 })

/** 커서 원 — 아이콘 뒤에 깔리는 금빛 원이다. 칸 사이를 `TIME.slide`로 미끄러진다 */
export const ring = style([pickHalo, {
  position: 'absolute',
  borderRadius: RADIUS.round,
  pointerEvents: 'none',
  transition: `left ${TIME.slide} ease-out, top ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
}])

const liftIn = keyframes({
  from: { transform: 'translateY(0)' },
  to: { transform: 'translateY(var(--lift))' },
})

/** 든 아이콘 — 커서 위로 떠서 따라간다. 0.08s에 뜨고 놓으면 즉시 사라진다 */
export const lifted = style({
  position: 'absolute',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  pointerEvents: 'none',
  zIndex: 2,
  transform: 'translateY(var(--lift))',
  animation: `${liftIn} ${TIME.close} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 도구를 든 칸의 점 — 도구 옮기기 모드에서만 (결정). 둥근 점 하나다 */
export const itemDot = style({
  position: 'absolute',
  width: 10,
  height: 10,
  boxSizing: 'border-box',
  borderRadius: RADIUS.round,
  border: `2px solid ${vars.bar.edge}`,
  background: vars.pick.edge,
  pointerEvents: 'none',
})

// ── 필름 띠 ──────────────────────────────────────────────────────────────────

/** 열여덟 벽지를 한 줄로. 왼쪽 썸네일, 오른쪽 이 박스의 채움 */
export const film = style({
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: GAP.small,
  height: 28,
})

export const filmStrip = style({
  display: 'flex',
  alignItems: 'flex-end',
  gap: THUMB.gap,
  minWidth: 0,
})

export const thumb = style({
  position: 'relative',
  flex: '0 0 auto',
  cursor: 'pointer',
  transition: `transform ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

/** 지금 박스 — 금 고리 + 3px 올림 */
export const thumbOn = style([pickHalo, { transform: `translateY(-${String(THUMB.lift)}px)` }])

/** 점프 목록이 가리키는 박스 — 올리기만 한다 */
export const thumbPeek = style({ transform: `translateY(-${String(THUMB.lift)}px)` })

/** 아래 3px 채움 막대. 가득 찬 박스는 `ink.dim`이다 */
export const thumbFill = style({
  position: 'absolute',
  left: 0,
  bottom: 0,
  height: 3,
  background: vars.pick.edge,
})
export const thumbFull = style({ background: vars.ink.dim })

/** 이 박스에 몇 마리 — 실제 칸을 센 수 */
export const filmCount = style({
  flex: '0 0 auto',
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.ink.normal,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
  paddingBottom: 2,
})

// ── 오른쪽 기둥 ──────────────────────────────────────────────────────────────

/** 파티 · 고른 마리 · 말. 가르는 것은 세로선 하나다 */
export const pillar = style({
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  paddingLeft: 14,
  borderLeft: RULE,
})

/** 머리줄 — 글 + 남은 폭 실선 + 오른쪽 수 */
export const head = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.ink.dim,
  '::after': { content: '""', order: 1, flex: 1, height: 1, background: vars.window.rule },
})

/** 머리줄의 오른쪽 수. 실선 뒤에 온다 */
export const headCount = style({ order: 2, fontVariantNumeric: 'tabular-nums' })

/** 활성인 쪽의 머리줄 — 금 밑줄 */
export const headOn = style({ color: vars.pick.text })

/** 파티 여섯 칸. 상자를 깔지 않는다 — 아이콘과 글이다. 두 줄 세 칸 */
export const party = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: `${String(GAP.tight)}px ${String(GAP.small)}px`,
})

const partyBase = {
  position: 'relative',
  boxSizing: 'border-box',
  height: PARTY_CELL.height,
  minWidth: 0,
  // 아이콘이 뛰는 폭(위로 6px)이 칸 위로 나가지 않게 위를 비운다
  padding: `${String(PARTY_CELL.top)}px 4px ${String(PARTY_CELL.bottom)}px`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: PARTY_CELL.gap,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
} as const

export const partySlot = styleVariants({
  off: [partyBase],
  /** 고른 칸 — 공용 `rowOn` 꼴의 금 면 + 안쪽 금선 */
  on: [partyBase, {
    background: vars.pick.face,
    boxShadow: `inset 0 0 0 2px ${vars.pick.edge}`,
    color: vars.pick.text,
  }],
  empty: [partyBase, { cursor: 'default' }],
})

/** 상태 표현 — 쓰러진 칸은 아이콘이 회색 + 흐리다 */
export const partyFainted = style({ opacity: 0.65, filter: 'grayscale(1)' })

/** 파티 아이콘 한 칸. 상자 안에 온전히 앉고 이름 · 막대와 겹치지 않는다 (`PARTY_SCALE`) */
export const partyIcon = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 빈 칸 — 점선 원 하나 */
export const partyGhost = style({
  flex: '0 0 auto',
  boxSizing: 'border-box',
  width: 28,
  height: 28,
  margin: 18,
  borderRadius: RADIUS.round,
  border: `2px dashed ${vars.window.rule}`,
})

export const partyName = style({
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'center',
  gap: GAP.tight,
  minWidth: 0,
  fontSize: 13,
  lineHeight: `${String(PARTY_CELL.name)}px`,
})

export const partyNameText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const partyLevel = style({
  flex: '0 0 auto',
  fontSize: 11,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

export const partyBar = style({ alignSelf: 'stretch', padding: '0 6px' })

// ── 고른 마리 ────────────────────────────────────────────────────────────────

/** 고른 마리 칸. 남는 높이를 먹고 넘치는 것은 자른다 — 말이 서면 기술 줄이 먼저 빠진다 */
export const detail = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  overflow: 'hidden',
})

/** 그림 + 오른쪽 글줄 */
export const preview = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: GAP.base,
  minHeight: 0,
})

/** 정면 그림 160×160 (원작 80px의 정수 2배). 늘 서 있어서 그림이 오기 전에 상세가 안 흔들린다 */
export const previewArt = style({
  position: 'relative',
  width: 160,
  height: 160,
  flex: '0 0 auto',
  display: 'grid',
  placeItems: 'center',
})

export const previewImg = style({
  width: 160,
  height: 160,
  objectFit: 'contain',
  imageRendering: 'pixelated',
})

export const previewText = style({
  minWidth: 0,
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
  paddingTop: GAP.small,
})

/** 손에 든 마리의 이름 — 금 밑줄이 든 것을 가리킨다 (글을 지어 붙이지 않는다) */
export const heldName = style({ borderBottom: `2px solid ${vars.pick.edge}` })

export const detailName = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.small,
  minWidth: 0,
  fontSize: 21,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const detailNameText = style({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })

export const detailSub = style({ fontSize: TEXT.small, color: vars.ink.dim, fontVariantNumeric: 'tabular-nums' })

export const detailRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  minWidth: 0,
  fontSize: TEXT.small,
  color: vars.ink.normal,
})

/** 상세의 HP 막대 칸 — 줄이 남는 폭을 주지 않으면 막대 홈이 0폭으로 접힌다 */
export const detailBar = style({ flex: '1 1 auto', minWidth: 120, maxWidth: 220 })

export const detailLabel = style({ flex: '0 0 auto', width: 36, color: vars.ink.dim })

/** 「지닌물건 없음」 — 원작은 이름표 없이 이 한 줄을 그대로 찍는다 */
export const detailNone = style({ color: vars.ink.dim })

export const detailItemIcon = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 알 — 그림과 이름뿐이다 */
export const detailEgg = style({ fontSize: 21, fontWeight: 700, color: vars.ink.strong })

/** 기술 머리 + 2×2 줄. 말이 서면 이 블록이 빠진다 */
export const moves = style({ display: 'grid', gap: GAP.tight })

export const moveGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: `0 ${String(GAP.small)}px`,
})

// ── 빈 칸 · 머리 — 이 박스의 현황 ───────────────────────────────────────────

export const census = style({ display: 'flex', alignItems: 'center', gap: GAP.wide, paddingTop: GAP.small })

/** 칸 점유 지도 — 6×5 점. 찬 칸 `ink.dim` · 빈 칸 속 빈 원 · 커서 칸 금 고리 */
export const dots = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(6, 14px)',
  gap: 6,
  flex: '0 0 auto',
})

export const dot = style({ boxSizing: 'border-box', width: 14, height: 14, borderRadius: RADIUS.round })
export const dotFilled = style({ background: vars.ink.dim })
export const dotEmpty = style({ border: `2px solid ${vars.window.rule}` })
export const dotHere = style({ outline: `2px solid ${vars.pick.edge}`, outlineOffset: 1 })

export const censusText = style({ display: 'grid', gap: GAP.tight, minWidth: 0 })
export const censusName = style({ fontSize: 22, fontWeight: 700, color: vars.ink.strong })
export const censusLine = style({ fontSize: TEXT.small, color: vars.ink.normal, fontVariantNumeric: 'tabular-nums' })
export const censusDim = style({ fontSize: TEXT.small, color: vars.ink.dim, fontVariantNumeric: 'tabular-nums' })

// ── 말 ───────────────────────────────────────────────────────────────────────

/** 기둥 맨 아래의 롬 글 띠. 있을 때만 선다 (`MessageDock`의 `when`) */
export const say = style({ flex: '0 0 auto', cursor: 'pointer' })

// ── 갈래 창의 점프 항목 — 이름 ··· 채움 수 ───────────────────────────────────

/**
 * 항목 글 노드는 박스 이름뿐이다(하네스가 `textContent`를 읽는다). 채움 수는 `::after`가 `data-count`에서 그린다.
 * 가득 찬 박스는 `ink.dim`, 빈 박스는 `ink.faint`다
 */
export const jumpItem = style({
  display: 'flex',
  flex: '1 1 auto',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: GAP.small,
  minWidth: 0,
  '::after': {
    content: 'attr(data-count)',
    flex: '0 0 auto',
    fontSize: TEXT.small,
    fontWeight: 400,
    color: vars.ink.normal,
    fontVariantNumeric: 'tabular-nums',
  },
})
export const jumpFull = style({ '::after': { color: vars.ink.dim } })
export const jumpEmpty = style({ '::after': { color: vars.ink.faint } })

// ── 비교하기 (`PC_MODE_COMPARE`) ────────────────────────────────────────────

export const compare = style({ display: 'flex', flexDirection: 'column', gap: GAP.small, minHeight: 0 })

/** 두 마리의 그림 · 이름 — 가운데 틈을 두고 양쪽 */
export const compareHead = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: GAP.wide,
})

export const compareMon = style({ display: 'grid', justifyItems: 'center', gap: 2, minWidth: 0 })
export const compareArt = style({ width: 80, height: 80, objectFit: 'contain', imageRendering: 'pixelated' })
export const compareArtBlank = style({ width: 80, height: 80 })

/** 이름과 Lv를 한 줄에 */
export const compareLine = style({ display: 'flex', alignItems: 'baseline', gap: GAP.tight, maxWidth: '100%', minWidth: 0 })

export const compareName = style({
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const compareLevel = style({ fontSize: TEXT.small, color: vars.ink.dim, fontVariantNumeric: 'tabular-nums' })

/** 쪽 이름 둘 — 고른 쪽은 `ink.strong` + 금 밑줄 */
export const compareTabs = style({ display: 'flex', justifyContent: 'center', gap: GAP.wide })

export const compareTab = style({
  fontSize: TEXT.small,
  color: vars.ink.dim,
  paddingBottom: 2,
  borderBottom: '2px solid transparent',
})
export const compareTabOn = style({ color: vars.ink.strong, fontWeight: 700, borderBottomColor: vars.pick.edge })

export const compareRows = style({ display: 'flex', flexDirection: 'column', gap: 2 })

/** 능력치 한 줄 — 가운데 이름 + 양옆으로 퍼지는 막대 + 숫자 */
export const compareRow = style({
  display: 'grid',
  gridTemplateColumns: '30px minmax(0, 1fr) 44px minmax(0, 1fr) 30px',
  alignItems: 'center',
  gap: GAP.tight,
  height: 20,
  fontSize: TEXT.small,
})

export const compareLabel = style({ textAlign: 'center', fontSize: TEXT.tiny, color: vars.ink.dim })

export const compareValue = style({ fontVariantNumeric: 'tabular-nums', color: vars.ink.normal })
export const compareValueLeft = style({ textAlign: 'right' })

/** 이긴 쪽 — 굵기로도 말한다(색맹에도 읽힌다) */
export const compareWin = style({ fontWeight: 800, color: vars.ink.strong })

/** 막대 한 쪽 — 왼쪽은 오른쪽 끝 기준, 오른쪽은 왼쪽 끝 기준이다 */
export const compareTrack = style({ position: 'relative', height: 8, minWidth: 0 })
export const compareBarLeft = style({
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  background: vars.ink.faint,
  borderRadius: RADIUS.bar,
})
export const compareBarRight = style({
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  background: vars.ink.faint,
  borderRadius: RADIUS.bar,
})
export const compareBarWin = style({ background: vars.ink.strong })

export const compareMoves = style({ display: 'flex', flexDirection: 'column', gap: GAP.tight })
export const compareMoveRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 24px minmax(0, 1fr)',
  alignItems: 'center',
  gap: GAP.small,
  height: LINE.row,
})
export const compareMoveText = style({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: vars.ink.normal })
export const compareMoveLeft = style({ textAlign: 'right' })

export const compareNote = style({ fontSize: TEXT.small, color: vars.ink.dim, textAlign: 'center', paddingTop: GAP.tight })
