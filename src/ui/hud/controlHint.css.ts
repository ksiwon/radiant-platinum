// 조작 쪽지 — 화면 왼쪽 위에 접혀 있다가 펴진다.
//
// ⚠️ **판을 늘어놓지 않는다.** 접혀 있을 때는 글자 몇 자짜리 알약 하나고,
// 펴도 「키 → 무엇」 두 칸짜리 목록이다.
//
// ⚠️ **왼쪽 위다.** 아래는 대사창이 가로 760px로 가운데에 서는데, 960px 창에서는
// 그 왼쪽 끝이 100px이라 펼친 쪽지(215px)와 겹친다. 위는 가운데가 지역 이름표,
// 오른쪽이 포켓치고 **왼쪽은 비어 있다** (계기판은 `?dev=1`에서만 뜬다).
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/**
 * 계기판이 뜨는 자리만큼 내려가는 판.
 *
 * ⚠️ 계기판(`ui/hud/PerfOverlay`)도 왼쪽 위다. 그건 `?dev=1`에서만 뜨므로
 * 배포본에서는 안 겹치지만, 개발 중에는 쪽지가 그 위에 포개진다 — 그때만
 * 아래로 내린다 (실측으로 계기판이 110px쯤이다)
 */
export const DEV_TOP = 122

export const wrap = style({
  position: 'fixed',
  left: 14,
  top: 14,
  zIndex: 150,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
})

/** 접힌 알약. 눈에 걸리지 않게 흐리게 두고 손이 오면 또렷해진다 */
export const chip = style({
  pointerEvents: 'auto',
  cursor: 'pointer',
  border: `1px solid ${vars.panel.border}`,
  background: vars.panel.bg,
  color: vars.panel.text,
  borderRadius: 999,
  padding: '4px 11px',
  fontSize: 12,
  letterSpacing: '0.03em',
  opacity: 0.42,
  transition: 'opacity 160ms ease-out',
  ':hover': { opacity: 1 },
  ':focus-visible': { opacity: 1, outline: `2px solid ${vars.panel.border}` },
})

export const chipOpen = style([chip, { opacity: 0.9 }])

export const panel = style({
  pointerEvents: 'none',
  background: vars.panel.bg,
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 10,
  padding: '9px 12px',
  color: vars.panel.text,
  fontSize: 12,
  lineHeight: '19px',
  display: 'grid',
  // 키 칸은 내용만큼, 이름 칸은 남는 만큼
  gridTemplateColumns: 'auto auto',
  columnGap: 12,
  whiteSpace: 'nowrap',
})

/** 키 이름. 자판 글자라 살짝 다른 색으로 */
export const keys = style({
  // 키 이름을 또렷하게, 무엇인지는 한 겹 뒤로. 계기판 초록과 헷갈리지 않게
  // 판 글자색을 그대로 쓴다
  color: vars.panel.text,
  fontVariantNumeric: 'tabular-nums',
})

export const what = style({ opacity: 0.62 })
