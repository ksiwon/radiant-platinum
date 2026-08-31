// 배틀 교체 화면의 모양 (PLAN §2.5)
//
// 원작(BDSP)의 교체 화면은 **왼쪽에 파티, 오른쪽에 그 한 마리의 속사정**이다.
// 우리 것은 오래 명령 메뉴와 같은 알약 여섯 개였는데, 그러면 "누구를 내보낼까"를
// 정할 근거가 화면에 하나도 없다 — 체력도 타입도 기술도 안 보이니 이름만 보고
// 고르게 된다.
//
// ⚠️ **창은 여기서 안 그린다** (DESIGN.md §3). 한때 이 화면이 자기 유리 카드와
// 자기 HP 색표를 들고 있었다 — 같은 체력이 배틀과 파티와 여기서 다른 색이었다.
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { BAR_FILL, BAR_TRACK, PICKED, STATUS_TAG, WINDOW } from '../theme/window.css'

/** 무대 위에 통째로 덮는다. 고르는 동안은 배틀 화면이 아니라 이 화면이다 */
export const sheet = style({
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(300px, 34%) minmax(0, 1fr)',
  gap: GAP.loose - 2,
  padding: `${GAP.loose + 2}px ${GAP.loose + 10}px ${GAP.loose - 2}px`,
  // 무대가 비쳐야 여기가 배틀 위라는 것이 남는다. 완전히 가리면 장면이 끊긴다
  background: vars.scrim.deep,
  zIndex: 3,
})

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
  overflowY: 'auto',
  scrollbarWidth: 'thin',
  paddingRight: GAP.tight,
})

/**
 * 파티 한 칸.
 *
 * 기운 명령 칸과 **일부러 다르게** 반듯한 창이다 — 저기는 "지금 무엇을 할까"고
 * 여기는 "누구인가"다. 같은 모양이면 두 화면이 겹쳐 보인다
 */
export const card = style({
  ...WINDOW,
  position: 'relative',
  appearance: 'none',
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: `${GAP.small + 1}px ${GAP.base + 2}px ${GAP.small + 2}px`,
  font: 'inherit',
  cursor: 'pointer',
  transition: 'transform 120ms ease-out, border-color 120ms linear',
  selectors: {
    '&:hover:enabled': { transform: 'translateX(4px)' },
    '&:disabled': { cursor: 'default' },
  },
})

/** 고른 칸. 금 테두리가 커서를 대신한다 */
export const cardOn = style({
  ...PICKED,
  transform: 'translateX(4px)',
})

/** 못 내보내는 칸 — 쓰러졌거나 이미 나와 있다 */
export const cardOut = style({ opacity: 0.46 })

/** 지금 나와 있는 칸. 흐리게 두되 나와 있다는 표시는 남긴다 */
export const cardHere = style({
  borderColor: vars.state.good,
})

export const cardTop = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.tight + 2,
})

export const name = style({
  fontSize: TEXT.base,
  fontWeight: 800,
  color: vars.ink.strong,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const level = style({
  marginLeft: 'auto',
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  fontWeight: 700,
  flex: '0 0 auto',
})

/** 막대의 홈. 짙은 테두리 안에 흰 바탕 — 원작 구조다 (DESIGN.md §1.3) */
export const bar = style({
  marginTop: GAP.tight + 2,
  height: 9,
  ...BAR_TRACK,
})

export const fill = style({
  ...BAR_FILL,
  transition: 'width 180ms linear',
})

export const numbers = style({
  marginTop: 3,
  display: 'flex',
  alignItems: 'center',
  gap: GAP.tight + 2,
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 상태이상·기절 딱지. 배틀·파티와 **같은 것**이다 */
export const tag = style(STATUS_TAG)

// ── 오른쪽: 고른 한 마리의 속사정 ────────────────────────────────────────────

export const detail = style({
  ...WINDOW,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.base,
  minWidth: 0,
  alignSelf: 'start',
  padding: GAP.wide,
})

/** 맨 위 띠 — 내보낼 수 있는지를 한 줄로 말한다 */
export const banner = style({
  margin: `-${GAP.wide}px -${GAP.wide}px 0`,
  padding: `${GAP.small + 2}px ${GAP.wide}px`,
  borderRadius: `${RADIUS.window - EDGE.window}px ${RADIUS.window - EDGE.window}px 0 0`,
  fontSize: TEXT.base,
  fontWeight: 800,
  color: vars.ink.onTint,
})

export const bannerKind = styleVariants({
  ok: { background: vars.state.good },
  here: { background: vars.window.edgeDim },
  down: { background: vars.state.bad },
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
  minWidth: 0,
})

export const rowLabel = style({
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.ink.dim,
  flex: '0 0 44px',
})

/** 타입 조각. 색은 기술 칸과 같은 표에서 온다 (`typeColor`) */
export const typeChip = style({
  padding: '2px 10px',
  border: `1px solid ${vars.bar.edge}`,
  borderRadius: RADIUS.bar,
  fontSize: TEXT.tiny,
  fontWeight: 800,
  color: vars.ink.onTint,
  background: `var(--tint, ${vars.window.edge})`,
})

export const moves = style({
  display: 'grid',
  gap: 5,
})

export const move = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
  padding: `5px ${GAP.small + 2}px`,
  borderRadius: RADIUS.bar,
  boxShadow: `inset 0 0 0 1px ${vars.window.rule}`,
  minWidth: 0,
})

export const moveName = style({
  fontSize: TEXT.small,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const pp = style({
  marginLeft: 'auto',
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
  flex: '0 0 auto',
})

/**
 * 상대에게 얼마나 통하는가.
 *
 * ⚠️ **판정이 아니라 귀띔이다.** 실제 배틀 계산은 sim이 하고, 여기 뜨는 것은
 * 그 한 수가 상대의 타입에 몇 배인지를 우리 표로 미리 재 본 값이다
 * (`ai/typeChart`). 원작 교체 화면에도 같은 글이 뜬다
 */
const hintBase = { fontWeight: 800, fontSize: TEXT.tiny, flex: '0 0 auto' } as const

export const hint = styleVariants({
  super: { ...hintBase, color: vars.match.superEff },
  weak: { ...hintBase, color: vars.match.resisted },
  none: { ...hintBase, color: vars.ink.faint },
})

export const ability = style({
  padding: `${GAP.small + 1}px ${GAP.base}px`,
  borderRadius: RADIUS.bar,
  boxShadow: `inset 0 0 0 1px ${vars.window.rule}`,
})

export const abilityName = style({ fontSize: TEXT.small, fontWeight: 800 })

export const abilityText = style({
  marginTop: 3,
  fontSize: TEXT.tiny,
  lineHeight: 1.5,
  color: vars.ink.dim,
  whiteSpace: 'pre-line',
})

export const empty = style({
  padding: `${GAP.wide + 2}px ${GAP.base + 2}px`,
  borderRadius: RADIUS.window,
  border: `1px dashed ${vars.window.rule}`,
  fontSize: TEXT.small,
  color: vars.ink.faint,
})
