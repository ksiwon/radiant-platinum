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
  /** 아이콘 32를 세우는 줄 — 시작 · 팩토리 · 메일박스 · 진화 기술 창 */
  rowTall: 44,
  /** `MessageDock` 한 줄 (Galmuri11 17 / 26 — 롬 글 띠) */
  dock: 26,
} as const

/** 도트 그림 한 칸 (아틀라스 한 칸의 원본 크기). `pixelSprite`가 이 값에 정수배만 곱한다 */
export const ICON = {
  cell: 32,
} as const

/**
 * 도트 배율. **정수만 쓴다** — 1.5배(교환 아이콘 48)와 2.2배(가이드맵)는 없다.
 * 줄이는 것은 박스 필름 썸네일(`wallThumb`) 한 곳만 허용하고 부드럽게 줄인다
 */
export const PIXEL = { x1: 1, x2: 2, x3: 3, x4: 4 } as const
export type PixelScale = (typeof PIXEL)[keyof typeof PIXEL]

/**
 * 배틀 명령 판의 기울기(도). 메뉴는 기울이지 않는다 — 이 각은 배틀 명령 구역의 판
 * (`TYPE_PLATE` · `command.css`의 `button`)에만 쓴다 (SYSTEM §0)
 */
export const SKEW_DEG = 9

/** 붙는 창(시작 메뉴)의 폭 */
export const RAIL = { width: 264 } as const

/** 뜨는 창의 꼭지(`POPOVER`) */
export const NIB = 8

/**
 * 배틀 구획 (SYSTEM 4.15 · 4.16). `cmdHeight`는 `--battle-cmd-h`로 내보낸다
 * (battlehud ↔ moves 계약) — 명령 구역의 단은 모두 이 높이 안에 든다.
 *
 * 값은 설계서가 정했고 아직 화면에서 재지 않았다. 쓰는 꾸러미(P5 · P11)가 잰 뒤에 고친다
 */
export const HUD = {
  edge: 32,
  bottom: 24,
  cmdHeight: 264,
  plateFoe: 280,
  plateMine: 312,
  plateDouble: 288,
  tray: 28,
  inward: 12,
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
  /** 닫힘 */
  close: '0.08s',
  /** 띠 · 밑줄 · 커서(지도 · 박스 격자 포함) */
  slide: '0.10s',
  /** 쪽 · 주머니 · 탭이 바뀔 때 본문이 8px 밀리는 것, 지도 이동, 이름표 · 글 묶음 페이드 */
  page: '0.14s',
} as const

/**
 * 원작 프레임(60fps)으로 잰 움직임의 시간. `steps(1)`과 같이 쓴다.
 * `frames(8)`은 `'0.1333s'`처럼 초 단위 문자열이라 CSS `animation`에 그대로 들어간다
 */
export function frames(n: number): string {
  return `${String(Math.round((n / 60) * 1e4) / 1e4)}s`
}

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
