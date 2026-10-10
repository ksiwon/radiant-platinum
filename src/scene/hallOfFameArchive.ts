// PC 다시보기의 여섯 자리 (`applications/pc_hall_of_fame/display.c`의 `spriteCoordinates`) — 원작 좌표 그대로다.
//
// 한동안 대칭 삼각형(뒤 중앙 · 좌 · 우 · 앞 셋)이었다. 원작은 **어긋난 벽돌 배열**이다: 윗줄 `(120,56) (40,56) (200,56)`
// (번호 0 · 1 · 2), 아랫줄 `(136,112) (216,112) (56,112)`(번호 3 · 4 · 5). 아랫줄은 왼쪽에서 5 · 3 · 4 차례로 서고 윗줄보다
// 16픽셀 오른쪽으로 어긋난다. 마리의 순서가 원작과 같게 읽혀야 한다 (결정)

/** 원작 화면의 여섯 자리 (px, 256×192) */
export const HOF_ARCHIVE_PX: readonly (readonly [number, number])[] = [
  [120, 56], [40, 56], [200, 56], [136, 112], [216, 112], [56, 112],
]

/** 원작 화면 가운데(px) — 월드 x의 0이다 */
const CENTER_X = 128
/** 원작 한 픽셀이 월드에서 얼마인가 — 단상 지름(약 1.7)이 80픽셀 칸에 들어간다 */
const WORLD_PER_PX = 0.0275
/** 두 줄의 월드 깊이 — 윗줄이 안쪽, 아랫줄이 카메라 쪽이다 (줄 사이 56픽셀) */
const ROW_Z = { 56: -0.55, 112: 1.05 } as const

/** 월드 자리 `[x, y, z]` 여섯. 원작 좌표에서 곧장 나온다 */
export const HOF_ARCHIVE_POSITIONS: readonly (readonly [number, number, number])[] = HOF_ARCHIVE_PX.map(
  ([px, py]) => [(px - CENTER_X) * WORLD_PER_PX, 0, ROW_Z[py as 56 | 112]] as const,
)
