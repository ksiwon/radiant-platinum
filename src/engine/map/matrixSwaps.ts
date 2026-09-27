// 숨은 자리가 바꿔 끼우는 청크 (`map_matrix.c:196-230` · `field_map_change.c:382-388`)
//
// 원작은 맵을 옮길 때마다 행렬을 다시 읽고, 숨은 자리 변수에 따라 청크 몇 칸의 land_data를 갈아 끼운다:
//
//   · 파도의길(숨은 자리 3)이 **열렸으면** (28,15)·(27,16)·(28,16)·(27,17)이 115~118 → 119~122 — 벽이 뚫린다
//   · 떠나는샘길(숨은 자리 2)이 **안 열렸으면** (23,21)·(24,21)·(23,22)·(24,22)가 176 — 바다로 막힌다
//
// ⚠️ **없던 동안 두 길이 거꾸로였다.** 격자를 기본 행렬로만 구워서 224번도로 북쪽이 영영 벽이었고(쉐이미 · 꽃의 낙원 ·
// 시원의 넷째 뒤가 통째로 막혔다), 떠나는샘길은 처음부터 걸어서 열려 있었다(REPAIR §137).
//
// 갈아 끼울 청크의 충돌 칸과 소품은 굽는 쪽이 `matrices/0.json`의 `swaps`에 넣어 둔다. 모델과 높이는 land_data 번호로
// 찾으므로(`chunks/<land>.bin` · `bdhc`) 번호만 바꾸면 따라온다
import { HIDDEN_LOCATION_MAGIC, VAR_HIDDEN_LOCATION_FIRST } from './townMap'
import type { MapGrid, MatrixSwapCell } from './grid'

/** base64 → u16. 칸 하나에 한 번만 푼다 */
const decoded = new WeakMap<MatrixSwapCell, Uint16Array>()

function tilesOf(cell: MatrixSwapCell): Uint16Array {
  const hit = decoded.get(cell)
  if (hit) return hit
  const bin = atob(cell.tiles)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const tiles = new Uint16Array(bytes.buffer, 0, bytes.length >> 1)
  decoded.set(cell, tiles)
  return tiles
}

/** 그 숨은 자리가 열렸나 — 변수에 **그 매직 넘버가** 있어야 한다 (`SystemVars_CheckHiddenLocation`) */
export function hiddenUnlocked(varOf: (id: number) => number, hidden: number): boolean {
  return varOf(VAR_HIDDEN_LOCATION_FIRST + hidden) === HIDDEN_LOCATION_MAGIC[hidden]
}

/**
 * 지금 숨은 자리 상태로 청크를 맞춘다 — 맵을 옮길 때마다 부른다(원작도 그때 행렬을 다시 읽는다).
 *
 * @returns 바뀐 칸이 있었나
 */
export function applyMatrixSwaps(grid: MapGrid, varOf: (id: number) => number): boolean {
  let changed = false
  for (const swap of grid.meta.swaps ?? []) {
    const open = hiddenUnlocked(varOf, swap.hidden)
    const on = swap.when === 'unlocked' ? open : !open
    for (const cell of swap.cells) {
      const next = on ? { tiles: tilesOf(cell), land: cell.land, buildings: cell.buildings } : null
      if (grid.swapChunk(cell.i, next)) changed = true
    }
  }
  return changed
}
