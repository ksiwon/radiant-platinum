// 움직이는 바닥 (`DynamicTerrainHeightManager` · `terrain_collision_manager.c`)
//
// BDHC는 **구워진 판**이라 높이가 안 바뀐다. 그런데 원작에는 딛는 면이
// 움직이는 자리가 여럿 있다 — 리그의 승강판, 들판시티 체육관의 물바닥,
// 운하시티 체육관의 뜨는 판. 그 자리들을 위해 원작이 BDHC **위에** 얹는
// 직사각형 한 겹을 따로 들고 있고, 이 파일이 그것이다.
//
// 판은 「칸 상자 + 높이」 하나가 전부다. 어려운 것은 세우는 것이 아니라
// **BDHC와 겹칠 때 어느 쪽을 딛는가**인데, 그 규칙도 원작이 적어 두었다:
//
//   ① 판이 BDHC보다 **낮거나 같으면** 늘 BDHC다 — 바닥 밑을 딛지 않는다
//   ② 높으면 **지금 서 있는 높이에 가까운 쪽**을 딛는다
//   ③ BDHC가 없는 칸이면 판이 곧 지면이다
//
// ②가 이 파일의 전부다. 승강판이 올라가는 동안 사람은 판 위에 있고 그 아래
// 바닥은 그대로 있는데, 가까운 쪽을 안 고르면 판이 한 칸만 떠도 바닥으로
// 떨어진다.
//
// ⚠️ **높이 단위가 칸이다.** 원작은 `fx32`고 한 칸이 `MAP_OBJECT_TILE_SIZE`
// (= 16 << 12)인데, 우리 세계 좌표는 한 칸이 1이라 그냥 칸으로 적는다

/** 판 하나. 원작 `DynamicTerrainHeightPlate` 그대로다 */
interface HeightPlate {
  startTileX: number
  startTileZ: number
  sizeX: number
  sizeZ: number
  /** 칸 단위 */
  height: number
}

/**
 * 원작은 맵마다 필요한 만큼 잡는데(대개 한 장, 운하시티만 여럿) 우리는
 * 색인으로 흩뿌린다. 없는 자리는 `undefined`라 그냥 없는 판이다
 */
const plates = new Map<number, HeightPlate>()

/** `DynamicTerrainHeightManager_SetPlate` */
export function setHeightPlate(
  index: number, startTileX: number, startTileZ: number,
  sizeX: number, sizeZ: number, height: number,
): void {
  plates.set(index, { startTileX, startTileZ, sizeX, sizeZ, height })
}

/** `DynamicTerrainHeightManager_SetHeight` — 상자는 그대로 두고 높이만 */
export function setHeightPlateHeight(index: number, height: number): void {
  const plate = plates.get(index)
  if (plate) plate.height = height
}

/** `DynamicTerrainHeightManager_GetHeight` */
export function heightPlateHeight(index: number): number | null {
  return plates.get(index)?.height ?? null
}

/**
 * 그 칸을 덮는 판 (`..._GetPlateIndexOfTile`).
 *
 * ⚠️ **앞에서부터 처음 맞는 하나만 이긴다.** 원작이 그렇고, 그래서 판이 겹치면
 * 색인이 작은 쪽이 이긴다
 */
export function heightPlateAt(tileX: number, tileZ: number): HeightPlate | null {
  for (const plate of [...plates.entries()].sort((a, b) => a[0] - b[0])) {
    const p = plate[1]
    if (tileX < p.startTileX || tileX > p.startTileX + p.sizeX - 1) continue
    if (tileZ < p.startTileZ || tileZ > p.startTileZ + p.sizeZ - 1) continue
    return p
  }
  return null
}

/** 맵을 옮기면 판이 없어진다 — 새 맵의 초기화가 다시 세운다 */
export function clearHeightPlates(): void {
  plates.clear()
}

/**
 * BDHC 높이와 판 높이 중 무엇을 딛는가 (`GetHeight`의 `if (dynHeightPlateFound)`).
 *
 * @param bdhc 그 칸의 구워진 높이. 판이 없는 칸이면 `null`
 * @param near 지금 서 있는 높이 — 겹치는 자리를 가르는 유일한 단서다
 */
export function resolveDynamicHeight(
  bdhc: number | null, tileX: number, tileZ: number, near: number,
): number | null {
  const plate = heightPlateAt(tileX, tileZ)
  if (plate === null) return bdhc
  if (bdhc === null) return plate.height
  // ⚠️ **판이 바닥보다 낮으면 쳐다보지 않는다.** 내려간 승강판이 바닥 밑에
  // 숨는 자리가 있는데, 가까운 쪽으로 고르면 그 밑을 딛는다
  if (plate.height <= bdhc) return bdhc
  return Math.abs(bdhc - near) <= Math.abs(plate.height - near) ? bdhc : plate.height
}

/**
 * 딛는 높이가 **판에서 왔는가** (`CALCULATED_HEIGHT_SOURCE_DYNAMIC`).
 *
 * 이 한 값이 들판시티 체육관의 물이다 — 거동값 `0x59`인 칸은 딛는 높이가
 * 판에서 왔을 때만 막힌다 (`TerrainCollisionManager_WillPlayerCollide`).
 * 물이 바닥까지 내려가면 구워진 높이가 이겨서 그 칸을 걸어 지나갈 수 있고,
 * 물이 오르면 판이 이겨서 막힌다
 */
export function heightCameFromPlate(
  bdhc: number | null, tileX: number, tileZ: number, near: number,
): boolean {
  const plate = heightPlateAt(tileX, tileZ)
  if (plate === null) return false
  if (bdhc === null) return true
  if (plate.height <= bdhc) return false
  return Math.abs(bdhc - near) > Math.abs(plate.height - near)
}
