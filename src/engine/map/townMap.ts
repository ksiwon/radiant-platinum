// 타운맵 — 신오 지도의 격자 (PARITY §5 · `applications/town_map`)
//
// 지도는 **격자 하나가 맵 행렬 한 칸**이다. 원작 주석이 그렇게 적어 두었다 —
// 날 수 있는 곳의 화면 좌표가 "행렬 0의 칸 번호 × 간격"으로 되어 있다.
//
// 커서는 그 격자를 한 칸씩 움직이고, 커서가 선 칸이 날 수 있는 곳이면
// 그 표식이 깜빡인다 (`TownMap_UpdateHoveredFlyLocation`). 목록에서 고르는
// 것이 아니라 **지도 위에서** 고르는 것이 원작이다.

/** `TOWN_MAP_GRID_SPACING` (`applications/town_map/defs.h`) */
export const GRID = 7
/** `TOWN_MAP_GRID_X_OFFSET` · `TOWN_MAP_GRID_Y_OFFSET` */
const GRID_X0 = 25
const GRID_Y0 = -34

/** 격자 칸 → 지도 그림 안의 픽셀 */
export function gridX(x: number): number {
  return GRID * x + GRID_X0
}
export function gridY(z: number): number {
  return GRID * z + GRID_Y0
}

/**
 * 날 수 있는 곳 표식의 모양 (`enum TownMapFlyLocationShape`).
 *
 * 도시는 두 칸을 차지하고 마을은 한 칸이다. 모양이 다르면 표식 크기가 달라서,
 * 다 같은 네모로 그리면 무성시티가 떡잎마을만 해진다
 */
const FlyShape = {
  SQUARE_1X1: 0,
  VERTICAL: 1,
  SQUARE_2X2: 2,
  TOP_LEFT_ANGLE: 3,
  TOP_RIGHT_ANGLE: 4,
  HORIZONTAL: 5,
  SMALL_RECTANGLE: 6,
} as const
type FlyShapeId = (typeof FlyShape)[keyof typeof FlyShape]

/** 모양별 표식 크기 (픽셀). 한 칸이 7px이고 두 칸짜리는 그 두 배 남짓이다 */
export const SHAPE_SIZE: Readonly<Record<number, readonly [number, number]>> = {
  [FlyShape.SQUARE_1X1]: [7, 7],
  [FlyShape.VERTICAL]: [7, 14],
  [FlyShape.SQUARE_2X2]: [14, 14],
  [FlyShape.TOP_LEFT_ANGLE]: [14, 14],
  [FlyShape.TOP_RIGHT_ANGLE]: [14, 14],
  [FlyShape.HORIZONTAL]: [14, 7],
  [FlyShape.SMALL_RECTANGLE]: [7, 4],
}

/**
 * 날 수 있는 곳 스물 (`sFlyLocations`).
 *
 * `x`·`z`는 격자 칸이고 `dx`·`dy`는 그 위에서 더 미는 픽셀이다 — 원작 표가
 * `9 * TOWN_MAP_GRID_SPACING + 3`처럼 적어 둔 그 `+3`이다. 둘로 갈라 두면
 * 커서 판정(칸)과 그림(픽셀)이 같은 값을 두 뜻으로 안 쓴다.
 *
 * ⚠️ **포켓몬리그가 두 줄이다.** 같은 맵 번호에 챔피언로드 앞과 리그 정문이
 * 따로 있고, 원작은 커서 칸으로 가른다 (`specialFlyLocationID`). 맵 번호로
 * 접으면 둘 중 하나가 사라진다
 */
interface FlySpot {
  /**
   * `spawns.json`의 몇 번째 자리인가.
   *
   * 맵 번호로 잇지 않는 까닭이 있다 — **포켓몬리그가 두 줄인데 맵 번호가 같다.**
   * 챔피언로드 앞(14)과 리그 정문(19)이 내리는 자리가 다르고, 원작도 커서 칸으로
   * 가른다. 번호로 접으면 둘 중 하나로만 날게 된다
   */
  spawn: number
  /** 맵 헤더 번호. `spawns.json`의 `fly.map`과 같아야 한다 (시험이 지킨다) */
  map: number
  x: number
  z: number
  dx: number
  dy: number
  shape: FlyShapeId
  /** 붉은 표식(도시)인가. 거짓이면 파랑(마을) */
  city: boolean
}

export const FLY_SPOTS: readonly FlySpot[] = [
  { spawn: 0, map: 411, x: 3, z: 27, dx: 0, dy: 0, shape: FlyShape.SQUARE_1X1, city: false },
  { spawn: 1, map: 418, x: 5, z: 26, dx: 0, dy: 0, shape: FlyShape.SQUARE_1X1, city: false },
  { spawn: 2, map: 426, x: 5, z: 19, dx: 0, dy: 3, shape: FlyShape.VERTICAL, city: false },
  { spawn: 3, map: 433, x: 17, z: 20, dx: 3, dy: 0, shape: FlyShape.HORIZONTAL, city: false },
  { spawn: 4, map: 442, x: 14, z: 16, dx: 0, dy: 0, shape: FlyShape.SQUARE_1X1, city: false },
  { spawn: 16, map: 450, x: 20, z: 10, dx: 0, dy: 0, shape: FlyShape.SQUARE_1X1, city: false },
  { spawn: 17, map: 457, x: 25, z: 14, dx: 0, dy: 0, shape: FlyShape.SQUARE_1X1, city: false },
  { spawn: 5, map: 3, x: 4, z: 23, dx: 3, dy: 3, shape: FlyShape.SQUARE_2X2, city: true },
  { spawn: 6, map: 33, x: 1, z: 22, dx: 0, dy: 3, shape: FlyShape.VERTICAL, city: true },
  { spawn: 7, map: 45, x: 8, z: 23, dx: 4, dy: 3, shape: FlyShape.TOP_RIGHT_ANGLE, city: true },
  { spawn: 8, map: 65, x: 9, z: 16, dx: 3, dy: 3, shape: FlyShape.TOP_LEFT_ANGLE, city: true },
  { spawn: 9, map: 86, x: 14, z: 21, dx: 3, dy: 3, shape: FlyShape.SQUARE_2X2, city: true },
  { spawn: 10, map: 120, x: 18, z: 25, dx: 3, dy: 3, shape: FlyShape.SQUARE_2X2, city: true },
  { spawn: 11, map: 132, x: 21, z: 18, dx: 3, dy: 3, shape: FlyShape.SQUARE_2X2, city: true },
  { spawn: 12, map: 150, x: 26, z: 23, dx: 3, dy: 3, shape: FlyShape.SQUARE_2X2, city: true },
  { spawn: 13, map: 165, x: 11, z: 6, dx: 0, dy: 3, shape: FlyShape.VERTICAL, city: true },
  { spawn: 15, map: 188, x: 19, z: 13, dx: 4, dy: 0, shape: FlyShape.HORIZONTAL, city: true },
  // 아래 셋은 `specialFlyLocationID`가 칸을 못 박아 둔 자리다 — 맵이 여러 칸에
  // 걸쳐 있어도 이 한 칸에서만 날 수 있다
  { spawn: 18, map: 392, x: 9, z: 28, dx: 0, dy: 0, shape: FlyShape.SMALL_RECTANGLE, city: true },
  { spawn: 14, map: 172, x: 26, z: 18, dx: 0, dy: 0, shape: FlyShape.SMALL_RECTANGLE, city: true },
  { spawn: 19, map: 172, x: 26, z: 17, dx: 0, dy: 0, shape: FlyShape.SQUARE_1X1, city: true },
]

/** 격자가 도는 범위. 지도 그림(32×24타일) 안에 들어가는 칸까지다 */
export const GRID_MIN_X = 0
export const GRID_MAX_X = 30
export const GRID_MIN_Z = 4
export const GRID_MAX_Z = 30

/**
 * 커서가 선 칸에서 날 수 있는 곳 (`TownMap_GetFlyLocationAtPos`).
 *
 * ⚠️ **칸이 아니라 맵으로 찾는다.** 도시는 격자 네 칸을 차지하는데 표식은 한
 * 칸에만 적혀 있다 — 칸으로 견주면 도시 안 세 칸에서는 못 난다. 원작도
 * `mapHeader`로 찾고, **딱 세 곳만** 칸을 못 박아 둔다(팔파크·챔피언로드·리그).
 * 그 셋은 맵이 여러 칸에 걸쳐 있는데 날 수 있는 자리가 한 칸뿐이라서다
 */
export function flySpotAt(map: number, x: number, z: number): FlySpot | null {
  for (const s of FLY_SPOTS) {
    if (s.map !== map) continue
    if (EXACT_CELL.has(s.map) && !(s.x === x && s.z === z)) continue
    return s
  }
  return null
}

/** 칸까지 맞아야 하는 맵 — 221번도로(팔파크)와 포켓몬리그 둘 */
const EXACT_CELL = new Set([392, 172])

/** 타운맵 격자 한 칸이 어느 곳인가 (`tmap_block.dat`) */
export interface TownMapCell {
  x: number
  z: number
  /** `TEXT_BANK_TOWN_MAP`의 설명 글 번호. **이름이 아니다** */
  area: number
  /** 그 안의 이름난 자리 설명. ⚠️ 없으면 **65535**다 */
  landmark: number
  /** 0이 아니면 그 깃발을 세워야 보인다 */
  hidden: number
  /** 이 칸에 놓인 맵의 헤더 번호 (행렬 0) */
  map: number
  /** 지역명 번호 (`names/locations.*.json`) */
  label: number
}

/** 이름난 자리가 없다는 표식. 0이 아니다 */
export const NO_LANDMARK = 0xffff

/** 그 칸의 이름표 (`TownMap_GetMapBlockAtPosition`) */
export function cellAt(
  cells: readonly TownMapCell[], x: number, z: number, unlocked = 0,
): TownMapCell | null {
  const cell = cells.find((c) => c.x === x && c.z === z) ?? null
  if (cell === null) return null
  // ⚠️ **숨은 자리는 열기 전에는 아예 없는 칸이다** (`TownMap_GetMapBlockAtPosition`).
  // 이름만 가리면 안 된다 — 만월도가 「가 본 적 없는 곳」으로 보이면
  // 이야기가 그리로 가라고 말하기 전에 있는 줄 알게 된다
  if (cell.hidden !== 0 && (cell.hidden & unlocked) === 0) return null
  return cell
}

/** `enum HiddenLocation` */
export const HiddenLocation = {
  FULLMOON_ISLAND: 0, NEWMOON_ISLAND: 1, SPRING_PATH: 2, SEABREAK_PATH: 3,
} as const
export const HIDDEN_LOCATION_COUNT = 4

/**
 * 숨은 자리를 여는 **매직 넘버** (`sHiddenLocationMagicNumbers`).
 *
 * ⚠️ **0/1이 아니다.** 원작이 변수에 이 수를 적어 두고 **같은 수인지**를
 * 본다 — 다른 값이 흘러 들어와도 안 열리게 하는 자물쇠다
 */
export const HIDDEN_LOCATION_MAGIC: readonly number[] = [0x0208, 0x0229, 0x0312, 0x1028]

/** `VAR_HIDDEN_LOCATION_FULL_MOON_ISLAND` */
export const VAR_HIDDEN_LOCATION_FIRST = 16438

/** 열린 숨은 자리를 비트마스크로 (`ctx->unlockedHiddenLocations`) */
export function unlockedHidden(varOf: (id: number) => number): number {
  let mask = 0
  for (let i = 0; i < HIDDEN_LOCATION_COUNT; i++) {
    if (varOf(VAR_HIDDEN_LOCATION_FIRST + i) === HIDDEN_LOCATION_MAGIC[i]) mask |= 1 << i
  }
  return mask
}
