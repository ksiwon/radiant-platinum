// 물가시티 체육관 — 물바닥 (`gym_features.c`의 `PastoriaGym_*`)
//
// 다섯째 뱃지의 방이다. 바닥 전체가 물이고 **단추 셋이 물 높이를 정한다** —
// 낮음(0칸) · 가운데(2칸) · 높음(4칸). 물이 오르내리는 것에 따라 딛을 수 있는
// 자리가 통째로 바뀌고, 그것이 이 방의 길이다. 없으면 관장에게 못 간다.
//
// ⚠️ **길을 격자가 안 적어 두었다.** 칸의 통행 비트는 물 높이를 모른다 —
// 대신 거동값 넷이 「어느 물 높이에서 딛을 수 있는가」를 말한다:
//
//   0x56 H_GROUND  물이 **낮을 때만** 딛는다 (바닥에 내려선다)
//   0x57 M_GROUND  물이 **가운데일 때만**
//   0x58 L_GROUND  물이 **높을 때만** (물 위를 건넌다)
//   0x59 물 그 자체 — 물이 바닥보다 위로 올라온 칸이면 못 지나간다
//
// 앞의 셋은 이 체육관만 쓰는 판정이고(`PastoriaGym_DynamicMapFeaturesCheckCollision`),
// 0x59는 엔진 전체의 규칙이다(`TerrainCollisionManager_WillPlayerCollide`) —
// **딛는 높이가 구워진 바닥이 아니라 물판에서 왔을 때만** 막는다.
//
// ⚠️ 이름이 헷갈린다 — `H_GROUND`가 「높은 땅」이라 물이 높을 때 쓸 것 같지만
// 반대다. 땅이 높으면 물이 낮아야 발이 닿는다

/** 물 높이 세 단계(칸). `PASTORIA_WATER_HEIGHT_*` */
export const PASTORIA_WATER = { low: 0, middle: 2, high: 4 } as const

/** `PASTORIA_WATER_PLATE_INDEX` */
export const PASTORIA_PLATE = 0

/**
 * `enum PastoriaGymPressedButton` — 값이 그대로다.
 *
 * ⚠️ **주황이 0이다.** 맵에 들어설 때 원작이 이 자리를 통째로 0으로 지우므로
 * (`PersistedMapFeatures_InitWithID` → `MI_CpuClear8`), **체육관에 들어설
 * 때마다 물이 늘 낮은 데서 시작한다** — 나갔다 들어오면 풀던 것이 처음으로
 * 돌아간다. 리포트에 남는 값이 아니다
 */
export const PASTORIA_BUTTON = { orange: 0, green: 1, blue: 2 } as const
export type PastoriaButton = typeof PASTORIA_BUTTON[keyof typeof PASTORIA_BUTTON]

/**
 * 단추 소품 모델 번호 (`res/field/props/models/meson.build`의 차례).
 *
 * 원작은 서 있는 칸에 어느 단추가 놓였는지로 갈래를 고른다
 * (`FieldSystem_FindCollidingLoadedMapPropByModelIDs`) — 스크립트가 셋으로
 * 나뉘어 있는데도 명령은 하나다
 */
export const PASTORIA_BUTTON_MODEL = { blue: 239, green: 240, orange: 241 } as const

/** 물바닥 소품 (`pastoria_gym_water_floor_nsbmd`) */
export const PASTORIA_WATER_MODEL = 242

/**
 * 물바닥 소품이 서는 자리 (`{ FX32_CONST(256), 0, FX32_CONST(256) }`).
 *
 * ⚠️ **배치 기록에 없다.** 원작이 이 방에서만 손으로 싣는다 — 강철섬 B2F의
 * 승강판과 같은 자리다. 256 / 16 = 16칸이다
 */
export const PASTORIA_WATER_POS = { x: 16, z: 16 } as const

/**
 * 높이판 상자 (`DynamicTerrainHeightManager_SetPlate(0, 1, 2, 25, 38, 0)`).
 *
 * 방 전체를 덮는다 — 격자가 32×64인데 걷는 자리는 이 안이다
 */
export const PASTORIA_PLATE_BOX = { startTileX: 1, startTileZ: 2, sizeX: 25, sizeZ: 38 } as const

/** 이 체육관만 쓰는 거동값 (`map_tile_behaviors.h`) */
export const PASTORIA_BEHAVIOR = {
  /** 물이 낮을 때만 딛는다 */
  highGround: 0x56,
  middleGround: 0x57,
  /** 물이 높을 때만 딛는다 */
  lowGround: 0x58,
} as const

/**
 * 「높이판에서 온 높이면 못 지나간다」는 칸
 * (`TILE_BEHAVIOR_DYNAMIC_HEIGHT_COLLISION`).
 *
 * 물가시티 체육관에만 445칸 있다(실측). 물이 바닥까지 내려가면 딛는 높이가
 * 구워진 바닥에서 오므로 지나갈 수 있고, 물이 오르면 물판에서 오므로 막힌다 —
 * 그 한 값이 이 방의 물이다
 */
export const TILE_DYNAMIC_HEIGHT_COLLISION = 0x59

/**
 * 그 칸이 지금 물 높이에서 막히는가
 * (`PastoriaGym_DynamicMapFeaturesCheckCollision`).
 *
 * ⚠️ **「뚫렸다」는 답이 없다.** 막혔으면 참이고, 아니면 `null`이다 — 원작도
 * 통행 가능일 때는 `FALSE`를 내서 **격자 판정으로 내려보낸다**. 여기서
 * 「뚫렸다」로 답해 버리면 물 높이가 맞는 칸에서 벽까지 뚫린다
 */
export function pastoriaBlocked(behavior: number, waterHeight: number): boolean | null {
  if (behavior === PASTORIA_BEHAVIOR.highGround) {
    return waterHeight !== PASTORIA_WATER.low ? true : null
  }
  if (behavior === PASTORIA_BEHAVIOR.middleGround) {
    return waterHeight !== PASTORIA_WATER.middle ? true : null
  }
  if (behavior === PASTORIA_BEHAVIOR.lowGround) {
    return waterHeight !== PASTORIA_WATER.high ? true : null
  }
  return null
}

/** 그 단추를 누르면 물이 어디로 가는가 */
export function pastoriaWaterFor(button: PastoriaButton): number {
  if (button === PASTORIA_BUTTON.blue) return PASTORIA_WATER.high
  if (button === PASTORIA_BUTTON.green) return PASTORIA_WATER.middle
  return PASTORIA_WATER.low
}

/** 그 자리의 소품 모델이 어느 단추인가. 단추가 아니면 `null` */
export function pastoriaButtonOf(model: number): PastoriaButton | null {
  if (model === PASTORIA_BUTTON_MODEL.blue) return PASTORIA_BUTTON.blue
  if (model === PASTORIA_BUTTON_MODEL.green) return PASTORIA_BUTTON.green
  if (model === PASTORIA_BUTTON_MODEL.orange) return PASTORIA_BUTTON.orange
  return null
}

/**
 * 물이 한 프레임에 오르내리는 거리(칸).
 *
 * 원작이 `FX32_ONE`씩 더하고 뺀다 — 한 칸이 `FX32_ONE * 16`이라 1/16칸이다.
 * 두 칸을 32프레임에 간다
 */
export const PASTORIA_WATER_STEP = 1 / 16

/** `SEQ_SE_DP_FW056` — 물이 오르내리는 동안 난다 */
export const PASTORIA_WATER_SFX = 1626

/** 물가시티 체육관의 맵 헤더 번호 */
export const PASTORIA_GYM_MAP = 122
