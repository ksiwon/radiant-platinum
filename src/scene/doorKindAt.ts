// 워프 칸 둘레의 문 종류 — 소리가 이것으로 갈린다 (`engine/audio/doorSound`)
import { DOOR_KIND, type DoorKind } from '../import/platinum/propAnims'

/**
 * 원작은 문 모델을 가로 3칸 · 세로 1칸 상자 안에서 찾는다 (`ov5_021D431C.c`의
 * `TerrainCollisionHitbox_Init(…, -1, -1, 3, 1, …)`). 그 칸 → 왼쪽 → 오른쪽 차례로 본다.
 * 문 모델이 없으면 `undefined` — 소리는 여닫이로 떨어진다 (`doorOpenSe`)
 */
export function doorKindAt(
  grid: { propModelAt(tx: number, tz: number): number } | null, x: number, z: number,
): DoorKind | undefined {
  if (grid === null) return undefined
  for (const dx of [0, -1, 1]) {
    const kind = DOOR_KIND[grid.propModelAt(x + dx, z)]
    if (kind !== undefined) return kind
  }
  return undefined
}
