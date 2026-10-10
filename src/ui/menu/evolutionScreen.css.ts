// 진화 · 부화 장면의 판 (`evolution` 설계 §4).
//
// 이 화면은 **창이 아니라 장면**이다 — 3D 몸이 주인공이고 DOM에는 띠 · 막 · 이름표 · 대사창 · 기술 창뿐이다.
// 층 (아래에서 위로):
//
//   0 영속 Canvas (3D)  — 몸 · 알 · 입자 · 바닥 고리 · 빛
//   1 가림 띠 (위 · 아래) — `scrim.black`. 진화는 화면의 20.8%(40/192줄), 부화는 위 32줄 · 아래 48줄
//   2 흰 막              — `scrim.white`
//   3 이름표              — 어두운 무대 위 글, 위에서 56px
//   4 기술 창             — 오른쪽 36px · 폭 392 (뜨는 창)
//   5 대사창              — 필드 것과 같은 창 (`MessageWindow`). 아래 24px
//   6 예/아니오           — 대사창 위 오른쪽 끝
//   7 검은 막             — 장면이 끝날 때 16프레임
//
// ⚠️ **원작 값은 그대로다** — 띠 · 막의 시간은 `engine/pokemon/{evolution,hatch}Beat`가 정하고 여기는 그 값을 칠할 뿐이다.
// 여기서 정하는 것은 DOM 페이드 둘(X 안내 0.10s · 이름표 `TIME.page`)과 검은 막뿐이다.
import { globalStyle, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, LINE, TEXT, frames } from '../theme/scale'
import { RULE, WINDOW } from '../theme/window.css'

/** 필드 대사창의 최대 폭 (`field/messageBox.css`의 `MAX_WIDTH`와 같다) */
const DOCK_MAX = 760

/**
 * 뒤의 영속 Canvas가 그리는 3D 무대 창 — 투명하다 (`menuChrome`의 `cinematicScreen`이 가리키는 이름).
 * 무대는 상자가 아니라 캔버스 전체에 그려지므로 이 상자는 **자리를 안 잡는다**: 화면이 이 자리를 쓰는 곳은 없고,
 * 이름만 남겨 둔다 (SYSTEM §5 P15 「`cinematicSpace`는 남긴다」)
 */
export const cinematicSpace = style({
  position: 'relative',
  width: 'min(520px, 78vw)',
  height: 'min(420px, 52vh)',
  pointerEvents: 'none',
})

/** 장면 한 장 — 연출 창(`cinematicScreen`)을 가득 채운다. 3D는 뒤의 영속 Canvas가 그리므로 여기는 비어 있다 */
export const stage = style({
  position: 'relative',
  flex: '1 1 auto',
  minHeight: 0,
  pointerEvents: 'none',
})

/**
 * 띠와 막이 서는 층 — **화면 전체**다.
 *
 * ⚠️ **무대 상자만 덮으면 안 된다.** 처음에 520×333 안에 두었더니 흰 막이 화면 한복판의 **네모난 흰 자국**으로
 * 보였다 — 원작은 팔레트를 통째로 미는 것이라 글도 배경도 같이 하얘진다. 3D 무대도 창 하나가 아니라 캔버스 전체에
 * 그려지므로, 원작 화면에 해당하는 것은 **창**이다
 */
export const screenFrame = style({
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
})

/**
 * 위아래를 가리는 띠 (`evolution.c`의 `windowTop`/`windowBottom`).
 *
 * 원작은 하드웨어 창 레지스터로 화면을 잘라내고 프레임마다 두 줄씩 좁힌다 (PARITY §3.1). 높이는 프레임마다
 * 화면에서 `ref`로 민다
 */
export const clampBar = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: 0,
  background: vars.scrim.black,
  pointerEvents: 'none',
})

export const clampTop = style({ top: 0 })
export const clampBottom = style({ bottom: 0 })

/**
 * 화면을 덮는 흰 막. 원작이 팔레트를 통째로 흰색으로 민다 — 배경도 몸도 같이 하얘지므로 막이 맞다
 */
export const veil = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.white,
  opacity: 0,
  pointerEvents: 'none',
})

/**
 * 장면이 **검게** 끝난다 — 진화는 `NO_MOVE_TO_LEARN`, 부화는 이름 짓기로 넘기기 전 (`egg_hatch/main.c:201-208`) 16걸음.
 * 흰 막으로 끝나는 진화 연출 자체와 다르다. 입력을 막지 않는다
 */
export const blackVeil = style({
  position: 'absolute',
  inset: 0,
  background: vars.scrim.black,
  opacity: 0,
  pointerEvents: 'none',
  transition: `opacity ${frames(16)} linear`,
})
export const blackVeilOn = style({ opacity: 1 })

/**
 * 위 띠 안 오른쪽 — X 안내. **멈출 수 있는 구간에서만** 뜬다 (교대 40~242프레임 · 레벨 진화). 띠가 어두운 판이므로
 * 키캡은 `tone="dark"`다. 켜고 끄는 것은 프레임마다 `ref`로 한다 (`EvolutionFrame`)
 */
export const hint = style({
  position: 'absolute',
  right: GAP.loose,
  top: 0,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  fontSize: TEXT.small,
  color: vars.ink.onDark,
  opacity: 0,
  transition: `opacity 0.10s ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
})

/** 이름표 자리 — 창이 아니라 어두운 무대 위 글이다. 위에서 56px, 가운데 */
export const plate = style({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 56,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
})

/**
 * 대사창 — 필드 대사창(`field/messageBox.css`)과 같은 두 줄 창(`MessageWindow`)이 아래 가운데에 선다.
 * 폭은 필드와 같은 상한(760)이고 좌우 100씩 비운다
 */
export const dock = style({
  position: 'absolute',
  left: 100,
  right: 100,
  bottom: GAP.loose,
  maxWidth: DOCK_MAX,
  marginInline: 'auto',
  pointerEvents: 'auto',
})

/** 예/아니오 — 대사창 위 오른쪽 끝에 붙는다 (`egg_hatch/main.c:170` 타일 25,13 · 6×4). `MessageWindow`의 `yesNo` 칸에 든다 */
export const yesNoSlot = style({
  position: 'absolute',
  right: 0,
  bottom: `calc(100% + ${String(GAP.small)}px)`,
})

// ─────────────────────────────────────────────────────────────────
// 기술 창 (뜨는 창) — 기술을 배울 때 오른쪽에 열린다. 몸은 왼쪽으로 비켜 선다 (`cinematicStore.bodyShift`)
// ─────────────────────────────────────────────────────────────────

export const panel = style({
  ...WINDOW,
  position: 'absolute',
  right: 36,
  top: 70,
  width: 392,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  pointerEvents: 'auto',
  fontFamily: vars.font.ui,
})

/** 새 기술 한 덩어리 — 이름 위에 타입 그림, 아래에 분류 · 위력 · 명중 · PP와 설명 */
export const panelHead = style({
  flex: '0 0 auto',
  display: 'grid',
  gap: GAP.tight,
  padding: `${GAP.base}px ${GAP.wide}px`,
  borderBottom: RULE,
})

export const newMove = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  minWidth: 0,
  fontSize: TEXT.title,
  fontWeight: 700,
  color: vars.ink.strong,
})

/** 잊을 기술 줄의 머리 — 위력 · 명중 · PP 이름표. 줄과 같은 열이다 */
export const colHead = style({
  flex: '0 0 auto',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) repeat(3, max-content)',
  columnGap: GAP.base,
  // 줄의 안쪽 여백과 같다 — 줄 왼쪽은 커서 자리(`GAP.loose`)와 목록 안쪽, 오른쪽은 줄의 오른쪽 여백과 목록 안쪽
  padding: `${GAP.small}px ${GAP.small + GAP.base}px 0 ${GAP.small + GAP.loose}px`,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})
export const colHeadNum = style({ minWidth: 32, textAlign: 'right' })

export const rows = style({
  position: 'relative',
  flex: '0 0 auto',
  padding: `${GAP.tight}px ${GAP.small}px ${GAP.small}px`,
})

/** 한 줄 — 고른 줄은 띠 위에서 `pick.text`로 선다 (`pickBand`가 금 면을 깐다) */
export const row = style({ position: 'relative', zIndex: 1, height: LINE.rowTall })
export const rowOn = style({ position: 'relative', zIndex: 1, height: LINE.rowTall, color: vars.pick.text, fontWeight: 700 })

globalStyle(`${row} > button, ${rowOn} > button`, {
  height: LINE.rowTall,
  // 커서 자리 (`caret`이 앉는다)
  paddingLeft: GAP.loose,
  paddingRight: GAP.base,
  cursor: 'pointer',
})

/** 꼬리 칸 — 배우려던 기술과 「그만둔다」 (롬 3:59) */
export const tailLabel = style({ fontSize: TEXT.small, color: 'inherit', textAlign: 'right' })

export const panelFoot = style({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: GAP.wide,
  height: 28,
  padding: `0 ${GAP.wide}px`,
  borderTop: RULE,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})
