// 배틀 가방의 모양 (PLAN §7.8)
//
// ⚠️ **명령 메뉴 옆 칸에 알약을 세로로 쌓아 두었다.** 회복 도구를 열 종류쯤
// 들고 다니면 그 좁은 칸에 다 안 들어가고, 무엇을 고르는지도 아이콘 28픽셀로는
// 안 보였다. 원작 배틀 가방은 아래 화면을 통째로 쓰고 **한 쪽에 여섯 개**만
// 놓는다 (`BATTLE_POCKET_ITEMS_PER_PAGE`, 주머니 하나에 최대 36칸).
//
// 그래서 교체 화면과 같은 판을 쓴다 — 왼쪽에 목록, 오른쪽에 고른 것의 속사정.
// 도구를 고르고 나면 **같은 판 위에서** 파티 카드로 넘어간다(`PartyCards`).
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 교체 화면과 같은 덮개. 두 화면이 같은 판 위에서 이어져야 한다 */
export const sheet = style({
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(320px, 38%) minmax(0, 1fr)',
  gap: 22,
  padding: '26px 34px 22px',
  background:
    'linear-gradient(100deg, rgba(6,10,20,0.92) 0%, rgba(6,10,20,0.72) 55%,'
    + ' rgba(6,10,20,0.55) 100%)',
  backdropFilter: 'blur(3px)',
  zIndex: 3,
})

export const left = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minHeight: 0,
})

// ── 주머니 넷 ────────────────────────────────────────────────────────────────
// 원작 배틀 가방은 **넷**이다 (`enum BattlePocketIndex`): 회복 · 상태 · 볼 ·
// 배틀용. PP 도구는 따로 있는 게 아니라 회복 칸에 같이 들어간다 —
// `sBattlePocketIndexes`가 PP 비트를 `RECOVER_HP_PP`로 보낸다

export const tabs = style({
  display: 'flex',
  gap: 6,
  flex: '0 0 auto',
})

const tabBase = style({
  appearance: 'none',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 999,
  padding: '5px 14px',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  color: vars.panel.text,
  background: 'rgba(255,255,255,0.05)',
  cursor: 'pointer',
  transition: 'background 120ms linear, border-color 120ms linear',
})

export const tab = styleVariants({
  off: [tabBase, { opacity: 0.55 }],
  on: [tabBase, {
    opacity: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    background: 'rgba(255,255,255,0.16)',
    boxShadow: '0 3px 12px rgba(0,0,0,0.45)',
  }],
})

// ── 도구 목록 ────────────────────────────────────────────────────────────────

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minHeight: 0,
})

export const row = style({
  position: 'relative',
  appearance: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  textAlign: 'left',
  padding: '7px 12px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'linear-gradient(180deg, rgba(28,38,62,0.9), rgba(13,19,33,0.92))',
  color: vars.panel.text,
  font: 'inherit',
  cursor: 'pointer',
  transition: 'transform 120ms cubic-bezier(.2,.85,.3,1), border-color 120ms linear',
  selectors: {
    '&:hover:enabled': { transform: 'translateX(4px)' },
    '&:disabled': { cursor: 'default' },
  },
})

export const rowOn = style({
  borderColor: 'rgba(255,255,255,0.62)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.55), inset 3px 0 0 rgba(255,255,255,0.85)',
  transform: 'translateX(4px)',
})

export const icon = style({ flex: '0 0 auto' })

export const label = style({
  fontSize: 15,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const count = style({
  marginLeft: 'auto',
  fontSize: 13,
  opacity: 0.8,
  fontVariantNumeric: 'tabular-nums',
  flex: '0 0 auto',
})

/** 쪽 표시. 원작도 여섯씩 끊어 넘긴다 */
export const pager = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 'auto',
  paddingTop: 6,
  fontSize: 12,
  opacity: 0.7,
  fontVariantNumeric: 'tabular-nums',
})

export const empty = style({
  padding: '18px 14px',
  borderRadius: 14,
  border: '1px dashed rgba(255,255,255,0.16)',
  fontSize: 13,
  opacity: 0.45,
})

// ── 오른쪽: 고른 도구 ────────────────────────────────────────────────────────

export const detail = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
  alignSelf: 'start',
  padding: 16,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'linear-gradient(180deg, rgba(20,27,46,0.9), rgba(11,16,28,0.92))',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
})

/** 아이콘을 크게 세운다. 목록의 28픽셀로는 무엇을 고르는지가 안 보인다 */
export const hero = style({
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  minWidth: 0,
})

export const heroName = style({ fontSize: 20, fontWeight: 800 })
export const heroSub = style({ marginTop: 2, fontSize: 12, opacity: 0.7 })

export const text = style({
  fontSize: 13,
  lineHeight: 1.6,
  opacity: 0.88,
  whiteSpace: 'pre-line',
})

/** 맨 위 띠 — 지금 무엇을 하는 중인지 한 줄로 */
export const banner = style({
  margin: '-16px -16px 0',
  padding: '10px 16px',
  borderRadius: '18px 18px 0 0',
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: '0.02em',
})

export const bannerKind = styleVariants({
  ok: { background: 'rgba(60, 120, 90, 0.55)' },
  none: { background: 'rgba(90, 96, 110, 0.55)' },
})

// ── 기술 칸 고르기 — PP에이드·PP회복만 여기까지 온다 ──────────────────────────

export const moves = style({ display: 'grid', gap: 6 })

export const move = style({
  appearance: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  color: vars.panel.text,
  font: 'inherit',
  cursor: 'pointer',
  selectors: { '&:disabled': { opacity: 0.42, cursor: 'default' } },
})

export const moveOn = style({
  borderColor: 'rgba(255,255,255,0.6)',
  background: 'rgba(255,255,255,0.13)',
})

export const pp = style({
  marginLeft: 'auto',
  fontSize: 12,
  opacity: 0.85,
  fontVariantNumeric: 'tabular-nums',
})

/** 바닥의 키 안내. 단마다 누를 것이 달라서 화면이 직접 적는다 */
export const foot = style({
  gridColumn: '1 / -1',
  marginTop: 'auto',
  textAlign: 'right',
  fontSize: 12,
  opacity: 0.62,
})
