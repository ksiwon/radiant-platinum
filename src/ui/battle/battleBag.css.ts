// 배틀 가방의 모양 (PLAN §7.8)
//
// ⚠️ **명령 메뉴 옆 칸에 알약을 세로로 쌓아 두었다.** 회복 도구를 열 종류쯤
// 들고 다니면 그 좁은 칸에 다 안 들어가고, 무엇을 고르는지도 아이콘 28픽셀로는
// 안 보였다. 원작 배틀 가방은 아래 화면을 통째로 쓰고 **한 쪽에 여섯 개**만
// 놓는다 (`BATTLE_POCKET_ITEMS_PER_PAGE`, 주머니 하나에 최대 36칸).
//
// 그래서 교체 화면과 같은 판을 쓴다 — 왼쪽에 목록, 오른쪽에 고른 것의 속사정.
// 도구를 고르고 나면 **같은 판 위에서** 파티 카드로 넘어간다(`PartyCards`).
//
// ⚠️ **덮개와 창은 교체 화면 것을 그대로 가져온다** (`switchScreen.css`).
// 여기서 다시 그리면 도구를 고르고 파티로 넘어가는 사이에 판이 바뀐다.
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW } from '../theme/window.css'
import { sheet as switchSheet } from './switchScreen.css'

/** 교체 화면과 같은 덮개. 두 화면이 같은 판 위에서 이어져야 한다 */
export const sheet = style([switchSheet, {
  gridTemplateColumns: 'minmax(320px, 38%) minmax(0, 1fr)',
}])

export const left = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small + 2,
  minHeight: 0,
})

// ── 주머니 넷 ────────────────────────────────────────────────────────────────
// 원작 배틀 가방은 **넷**이다 (`enum BattlePocketIndex`): 회복 · 상태 · 볼 ·
// 배틀용. PP 도구는 따로 있는 게 아니라 회복 칸에 같이 들어간다 —
// `sBattlePocketIndexes`가 PP 비트를 `RECOVER_HP_PP`로 보낸다

export const tabs = style({
  display: 'flex',
  gap: GAP.tight + 2,
  flex: '0 0 auto',
})

const tabBase = style({
  ...WINDOW,
  appearance: 'none',
  borderRadius: RADIUS.cell,
  padding: `5px ${GAP.base + 2}px`,
  font: 'inherit',
  fontSize: TEXT.small,
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'background 120ms linear, border-color 120ms linear',
})

export const tab = styleVariants({
  off: [tabBase, { opacity: 0.6 }],
  on: [tabBase, {
    borderColor: vars.pick.edge,
    background: vars.pick.face,
    color: vars.pick.text,
  }],
})

// ── 도구 목록 ────────────────────────────────────────────────────────────────

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight + 2,
  minHeight: 0,
})

export const row = style({
  ...WINDOW,
  position: 'relative',
  appearance: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
  width: '100%',
  textAlign: 'left',
  padding: `7px ${GAP.base}px`,
  font: 'inherit',
  cursor: 'pointer',
  transition: 'transform 120ms ease-out, border-color 120ms linear',
  selectors: {
    '&:hover:enabled': { transform: 'translateX(4px)' },
    '&:disabled': { cursor: 'default' },
  },
})

/** 고른 줄. 금 테두리가 커서를 대신한다 */
export const rowOn = style({
  ...PICKED,
  transform: 'translateX(4px)',
})

export const icon = style({ flex: '0 0 auto' })

export const label = style({
  fontSize: TEXT.base,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const count = style({
  marginLeft: 'auto',
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
  flex: '0 0 auto',
})

/** 쪽 표시. 원작도 여섯씩 끊어 넘긴다 */
export const pager = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 'auto',
  paddingTop: GAP.tight + 2,
  fontSize: TEXT.tiny,
  color: vars.ink.onDarkDim,
  fontVariantNumeric: 'tabular-nums',
})

export const empty = style({
  padding: `${GAP.wide + 2}px ${GAP.base + 2}px`,
  borderRadius: RADIUS.window,
  border: `1px dashed ${vars.window.rule}`,
  fontSize: TEXT.small,
  color: vars.ink.onDarkDim,
})

// ── 오른쪽: 고른 도구 ────────────────────────────────────────────────────────

export const detail = style({
  ...WINDOW,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  minWidth: 0,
  alignSelf: 'start',
  padding: GAP.wide,
})

/** 아이콘을 크게 세운다. 목록의 28픽셀로는 무엇을 고르는지가 안 보인다 */
export const hero = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base + 2,
  minWidth: 0,
})

export const heroName = style({
  fontSize: TEXT.title,
  fontWeight: 800,
  color: vars.ink.strong,
})

export const heroSub = style({
  marginTop: 2,
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
})

export const text = style({
  fontSize: TEXT.small,
  lineHeight: 1.6,
  whiteSpace: 'pre-line',
})

/** 맨 위 띠 — 지금 무엇을 하는 중인지 한 줄로 */
export const banner = style({
  margin: `-${GAP.wide}px -${GAP.wide}px 0`,
  padding: `${GAP.small + 2}px ${GAP.wide}px`,
  borderRadius: `${RADIUS.window - EDGE.window}px ${RADIUS.window - EDGE.window}px 0 0`,
  fontSize: TEXT.base,
  fontWeight: 800,
  color: vars.status.text,
})

export const bannerKind = styleVariants({
  ok: { background: vars.state.good },
  none: { background: vars.hp.empty },
})

// ── 기술 칸 고르기 — PP에이드·PP회복만 여기까지 온다 ──────────────────────────

export const moves = style({ display: 'grid', gap: GAP.tight + 2 })

export const move = style({
  appearance: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
  width: '100%',
  textAlign: 'left',
  padding: `${GAP.small}px ${GAP.base}px`,
  borderRadius: RADIUS.cell,
  border: `1px solid ${vars.window.rule}`,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  selectors: { '&:disabled': { opacity: 0.42, cursor: 'default' } },
})

export const moveOn = style({
  borderColor: vars.pick.edge,
  background: vars.pick.face,
  color: vars.pick.text,
})

export const pp = style({
  marginLeft: 'auto',
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 바닥의 키 안내. 단마다 누를 것이 달라서 화면이 직접 적는다 */
export const foot = style({
  gridColumn: '1 / -1',
  marginTop: 'auto',
  textAlign: 'right',
  fontSize: TEXT.tiny,
  color: vars.ink.onDarkDim,
})
