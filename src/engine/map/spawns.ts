// 부활 지점과 공중날기 목적지 (DATA.md §2.3)
//
// 원작 `src/spawn_locations.c`의 `sSpawnLocations` 스무 줄이다. 한 줄이
// **전멸했을 때 서는 자리**(포켓몬센터 1층 안, 대개 8,6)와 **공중날기로 내리는
// 자리**(그 마을 바깥)를 같이 들고 있어서, 둘이 자연히 짝을 이룬다.
//
// 표는 `tools/extract/spawns.js`가 뽑는다. 눈으로 옮긴 값이 하나도 없다 —
// 그리고 뽑은 것이 맞는지는 우리가 이미 아는 두 번호로 확인된다: 떡잎마을이
// 411이고 주인공 집 1층이 414다(둘 다 다른 시험이 따로 확인하는 값이다).
import { world } from './world'

export interface SpawnPoint {
  /** 전멸했을 때 깨어나는 자리 — 포켓몬센터 1층 안이다 */
  blackOut: { map: number; x: number; z: number }
  /** 공중날기로 내리는 자리 — 그 마을 바깥이다 */
  fly: { map: number; x: number; z: number }
  /** 그 존에 발을 들이면 공중날기 자리가 열리는가 */
  unlockOnMapEntry: boolean
  /** `SYSTEM_FLAGS_FIRST_ARRIVAL_TO_ZONE + n` — 열린 것을 적는 자리 */
  firstArrival: number
  blackOutName: string
  flyName: string
}

export const spawnTable = { list: [] as SpawnPoint[] }

/**
 * 전멸 지점을 갱신한다 (`FieldMapChange_UpdateGameData`).
 *
 * ```c
 * u16 warpId = GetMapBlackOutWarpId(mapHeaderID);
 * if (warpId != 0) FieldOverworldState_SetBlackOutWarpId(fieldState, warpId);
 * ```
 *
 * **간호사에게 말을 걸 필요가 없다.** 포켓몬센터에 들어서는 것만으로 정해진다 —
 * 원작이 맵을 갈아 끼울 때마다 이 한 줄을 돌린다.
 *
 * @returns 그 맵이 부활 지점이면 번호, 아니면 null
 */
export function spawnAt(mapId: number): number | null {
  const i = spawnTable.list.findIndex((s) => s.blackOut.map === mapId)
  return i < 0 ? null : i
}

/**
 * 이 맵에 들어서면 열리는 공중날기 자리 (`sub_...`의 `unlockOnMapEntry` 갈래).
 *
 * 스무 개 중 열일곱이 이 방식이다. 안 열리는 셋은 포켓몬리그 둘과 파르파크로,
 * 이야기가 따로 열어 준다
 */
export function flyUnlockedAt(mapId: number): number | null {
  const i = spawnTable.list.findIndex((s) => s.unlockOnMapEntry && s.fly.map === mapId)
  return i < 0 ? null : i
}

/** 부활 자리 하나를 워프 모양으로 편다. 목적지 맵이 없으면 null */
export function spawnWarp(index: number, kind: 'blackOut' | 'fly') {
  const spot = spawnTable.list[index]?.[kind]
  if (!spot) return null
  const header = world.maps?.[spot.map]
  if (!header) return null
  // 타일 번호를 칸 한가운데로 옮긴다 — 워프가 쓰는 좌표계와 같게 맞춘다
  return { to: spot.map, matrix: header.matrix, x: spot.x + 0.5, z: spot.z + 0.5, viaDoor: false }
}
