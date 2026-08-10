// 부활 지점과 공중날기 목적지 (DATA.md §2.3)
//
// ⚠️ **손으로 고치지 않는다.** `pnpm gen:spawnTable`이 디컴프에서 다시 만든다
// (`tools/extract/spawnTableModule.cjs`).
//
// 원작 `src/spawn_locations.c`의 `sSpawnLocations` 스무 줄이 전부다. 한 줄에
// **전멸했을 때 서는 자리**(포켓몬센터 1층 안)와 **공중날기로 내리는 자리**(그
// 마을 바깥)가 같이 들어 있다. 코드에 박힌 배열이라 롬 파일로는 안 나온다.

export interface SpawnPoint {
  blackOut: { map: number, x: number, z: number }
  fly: { map: number, x: number, z: number }
  /** 공중날기 자리가 그 존에 처음 발을 들이면 열리는가 */
  unlockOnMapEntry: boolean
  firstArrival: number
  blackOutName: string
  flyName: string
}

export const SPAWN_TABLE: readonly SpawnPoint[] = [
  { blackOut: { map: 414, x: 8, z: 8 }, fly: { map: 411, x: 116, z: 886 }, unlockOnMapEntry: true, firstArrival: 0, blackOutName: "MAP_HEADER_TWINLEAF_TOWN_PLAYER_HOUSE_1F", flyName: "MAP_HEADER_TWINLEAF_TOWN" },
  { blackOut: { map: 420, x: 8, z: 6 }, fly: { map: 418, x: 177, z: 843 }, unlockOnMapEntry: true, firstArrival: 1, blackOutName: "MAP_HEADER_SANDGEM_TOWN_POKECENTER_1F", flyName: "MAP_HEADER_SANDGEM_TOWN" },
  { blackOut: { map: 428, x: 8, z: 6 }, fly: { map: 426, x: 176, z: 667 }, unlockOnMapEntry: true, firstArrival: 2, blackOutName: "MAP_HEADER_FLOAROMA_TOWN_POKECENTER_1F", flyName: "MAP_HEADER_FLOAROMA_TOWN" },
  { blackOut: { map: 435, x: 8, z: 6 }, fly: { map: 433, x: 566, z: 657 }, unlockOnMapEntry: true, firstArrival: 3, blackOutName: "MAP_HEADER_SOLACEON_TOWN_POKECENTER_1F", flyName: "MAP_HEADER_SOLACEON_TOWN" },
  { blackOut: { map: 443, x: 8, z: 6 }, fly: { map: 442, x: 472, z: 539 }, unlockOnMapEntry: true, firstArrival: 4, blackOutName: "MAP_HEADER_CELESTIC_TOWN_POKECENTER_1F", flyName: "MAP_HEADER_CELESTIC_TOWN" },
  { blackOut: { map: 6, x: 8, z: 6 }, fly: { map: 3, x: 180, z: 777 }, unlockOnMapEntry: true, firstArrival: 7, blackOutName: "MAP_HEADER_JUBILIFE_CITY_POKECENTER_1F", flyName: "MAP_HEADER_JUBILIFE_CITY" },
  { blackOut: { map: 36, x: 8, z: 6 }, fly: { map: 33, x: 58, z: 723 }, unlockOnMapEntry: true, firstArrival: 8, blackOutName: "MAP_HEADER_CANALAVE_CITY_POKECENTER_1F", flyName: "MAP_HEADER_CANALAVE_CITY" },
  { blackOut: { map: 48, x: 8, z: 6 }, fly: { map: 45, x: 303, z: 757 }, unlockOnMapEntry: true, firstArrival: 9, blackOutName: "MAP_HEADER_OREBURGH_CITY_POKECENTER_1F", flyName: "MAP_HEADER_OREBURGH_CITY" },
  { blackOut: { map: 69, x: 8, z: 6 }, fly: { map: 65, x: 305, z: 531 }, unlockOnMapEntry: true, firstArrival: 10, blackOutName: "MAP_HEADER_ETERNA_CITY_POKECENTER_1F", flyName: "MAP_HEADER_ETERNA_CITY" },
  { blackOut: { map: 101, x: 8, z: 6 }, fly: { map: 86, x: 465, z: 698 }, unlockOnMapEntry: true, firstArrival: 11, blackOutName: "MAP_HEADER_HEARTHOME_CITY_POKECENTER_1F", flyName: "MAP_HEADER_HEARTHOME_CITY" },
  { blackOut: { map: 123, x: 8, z: 6 }, fly: { map: 120, x: 600, z: 816 }, unlockOnMapEntry: true, firstArrival: 12, blackOutName: "MAP_HEADER_PASTORIA_CITY_POKECENTER_1F", flyName: "MAP_HEADER_PASTORIA_CITY" },
  { blackOut: { map: 134, x: 8, z: 6 }, fly: { map: 132, x: 717, z: 612 }, unlockOnMapEntry: true, firstArrival: 13, blackOutName: "MAP_HEADER_VEILSTONE_CITY_POKECENTER_1F", flyName: "MAP_HEADER_VEILSTONE_CITY" },
  { blackOut: { map: 151, x: 8, z: 6 }, fly: { map: 150, x: 860, z: 785 }, unlockOnMapEntry: true, firstArrival: 14, blackOutName: "MAP_HEADER_SUNYSHORE_CITY_POKECENTER_1F", flyName: "MAP_HEADER_SUNYSHORE_CITY" },
  { blackOut: { map: 168, x: 8, z: 6 }, fly: { map: 165, x: 379, z: 234 }, unlockOnMapEntry: true, firstArrival: 15, blackOutName: "MAP_HEADER_SNOWPOINT_CITY_POKECENTER_1F", flyName: "MAP_HEADER_SNOWPOINT_CITY" },
  { blackOut: { map: 173, x: 8, z: 6 }, fly: { map: 172, x: 842, z: 599 }, unlockOnMapEntry: false, firstArrival: 16, blackOutName: "MAP_HEADER_POKEMON_LEAGUE_SOUTH_POKECENTER_1F", flyName: "MAP_HEADER_POKEMON_LEAGUE" },
  { blackOut: { map: 189, x: 8, z: 6 }, fly: { map: 188, x: 647, z: 430 }, unlockOnMapEntry: true, firstArrival: 17, blackOutName: "MAP_HEADER_FIGHT_AREA_POKECENTER_1F", flyName: "MAP_HEADER_FIGHT_AREA" },
  { blackOut: { map: 452, x: 8, z: 6 }, fly: { map: 450, x: 659, z: 339 }, unlockOnMapEntry: true, firstArrival: 5, blackOutName: "MAP_HEADER_SURVIVAL_AREA_POKECENTER_1F", flyName: "MAP_HEADER_SURVIVAL_AREA" },
  { blackOut: { map: 459, x: 8, z: 6 }, fly: { map: 457, x: 802, z: 473 }, unlockOnMapEntry: true, firstArrival: 6, blackOutName: "MAP_HEADER_RESORT_AREA_POKECENTER_1F", flyName: "MAP_HEADER_RESORT_AREA" },
  { blackOut: { map: 393, x: 8, z: 6 }, fly: { map: 392, x: 306, z: 910 }, unlockOnMapEntry: false, firstArrival: 66, blackOutName: "MAP_HEADER_PAL_PARK_LOBBY", flyName: "MAP_HEADER_ROUTE_221" },
  { blackOut: { map: 175, x: 4, z: 3 }, fly: { map: 172, x: 847, z: 560 }, unlockOnMapEntry: false, firstArrival: 68, blackOutName: "MAP_HEADER_POKEMON_LEAGUE_NORTH_POKECENTER_1F", flyName: "MAP_HEADER_POKEMON_LEAGUE" },
]
