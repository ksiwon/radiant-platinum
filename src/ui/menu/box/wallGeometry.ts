// 박스 벽지 그림의 치수 — **상수뿐이다** (`boxScreen.css.ts`가 불러 쓰므로 다른 모듈을 끌어오지 않는다).
//
// 셈은 `boxMenus.ts`의 `fitGrid`가 한다. 여기는 벽지 그림을 잰 값만 둔다.

/**
 * 벽지 한 장 (`boxWallpapers.png`의 한 칸, 원본 px).
 *
 * 안쪽 틀은 **서른두 장이 모두 같다** — 어두운 테두리(115,115,132)가 가로로 x 3~4 · 163~164, 세로로 y 35~36 · 155~156에
 * 선다(이름 띠는 x 26~141 · y 9~31). 테두리 안쪽(빛 · 그늘 가장자리 포함)이 격자가 앉는 자리다
 */
export const WALL = {
  /** 원본 그림 크기 */
  w: 168,
  h: 160,
  /** 화면 배율. 벽지는 늘 정수 3배다 */
  k: 3,
  /** 테두리 안쪽 — 격자가 앉을 수 있는 자리 */
  inner: { x: 5, y: 37, w: 158, h: 118 },
  /** 이름 띠 (테두리 포함) */
  banner: { x: 26, y: 9, w: 116, h: 23 },
} as const

/** 화면 px로 옮긴 벽지의 자리들 */
export const WALL_PX = {
  w: WALL.w * WALL.k,
  h: WALL.h * WALL.k,
  inner: {
    x: WALL.inner.x * WALL.k, y: WALL.inner.y * WALL.k, w: WALL.inner.w * WALL.k, h: WALL.inner.h * WALL.k,
  },
  banner: {
    x: WALL.banner.x * WALL.k, y: WALL.banner.y * WALL.k, w: WALL.banner.w * WALL.k, h: WALL.banner.h * WALL.k,
  },
} as const


/**
 * 파티 칸 한 장의 세로 구성 (px). 위에서 아래로 여백 → 아이콘 → 이름줄 → 체력 막대 → 여백이고, 이 합이 칸 높이 안에 든다 —
 * 아이콘은 이름 · 막대와 겹치지 않는다 (DECISIONS 사용자 지적 ③). 위 여백(`top`)은 아이콘이 뛰는 폭(위로 3 × 배율 2 = 6)이다
 */
export const PARTY_CELL = { height: 98, top: 6, gap: 2, icon: 64, name: 16, bar: 5, bottom: 2 } as const
