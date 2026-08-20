// 승강판 (`platform_lift.c`) — 리그 승강기 다섯 · 챔피언방 · 강철섬 셋
//
// ⚠️ **이게 없으면 게임을 못 끝낸다.** 사천왕 넷과 챔피언에게 올라가는 길이
// 계단이 아니라 이 판 하나뿐이고, 챔피언을 이긴 뒤 명예의 전당으로 올라가는
// 것도 같은 판이다. 강철섬 셋은 곁길이다.
//
// 판 하나가 오가는 층은 **둘뿐**이다. 어느 층에 서 있는지는 **들어온 문**이
// 정한다 — 아래층 문의 z로 들어왔으면 아래층, 아니면 위층이다. 그래서
// 세이브에 층을 적어 두지 않아도 되고, 저장했다 다시 켜도 선 자리에서 다시
// 계산되어 맞는다.
//
// 리그 쪽 다섯은 **한 번 오르면 안 내려온다**(`preventGoingDown`) — 사천왕을
// 이겨야 문이 열리는 방이라 내려갈 길이 필요 없다. 그 대신 「들어올 때 이미
// 위였는가」를 스크립트가 묻고(`CheckPlatformLiftNotUsedWhenEnteredMap`),
// 위였으면 발판 칸의 좌표 트리거를 꺼 버린다 — 안 그러면 내려서자마자 다시
// 탄다.
//
// ⚠️ **오르는 속도와 내리는 속도가 다르다.** 리그는 프레임당 2/16칸으로
// 오르는데 내려올 때는 강철섬과 같은 1/16칸이다. 원작 코드가 그렇다 —
// `FieldTask_PlatformLiftGoUp`만 갈래를 보고 `GoDown`은 안 본다

/** `PLATFORM_LIFT_SIZE_X` · `PLATFORM_LIFT_SIZE_Y` — 딛는 자리는 3×2칸이다 */
export const LIFT_SIZE_X = 3
export const LIFT_SIZE_Z = 2

/** `PLATFORM_LIFT_DYNAMIC_HEIGHT_PLATE_ID` */
export const LIFT_PLATE = 0

/** `enum PlatformLiftKind` — 소리와 오르는 속도가 여기서 갈린다 */
export const LIFT_KIND = { ironIsland: 0, pokemonLeague: 1 } as const
type LiftKind = typeof LIFT_KIND[keyof typeof LIFT_KIND]

/** `enum PlatformLiftFloorID` */
export const LIFT_FLOOR = { bottom: 0, top: 1 } as const

/**
 * 소품 모델 번호 (`res/field/props/models/meson.build`의 차례).
 *
 * 둘은 생긴 것만 다르고 하는 일이 같다 — 원작도 두 번호를 한 배열에 넣고
 * 「둘 중 실린 쪽」을 찾는다 (`FieldSystem_FindLoadedMapPropByModelIDs`)
 */
export const LIFT_MODEL = { ironIsland: 258, pokemonLeague: 502 } as const

export interface PlatformLift {
  /** `enum PlatformLiftID` */
  index: number
  map: number
  /** 아래층·위층의 높이(칸). `floorHeights` 그대로다 */
  floorHeights: readonly [number, number]
  startTileX: number
  startTileZ: number
  /** 그 z로 들어오면 아래층이다 (`..._BOTTOM_FLOOR_WARP_Z`) */
  bottomWarpZ: number
  /** 한 번 오르면 안 내려온다 */
  preventGoingDown: boolean
  kind: LiftKind
  /**
   * ⚠️ **강철섬 B2F 왼쪽 방에는 배치가 아예 없다.** 원작이 그 방에서만
   * 소품을 손으로 싣는다(`MapPropManager_LoadOne`) — 자리도 코드에 박혀 있고
   * 값이 x = 16·19+8 · z = 16·(32+12)+8이라 칸으로는 (19.5, 44.5)다.
   * 다른 여덟 자리의 소품 좌표가 전부 `(startTileX + 1.5, startTileZ + 0.5)`이므로
   * 이 자리도 같은 식으로 나온다 — 실측으로 확인했다
   */
  spawnsOwnProp: boolean
}

/** 맵 헤더 번호 (`include/data/map_headers.h`의 차례) */
const MAP = {
  ironIslandB1FRight: 291,
  ironIslandB2FLeft: 293,
  ironIslandB3F: 294,
  leagueToAaron: 176,
  leagueToBertha: 178,
  leagueToFlint: 180,
  leagueToLucian: 182,
  leagueToChampion: 184,
  championRoom: 185,
} as const

/**
 * `sPerMapPlatformLiftConfiguration` 아홉 줄 그대로.
 *
 * 사천왕 셋(버들·나연·대엽)이 0→5칸으로 같은데 아론만 0→10칸이다 — 그 방만
 * 두 배 높다
 */
export const PLATFORM_LIFTS: readonly PlatformLift[] = [
  {
    index: 0, map: MAP.ironIslandB1FRight,
    floorHeights: [1, 9], startTileX: 10, startTileZ: 23,
    bottomWarpZ: 26, preventGoingDown: false,
    kind: LIFT_KIND.ironIsland, spawnsOwnProp: false,
  },
  {
    index: 1, map: MAP.ironIslandB2FLeft,
    floorHeights: [1, 9], startTileX: 18, startTileZ: 44,
    // `MAP_TILES_COUNT_Z * 1 + 16` = 48
    bottomWarpZ: 48, preventGoingDown: false,
    kind: LIFT_KIND.ironIsland, spawnsOwnProp: true,
  },
  {
    index: 2, map: MAP.ironIslandB3F,
    floorHeights: [1, 9], startTileX: 8, startTileZ: 11,
    bottomWarpZ: 15, preventGoingDown: false,
    kind: LIFT_KIND.ironIsland, spawnsOwnProp: false,
  },
  {
    index: 3, map: MAP.leagueToAaron,
    floorHeights: [0, 10], startTileX: 3, startTileZ: 11,
    bottomWarpZ: 15, preventGoingDown: true,
    kind: LIFT_KIND.pokemonLeague, spawnsOwnProp: false,
  },
  {
    index: 4, map: MAP.leagueToBertha,
    floorHeights: [0, 5], startTileX: 3, startTileZ: 11,
    bottomWarpZ: 15, preventGoingDown: true,
    kind: LIFT_KIND.pokemonLeague, spawnsOwnProp: false,
  },
  {
    index: 5, map: MAP.leagueToFlint,
    floorHeights: [0, 5], startTileX: 3, startTileZ: 11,
    bottomWarpZ: 15, preventGoingDown: true,
    kind: LIFT_KIND.pokemonLeague, spawnsOwnProp: false,
  },
  {
    index: 6, map: MAP.leagueToLucian,
    floorHeights: [0, 5], startTileX: 3, startTileZ: 11,
    bottomWarpZ: 15, preventGoingDown: true,
    kind: LIFT_KIND.pokemonLeague, spawnsOwnProp: false,
  },
  {
    index: 7, map: MAP.leagueToChampion,
    floorHeights: [0, 5], startTileX: 3, startTileZ: 19,
    bottomWarpZ: 23, preventGoingDown: true,
    kind: LIFT_KIND.pokemonLeague, spawnsOwnProp: false,
  },
  {
    index: 8, map: MAP.championRoom,
    floorHeights: [0, 15], startTileX: 7, startTileZ: 8,
    bottomWarpZ: 18, preventGoingDown: true,
    kind: LIFT_KIND.pokemonLeague, spawnsOwnProp: false,
  },
]

export function liftForMap(map: number): PlatformLift | null {
  return PLATFORM_LIFTS.find((l) => l.map === map) ?? null
}

/** 소품이 서는 칸 좌표. 아홉 자리 전부 상자의 가운데다 */
export function liftPropTile(lift: PlatformLift): { x: number; z: number } {
  return { x: lift.startTileX + LIFT_SIZE_X / 2, z: lift.startTileZ + LIFT_SIZE_Z / 2 - 0.5 }
}

export interface LiftState {
  /** `LIFT_FLOOR` */
  floorID: number
  /** 들어올 때 이미 위였으면 거짓 (`notUsedWhenEnteredMap`) */
  notUsedWhenEnteredMap: boolean
}

/**
 * 맵에 들어설 때의 층 (`PersistedMapFeatures_InitForPlatformLift`).
 *
 * ⚠️ **강철섬 셋은 `notUsedWhenEnteredMap`을 안 끈다.** 위로 들어와도 참인
 * 채로 두는데, 그 셋은 좌표 트리거를 안 쓰고(내려올 수 있으니까) 스크립트도
 * 그 값을 안 묻는다 — 원작 코드의 `if`가 리그 여섯에만 붙어 있다
 */
export function liftStateOnEnter(lift: PlatformLift, enterZ: number): LiftState {
  if (enterZ === lift.bottomWarpZ) {
    return { floorID: LIFT_FLOOR.bottom, notUsedWhenEnteredMap: true }
  }
  return {
    floorID: LIFT_FLOOR.top,
    notUsedWhenEnteredMap: lift.kind !== LIFT_KIND.pokemonLeague,
  }
}

/** 밟았을 때 실제로 움직이는가 (`PlatformLift_Trigger`의 첫 `if`) */
export function liftCanMove(lift: PlatformLift, floorID: number): boolean {
  return !(lift.preventGoingDown && floorID === LIFT_FLOOR.top)
}

/**
 * 한 프레임에 올라가는 높이(칸).
 *
 * ⚠️ **오를 때만 갈래를 본다.** 리그가 `FX32_ONE * 2`, 강철섬이 `FX32_ONE`이고
 * 한 칸이 `FX32_ONE * 16`이라 16으로 나눈 값이다
 */
export function liftRiseStep(kind: LiftKind): number {
  return (kind === LIFT_KIND.pokemonLeague ? 2 : 1) / 16
}

/** 내려갈 때는 갈래에 상관없이 한 걸음이다 (`FieldTask_PlatformLiftGoDown`) */
export const LIFT_FALL_STEP = 1 / 16

/** 효과음 (`generated/sdat.txt`의 닻으로 센 번호) */
export const LIFT_SFX = {
  /** `SEQ_SE_DP_ELEBETA` — 강철섬 */
  ironIsland: 1553,
  /** `SEQ_SE_DP_ELEBETA4` — 리그 */
  pokemonLeague: 1556,
  /** `SEQ_SE_DP_KI_GASYAN` — 다 닿았을 때 한 번 */
  arrive: 1562,
} as const

export function liftMoveSfx(kind: LiftKind): number {
  return kind === LIFT_KIND.pokemonLeague ? LIFT_SFX.pokemonLeague : LIFT_SFX.ironIsland
}
