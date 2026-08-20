// 어떤 땅 위에서 싸우는가 (DATA.md §7.4)
//
// ⚠️ **원작은 맵만 보지 않는다. 밟고 선 칸을 먼저 본다.**
// `field_battle_data_transfer.c`의 `CalcTerrain`을 그대로 옮긴 것이다:
//
//     얼음 → 풀숲 → 모래 → 눈 → 진흙 → 굴바닥 → 파도탈 수 있는 물 →
//     그래도 아니면 맵 헤더의 배경(`sTerrainForBackground`)
//
// 차례가 중요하다. 진흙 위의 풀(0xA6·0xA7)은 풀숲 검사에 안 걸리고 진흙에
// 걸려야 **대습원**이 된다 — 순서를 바꾸면 대습원이 평범한 풀숲이 된다.
//
// 원작에서 이 값이 정하는 것은 발판 그림과 자연의 힘·비밀의힘·도롱마담이고,
// 우리는 여기에 **무대 고르기**를 하나 더 얹는다 (`battle/arena`). 3D에서는
// 발판이 따로 없고 무대가 곧 땅이라서다.
import { isSurfable } from '../map/zone'

/** `enum BattleTerrain` (`generated/battle_terrains.txt`) 차례 그대로 */
export const Terrain = {
  PLAIN: 0,
  SAND: 1,
  GRASS: 2,
  PUDDLE: 3,
  MOUNTAIN: 4,
  CAVE: 5,
  SNOW: 6,
  WATER: 7,
  ICE: 8,
  BUILDING: 9,
  GREAT_MARSH: 10,
  BRIDGE: 11,
  AARON: 12,
  BERTHA: 13,
  FLINT: 14,
  LUCIAN: 15,
  CYNTHIA: 16,
  DISTORTION_WORLD: 17,
  BATTLE_TOWER: 18,
  BATTLE_FACTORY: 19,
  BATTLE_ARCADE: 20,
  BATTLE_CASTLE: 21,
  BATTLE_HALL: 22,
  GIRATINA: 23,
} as const

export type TerrainId = (typeof Terrain)[keyof typeof Terrain]

/**
 * 배경 번호 → 땅 (`sTerrainForBackground`).
 *
 * 배경 열여덟 가지 중 실내 셋이 다 `BUILDING`이고 굴 셋이 다 `CAVE`다 —
 * 원작이 그렇게 접어 둔 것이라 여기서 더 가르지 않는다
 */
const TERRAIN_OF_BACKGROUND: readonly TerrainId[] = [
  Terrain.PLAIN, Terrain.WATER, Terrain.BUILDING, Terrain.GRASS,
  Terrain.MOUNTAIN, Terrain.SNOW,
  Terrain.BUILDING, Terrain.BUILDING, Terrain.BUILDING,
  Terrain.CAVE, Terrain.CAVE, Terrain.CAVE,
  Terrain.AARON, Terrain.BERTHA, Terrain.FLINT, Terrain.LUCIAN, Terrain.CYNTHIA,
  Terrain.DISTORTION_WORLD,
]

// 타일 거동값. 이름에 16진수를 담은 항목들이 앞뒤를 가둬서 값이 확정된다
// (`map_tile_behaviors.h`, DATA.md §2.2)
const TALL_GRASS = 0x02
const VERY_TALL_GRASS = 0x03
const CAVE_FLOOR = 0x08
const ICE = 0x20
const SAND = 0x21
const SNOW = new Set([0xa1, 0xa2, 0xa3, 0xa8])
const MUD = new Set([0xa4, 0xa5, 0xa6, 0xa7])

/**
 * 이 칸 위에서 싸우면 어떤 땅인가.
 *
 * `behavior`가 null이면 (격자를 아직 못 받았다) 배경만 본다
 */
export function terrainOf(behavior: number | null, background: number): TerrainId {
  if (behavior !== null) {
    if (behavior === ICE) return Terrain.ICE
    if (behavior === TALL_GRASS || behavior === VERY_TALL_GRASS) return Terrain.GRASS
    if (behavior === SAND) return Terrain.SAND
    if (SNOW.has(behavior)) return Terrain.SNOW
    if (MUD.has(behavior)) return Terrain.GREAT_MARSH
    if (behavior === CAVE_FLOOR) return Terrain.CAVE
    if (isSurfable(behavior)) return Terrain.WATER
  }
  return TERRAIN_OF_BACKGROUND[background] ?? Terrain.PLAIN
}
