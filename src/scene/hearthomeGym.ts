// 연고시티 체육관의 틀린 문을 되돌린다 (PARITY §7.12)
//
// 규칙과 표는 `engine/world/hearthomeGym`이 들고 있고 여기서 실제로 워프
// 목적지를 갈아 끼운다.
//
// ⚠️ **이 방은 「막혀서」가 아니라 「뜻이 없어서」 문제였다.** 문을 안 되돌리면
// 어느 문으로 나가도 앞으로 가서 수수께끼가 통째로 사라진다
import {
  HEARTHOME_ENTRANCE_ANCHOR, HEARTHOME_ENTRANCE_ROOM, HEARTHOME_ROOMS,
  hearthomeRoomOf, hearthomeWrongDoors, rollHearthomePuzzle, type HearthomePuzzle,
} from '../engine/world/hearthomeGym'
import { MAP_FEATURE, setMapFeature } from '../engine/world/mapFeatures'
import { setWarpDestination, warpIndexAt } from '../engine/map/world'
import { activeZone } from '../engine/map/zone'

let puzzle: (HearthomePuzzle & { room: number }) | null = null

/**
 * 맵에 들어설 때
 * (`PersistedMapFeatures_InitForHearthomeGym` + `HearthomeGym_DynamicMapFeaturesInit`).
 *
 * ⚠️ **들어설 때마다 다시 뽑는다** — 원작의 `initialized`가 늘 거짓이다
 */
export function initHearthomeGym(map: number, rng: () => number): boolean {
  const room = hearthomeRoomOf(map)
  setMapFeature(MAP_FEATURE.hearthomeGym)
  if (room === null) { puzzle = null; return false }

  const layout = HEARTHOME_ROOMS[room]!
  const grid = activeZone.grid
  const rolled = rollHearthomePuzzle(layout, rng,
    // 원작은 벽·소품 칸을 거르는 표를 따로 두는데, 그 표가 말하는 것은 결국
    // 「거기 설 수 있는가」다 — 격자에 물으면 같은 답이 나온다
    (x, z) => grid === null || !grid.isBlocked(x, z))
  puzzle = { ...rolled, room }

  // 틀린 문들만 입구 방으로 돌려놓는다
  for (const door of hearthomeWrongDoors(room, rolled.correctDoor)) {
    const at = warpIndexAt(map, door.x, door.z)
    if (at >= 0) setWarpDestination(at, HEARTHOME_ENTRANCE_ROOM, HEARTHOME_ENTRANCE_ANCHOR)
  }
  return true
}

/** 지금 방의 답. 이 방이 아니면 null */
export function hearthomePuzzle(): (HearthomePuzzle & { room: number }) | null {
  return puzzle
}

/** 맵을 옮기면 없어진다 */
export function resetHearthomeGym(): void {
  puzzle = null
}
