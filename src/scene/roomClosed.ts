// BDSP 방이 벽으로 지은 자리 중 원작에서는 걸을 수 있던 빈 칸 — 막는다 (사용자 결정 2026-10-12 · DATA.md §2.17.5)
//
// ⚠️ **원작 충돌과 다르다.** 원작 관문(행렬 258 · 257)에는 걷는 칸인 홈이 있다 — 218번 도로 관문의 2×2 홈 넷(걸음 18칸)과 세로 관문의 네 모서리 홈(16칸).
// BDSP는 그 자리를 벽으로 지었다(`r218r0101` 바닥 z 5~10 · `c05r0301` 바닥 x 3~8). 홈에는 사람 · 워프 · 표지판 · 트리거가 없어(맵 109 · 111 · 149 · 193 · 374 ·
// 381 · 389 · 390 · 398 · 501 — 시험이 센다) 막아도 잃는 길이 없고, 안 막으면 벽 속으로 걸어 들어간다. 그래서 BDSP 방이 서는 맵의 홈을 막는다.
// 원작 그림이 서는 맵 110(`c05r0601`)은 같은 행렬이어도 막지 않는다 — BDSP 방이 실제로 서는 맵에서만 건다 (`scene/MapStreamer` → `worldData.closeRoomCells`).
//
// 잰 법: `.audit/probe/gateCells.mjs` — 문에서 걸어 닿는 칸 중 BDSP 바닥(삼각형)이 없는 칸
export const ROOM_CLOSED_CELLS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  258: [[2, 3], [3, 3], [8, 3], [9, 3], [1, 4], [2, 4], [3, 4], [8, 4], [9, 4], [10, 4], [2, 10], [3, 10], [8, 10], [9, 10], [2, 11], [3, 11], [8, 11], [9, 11]],
  257: [[1, 3], [2, 3], [8, 3], [9, 3], [1, 4], [2, 4], [8, 4], [9, 4], [1, 11], [2, 11], [8, 11], [9, 11], [1, 12], [2, 12], [8, 12], [9, 12]],
}

/**
 * 통행표(`tiles`)의 홈 칸을 막거나(`on`) 되돌린다. `was`는 막기 전 값을 적어 두는 자리다 — 바닥 덮개가 이미 막은 칸을 열 때 되살리지 않게.
 * 바뀐 칸 수를 돌려준다
 */
export function paintClosed(
  tiles: Uint16Array, tileWidth: number, matrix: number, on: boolean, was: Map<string, number>, blocked: number,
): number {
  let changed = 0
  for (const [x, z] of ROOM_CLOSED_CELLS[matrix] ?? []) {
    const i = z * tileWidth + x
    const key = `${String(matrix)}:${String(x)},${String(z)}`
    if (on) {
      if (was.has(key)) continue
      was.set(key, tiles[i]!)
      tiles[i]! |= blocked
      changed++
    } else if (was.has(key)) {
      tiles[i] = was.get(key)!
      was.delete(key)
      changed++
    }
  }
  return changed
}
