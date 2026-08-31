// 숫자 상수. 색이 아니라서 CSS 변수로 안 두는 것들 (DESIGN.md §2).
//
// ⚠️ **화면 파일에 숫자를 직접 적지 않는다.** 한때 모서리 값이 18가지였다
// (0·2·3·4·5·6·7·8·9·10·12·14·16·18·999·50%…). 파일마다 그때그때 골랐다는 뜻이고,
// 모아 놓으면 같은 게임의 화면으로 안 읽힌다.

/**
 * 모서리. **네 단뿐이다.**
 *
 * 원본 창은 폭의 4~5%가 반경이다 — 469px 창에 20px쯤(DESIGN.md §1.1). 우리
 * 창은 그보다 크므로 비율이 아니라 눈에 맞춘 고정값을 쓰되 단을 늘리지 않는다.
 *
 * ⚠️ **알약(999)이 없다.** 원작에 알약 UI가 없다.
 */
export const RADIUS = {
  /** 창·판 */
  window: 14,
  /** 창 안의 칸 — 목록 줄, 기술 칸 */
  cell: 7,
  /** 막대·작은 표식 */
  bar: 4,
  /** 동그란 것 (몬스터볼·상태 점). 물건이 실제로 둥근 자리에만 */
  round: '50%',
} as const

/** 테두리 굵기. 창은 굵고 안쪽 선은 가늘다 */
export const EDGE = {
  window: 3,
  bar: 2,
  rule: 1,
} as const

/** 여백. 8의 배수로 간다 — 자잘한 값이 섞이면 줄이 안 맞는다 */
export const GAP = {
  tight: 4,
  small: 8,
  base: 12,
  wide: 16,
  loose: 24,
} as const

/** 글자 크기 */
export const TEXT = {
  tiny: 12,
  small: 14,
  base: 16,
  list: 17,
  title: 20,
  big: 28,
} as const

/** 줄 높이 (px). 목록 줄 높이와 같아야 커서가 안 흔들린다 */
export const LINE = {
  row: 32,
  message: 30,
} as const

/**
 * 시간.
 *
 * ⚠️ **한 벌짜리 「팝인」을 모든 화면에 돌려쓰지 않는다.** 웹앱의 말투다.
 * 창은 원작처럼 **짧게 서기만** 한다 — 튀거나 회전하지 않는다.
 */
export const TIME = {
  open: '0.10s',
  fade: '0.18s',
  blink: '0.7s',
} as const

/**
 * 창 하나의 최대 크기.
 *
 * **창은 화면이 아니다** (DESIGN.md §5). 원작은 256×192 안에 전부 담는다.
 * 화면이 넓어지면 창이 커지는 게 아니라 여백이 커진다.
 */
export const SCREEN = {
  width: 1040,
  height: 648,
} as const
