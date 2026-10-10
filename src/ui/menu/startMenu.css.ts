// 시작 메뉴 — 오른쪽에 붙는 세로 레일 (SYSTEM §0 L1 붙는 창 · `start.md` §4).
//
// 필드는 왼쪽 절반이 그대로 보인다. 덮개는 오른쪽으로 갈수록 짙고(`scrimSide`), 레일 창은 `WINDOW` 한 벌이다.
// 목록 줄은 아이콘이 주인공이라 44(`LINE.rowTall`)로 키우고, 고른 것은 **레일 안 별도 요소 하나**(금 띠)가
// 미끄러진다(`pickBand` · `TIME.slide`). 줄에는 글자색과 굵기만 남는다.
//
// ⚠️ **창을 여기서 다시 그리지 않는다.** 한때 이 파일이 창 값을 손으로 베껴 그러데이션이 3단과 2단으로 갈라졌다.
// `WINDOW` · `POPOVER` · `pickBand`는 `theme/window.css`에서 온다.
//
// ⚠️ **엿보기(`peek`)는 `aria-hidden`이고 role이 없다.** 하네스가 문서의 첫 `[role="radiogroup"]`을 시작 메뉴로 읽고
// `[role="radiogroup"] [role="radio"]`를 메뉴 줄로 센다 — 엿보기가 거기 끼면 줄 수가 틀어진다.
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, ICON, LINE, NIB, RAIL, TEXT, TIME, frames } from '../theme/scale'
import {
  POPOVER, RULE, WINDOW, WINDOW_SMALL, caret, dockIn, pickBand, popoverSide, scrimSide,
} from '../theme/window.css'
import { OVERLAY_Z } from './menuChrome.css'

// ─────────────────────────────────────────────────────────────────
// 레이아웃 치수 — `StartMenu.tsx`가 엿보기 자리를 셈할 때도 이 값을 쓴다
// (`.css.ts`는 함수를 내보낼 수 없어 셈은 `StartMenu.tsx`의 `rowCenterY`가 한다)
// ─────────────────────────────────────────────────────────────────

/** 레일 창의 바깥 위 · 오른쪽 여백 */
export const RAIL_INSET = GAP.wide
/** 레일 창 테두리 (`EDGE.window`) */
export const RAIL_BORDER = EDGE.window
/** 머리 높이 (아래 `RULE` 한 줄 포함) */
export const HEAD_HEIGHT = 40
/** 줄 목록 안쪽 위 여백 */
export const LIST_PAD_Y = GAP.small - 2
/** 줄 목록 안쪽 좌우 여백 */
const LIST_PAD_X = GAP.small
/** 바닥 높이 */
const FOOT_HEIGHT = 32

/** 엿보기 창의 크기 (바깥 치수) */
export const PEEK = { width: 220, height: 104 } as const
/** 엿보기 창의 안쪽 폭 — 테두리(`EDGE.window`)와 좌우 안쪽 여백(`GAP.base`)을 뺀 것. 내용은 이 안에 선다 */
export const PEEK_INNER = PEEK.width - 2 * EDGE.window - 2 * GAP.base
/** 배지 여덟 칸 사이 간격 — `BadgeRail`의 `gap`(`GAP.tight`)과 같다 */
const PEEK_BADGE_GAPS = 7 * GAP.tight
/** 트레이너 카드 엿보기의 배지 한 칸 — 안쪽 폭에서 거꾸로 정한다(여덟 칸 + 틈 일곱이 안 넘친다) */
export const PEEK_BADGE = Math.floor((PEEK_INNER - PEEK_BADGE_GAPS) / 8)
/** 엿보기와 레일 사이 — 꼭지(`NIB`)가 튀어나오는 만큼과 숨 쉴 틈 */
const PEEK_GAP = NIB + 4

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
const peekIn = keyframes({
  from: { opacity: 0, transform: 'translateX(6px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

// ─────────────────────────────────────────────────────────────────
// 뿌리 · 덮개
// ─────────────────────────────────────────────────────────────────

/** 뿌리. 자리를 잡고(`fixed`) 아무것도 안 먹는다 — 화면을 가리기만 한다(층 검사 `menuLayer.test`) */
export const frame = style({
  position: 'fixed',
  inset: 0,
  zIndex: OVERLAY_Z,
  pointerEvents: 'none',
  fontFamily: vars.font.ui,
  userSelect: 'none',
})

/** 옆 덮개. 레일이 선 쪽만 옅게 덮는다. 열릴 때 같은 시간(`TIME.open`)에 페이드한다 */
export const scrim = style([scrimSide, {
  animation: `${fadeIn} ${TIME.open} ease-out`,
}])

// ─────────────────────────────────────────────────────────────────
// 레일 창
// ─────────────────────────────────────────────────────────────────

export const rail = style([dockIn, {
  ...WINDOW,
  position: 'absolute',
  top: RAIL_INSET,
  right: RAIL_INSET,
  width: RAIL.width,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
}])

/** 머리 — 왼쪽은 지명, 오른쪽은 게임 시각. 포켓치를 걷은 대신 그 시계를 여기로 옮겼다 */
export const head = style({
  flex: '0 0 auto',
  boxSizing: 'border-box',
  height: HEAD_HEIGHT,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: GAP.small,
  padding: `0 ${GAP.wide}px`,
  borderBottom: RULE,
})

export const place = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const clock = style({
  flex: '0 0 auto',
  marginLeft: 'auto',
  fontSize: TEXT.small,
  color: vars.ink.dim,
  fontVariantNumeric: 'tabular-nums',
})

/** 줄 목록 칸 — 띠가 이 안에서 미끄러진다 */
export const list = style({
  flex: '0 0 auto',
  padding: `${LIST_PAD_Y}px ${LIST_PAD_X}px`,
})

/** 띠와 줄이 같은 좌표계를 쓰는 칸. 띠는 `left/right: 0`이라 줄 폭과 같다 */
export const track = style({ position: 'relative' })

/** 금 띠 하나. 높이는 `bandAt`이 인라인으로 준다 */
export const band = pickBand.y

/** 띠 안 커서. 색은 글자에서 물려받는다 */
export const bandCaret = caret

export const row = style({
  position: 'relative',
  zIndex: 1,
  boxSizing: 'border-box',
  height: LINE.rowTall,
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base - 2,
  // 왼쪽은 띠 안 커서 자리다
  padding: `0 ${GAP.small}px 0 ${GAP.wide + 2}px`,
  fontSize: TEXT.list,
  color: vars.ink.normal,
  whiteSpace: 'nowrap',
})

/** 고른 줄은 글자색과 굵기만 바뀐다 — 띠는 줄이 아니라 별도 요소다 */
export const rowOn = style([row, {
  fontWeight: 700,
  color: vars.pick.text,
}])

export const label = style({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' })

// ─────────────────────────────────────────────────────────────────
// 아이콘 — 원작 부풂 1회 뒤 흔들림 되풀이 (30Hz 프레임, MENU_MEASURE §1.3)
// ─────────────────────────────────────────────────────────────────

/** 필드 태스크가 30Hz로 돈다 — 한 프레임이 60Hz 두 틱이다 */
const f30 = (n: number): string => frames(n * 2)

/** 부풂: 배율 1 → 1.1 → 1.3 → 1.1 → 1, 프레임 길이 1 · 3 · 3 · 3 · 1 (`startMenuIcons.json`의 `swell`) */
const SWELL_FRAMES = 11
const swell = keyframes({
  '0%': { transform: 'scale(1)' },
  [`${String((1 / SWELL_FRAMES) * 100)}%`]: { transform: 'scale(1.1)' },
  [`${String((4 / SWELL_FRAMES) * 100)}%`]: { transform: 'scale(1.3)' },
  [`${String((7 / SWELL_FRAMES) * 100)}%`]: { transform: 'scale(1.1)' },
  [`${String((10 / SWELL_FRAMES) * 100)}%`]: { transform: 'scale(1)' },
})

/** 흔들림: 0 → +4 → +8 → +10 → +8 → +4 → 0 → −4 → −8 → −10 → −8 → −4°, 2프레임씩 열두 칸 (`wiggle`) */
const WIGGLE_ANGLES = [0, 4, 8, 10, 8, 4, 0, -4, -8, -10, -8, -4]
const wiggle = keyframes(Object.fromEntries(
  WIGGLE_ANGLES.map((deg, i) => [
    `${String((i / WIGGLE_ANGLES.length) * 100)}%`,
    { transform: `rotate(${String(deg)}deg)` },
  ]),
))

/** 아이콘 한 칸. 크기와 그림은 `menuIcon`이 인라인으로 준다 */
export const icon = style({
  flex: '0 0 auto',
  width: ICON.cell,
  height: ICON.cell,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/**
 * 고른 줄의 아이콘 — `steps(1)`이라 프레임 사이를 보간하지 않는다(원작은 스프라이트 애니 프레임이다).
 * 원작 프레임 움직임이라 `prefers-reduced-motion`에서도 남기는 것이 규칙이지만(§3), 시작 메뉴 아이콘은
 * **계속 흔들리는** 것이라 줄이는 설정이면 끈다(`start.md` §4.6)
 */
export const iconLit = style({
  animation: `${swell} ${f30(SWELL_FRAMES)} steps(1, end) both,`
    + ` ${wiggle} ${f30(24)} steps(1, end) ${f30(SWELL_FRAMES)} infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

/** 공중날기 줄의 포켓몬 아이콘 — 안 고른 것은 회색으로 낮춘다(구운 그림이 아니라서 이것만 `filter`) */
export const iconGray = style({ filter: 'grayscale(1)' })

// ─────────────────────────────────────────────────────────────────
// 바닥
// ─────────────────────────────────────────────────────────────────

export const foot = style({
  flex: '0 0 auto',
  boxSizing: 'border-box',
  height: FOOT_HEIGHT,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: `0 ${GAP.wide}px`,
  borderTop: RULE,
  fontSize: TEXT.tiny,
  color: vars.ink.faint,
})

// ─────────────────────────────────────────────────────────────────
// 엿보기 — 고른 것의 실제 상태. 뜨는 창이고 레일 쪽으로 꼭지가 난다
// ─────────────────────────────────────────────────────────────────

/**
 * 창 자리는 `StartMenu.tsx`가 인라인 `top` · `--nib-at`으로 준다(고른 줄 가운데에 맞추고 화면 안으로 자른다).
 * 세로 움직임은 띠와 같은 시간이다
 */
export const peek = style([popoverSide.right, {
  ...POPOVER,
  width: PEEK.width,
  height: PEEK.height,
  right: RAIL_INSET + RAIL.width + PEEK_GAP,
  padding: `${GAP.small}px ${GAP.base}px`,
  display: 'flex',
  alignItems: 'center',
  animation: `${peekIn} ${TIME.open} ease-out`,
  transition: `top ${TIME.slide} ease-out`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: `${fadeIn} ${TIME.open} ease-out`, transition: 'none' },
  },
}])

/** 내용이 바뀔 때 0.10s 크로스페이드 — 창은 안 움직인다(§3 내용 교차) */
export const peekBody = style({
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base,
  animation: `${fadeIn} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
})

export const peekText = style({ display: 'flex', flexDirection: 'column', gap: GAP.tight, minWidth: 0 })
export const peekTitle = style({
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
export const peekSub = style({ fontSize: TEXT.small, color: vars.ink.dim, fontVariantNumeric: 'tabular-nums' })
export const peekStrong = style({ color: vars.ink.normal, fontWeight: 700 })

/** 이름표 ··· 값 한 줄 (도감 · 리포트) */
export const peekPairs = style({ flex: '1 1 auto', display: 'grid', rowGap: GAP.tight, minWidth: 0 })
export const peekPair = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: GAP.small,
  fontSize: TEXT.small,
  color: vars.ink.dim,
})
export const peekValue = style({
  fontSize: TEXT.list,
  fontWeight: 700,
  color: vars.ink.strong,
  fontVariantNumeric: 'tabular-nums',
})

/** 파티 여섯 — 3 × 2. 칸마다 아이콘 32와 작은 HP 막대 */
export const peekParty = style({
  flex: '1 1 auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  rowGap: GAP.small - 2,
  justifyItems: 'center',
})
export const peekMon = style({ display: 'grid', justifyItems: 'center', rowGap: 2, width: 44 })
export const peekMonBar = style({ width: ICON.cell + 4 })

/** 배지 줄 + 시간 (트레이너 카드) */
export const peekCol = style({ flex: '1 1 auto', display: 'grid', rowGap: GAP.small, justifyItems: 'center', minWidth: 0 })

// ─────────────────────────────────────────────────────────────────
// 남은 볼 창 — 사파리일 때만 (`start_menu.c`의 `StartMenu_PrintBallCount`, 타일 1,1 · 12×4)
// ─────────────────────────────────────────────────────────────────

export const balls = style({
  ...WINDOW_SMALL,
  position: 'absolute',
  top: RAIL_INSET,
  left: RAIL_INSET,
  width: 168,
  boxSizing: 'border-box',
  padding: `${GAP.small}px ${GAP.base}px`,
  display: 'grid',
  rowGap: GAP.tight,
  fontSize: TEXT.list,
  color: vars.ink.strong,
  animation: `${fadeIn} ${TIME.open} ease-out`,
})

export const ballCount = style({ fontWeight: 700, fontVariantNumeric: 'tabular-nums' })
