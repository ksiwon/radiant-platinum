// 파열된 세계의 규칙 (PARITY §6.10) — `overlay009/ov9_02249960.c`
//
// 여기서만 **서 있는 면이 바닥이 아니다.** 같은 (x, y, z)라도 지금 어느 판 위에
// 있느냐에 따라 통행 여부가 달라진다. 그래서 이 세계는 맵 격자를 안 보고
// 「지금 판」의 통행 격자를 본다.
//
// 판은 네 갈래다 — 바닥 · 서쪽 벽 · 동쪽 벽 · 천장. 갈래마다 (x, y, z) 셋 중
// 어느 둘을 격자의 세로·가로로 쓰는지가 다르고, 벽과 천장은 **한 축이 뒤집힌다**.
//
// ⚠️ **`bounds`의 크기는 개수가 아니라 차이다.** `start + size`까지가 안이다.
// 개수로 읽으면 판마다 마지막 줄이 사라져서, 딱 그 줄에서만 못 걷게 된다.
import type {
  DistortionBounds, DistortionCamera, DistortionData, DistortionJump, DistortionMap,
  DistortionPlatform,
} from '../../data/schema'
import { DIR } from '../script/movement'

/** `FLOATING_PLATFORM_KIND_*` */
export const PLATFORM_FLOOR = 0
export const PLATFORM_WEST_WALL = 1
export const PLATFORM_EAST_WALL = 2
export const PLATFORM_CEILING = 3
/** `FLOATING_PLATFORM_KIND_INVALID`. 「판 위가 아니다」 */
export const PLATFORM_NONE = 4

/** `INVALID_TERRAIN_ATTRIBUTES` — 판이 아예 없다 */
export const ATTRS_INVALID = -1
/** `OUT_OF_BOUNDS_TERRAIN_ATTRIBUTES` — 판은 있는데 그 밖이다 */
export const ATTRS_OUT_OF_BOUNDS = -2

/** `TERRAIN_ATTRIBUTES_COLLISION_MASK` */
const COLLISION_BIT = 0x8000
/** `TERRAIN_ATTRIBUTES_TILE_BEHAVIOR_MASK` */
const BEHAVIOR_MASK = 0xff

/** 세계의 세로 범위 (`DISTORTION_WORLD_MIN_Y`·`MAX_Y`) */
export const WORLD_MIN_Y = 65
export const WORLD_MAX_Y = 289

/** `DistWorldProgress` */
export const PROGRESS = {
  none: 0,
  entered1F: 1,
  jumpedOn1FElevator: 2,
  enteredB1F: 3,
  sawB1FMesprit: 4,
  talkedToB2FCynthia: 5,
  talkedToB3FCyrus: 6,
  finishedBoulderPuzzle: 7,
  enteredB7F: 8,
  listenedToCynthiaCyrus: 9,
  wonCyrusBattle: 10,
  giratinaRoomFirstShadow: 11,
  giratinaRoomSecondShadow: 12,
  giratinaArrived: 13,
  battledGiratina: 14,
} as const

/** `FlagCondition` */
export const FLAG_COND = {
  none: 0,
  boulderFalse: 1,
  boulderTrue: 2,
  progressEq: 3,
  progressLeq: 4,
  progressGeq: 5,
  manualAddOnly: 6,
  giratinaShadow: 7,
  cyrusAppearance: 8,
} as const

/** `EventCmdKind` */
export const EVENT_CMD = {
  setMapObjectAnimation: 0,
  movePlatform: 1,
  addMapObject: 2,
  deleteMapObject: 3,
  cascadeUp: 4,
  startScript: 5,
  setProgress: 6,
  showGiratinaShadow: 7,
  setGiratinaAnimationFlag: 8,
  setPuzzleFlag: 9,
  cascadeDown: 10,
  playGiratinaArrival: 11,
  showUxieBoulderTuto: 12,
  showAzelfBoulderTuto: 13,
  showMespritBoulderTuto: 14,
  showGiratinaRoomPlatforms: 15,
  hideGiratinaRoomPlatforms: 16,
  clearPuzzleFlag: 17,
} as const

/** 파열된 세계의 맵 번호 (`generated/map_headers.txt`의 줄 −1) */
export const MAP = {
  f1: 573, b1f: 574, b2f: 575, b3f: 576, b4f: 577,
  // ⚠️ **578번이 비어 있다.** B4F 다음 줄이 B5F가 아니다
  b5f: 579, b6f: 580, b7f: 581,
  giratinaRoom: 582, turnbackCaveRoom: 583,
} as const

/**
 * 밟으면 스크립트가 서는 자리 두 곳 (`*_TELEPORT_TILE_*`).
 *
 * 워프가 아니라 **막힘**으로 만들어져 있다 — 한 칸 앞에서 이미 못 지나가고
 * (`DistWorld_DynamicMapFeaturesCheckCollision`), 그 칸을 보고 서면 스크립트가 선다
 */
export const TELEPORT = {
  giratinaRoom: { map: MAP.giratinaRoom, x: 15, y: 1, z: 25, dir: DIR.south, script: 4 },
  b7f: { map: MAP.b7f, x: 89, y: 65, z: 57, dir: DIR.north, script: 2 },
} as const

/** 기라티나를 이긴 뒤 신오가 막고 서는 칸 (`GIRATINA_ROOM_POST_BATTLE_CYNTHIA_*`) */
export const CYNTHIA_BLOCK = { x: 15, y: 1, z: 15 } as const

/** 양끝을 **포함한다** (`DistWorldBounds_AreCoordinatesInBounds`) */
export function inBounds(x: number, y: number, z: number, b: DistortionBounds): boolean {
  return y >= b.y && y <= b.y + b.sy
    && z >= b.z && z <= b.z + b.sz
    && x >= b.x && x <= b.x + b.sx
}

/**
 * 그 자리에 판이 있는가 (`HasFloatingPlatformAtCoords`).
 *
 * ⚠️ **원작의 조건이 뒤집혀 있다** — `kind != INVALID || kind == 판의 갈래`라서,
 * 갈래를 주면 갈래 검사가 **통째로 무시되고** 자리만 본다. 고치지 않는다:
 * 부르는 자리가 하나뿐이고(`player_move.c`가 판을 갈아탈지 묻는 자리),
 * 거기서는 "아무 판에라도 들어가는가"가 실제로 맞는 물음이다. 갈래까지 맞춰
 * 보게 고치면 바닥에서 벽으로 넘어가는 자리가 전부 막힌다
 */
export function hasPlatformAt(
  platforms: readonly DistortionPlatform[], x: number, y: number, z: number, kind: number,
): boolean {
  for (const p of platforms) {
    if (!inBounds(x, y, z, p.bounds)) continue
    if (kind !== PLATFORM_NONE || kind === p.kind) return true
  }
  return false
}

/**
 * 그 자리의 판을 고른다 (`FindAndPrepareNewCurrentFloatingPlatform`).
 *
 * `kind`가 `PLATFORM_NONE`이면 갈래를 안 가린다. 아니면 **같은 갈래만** 고른다 —
 * 그래서 걷다가 저절로 벽으로 올라가지는 않는다. 벽으로 넘어가는 것은 전부
 * 「뛰는 자리」가 시킨다. 없으면 −1
 */
export function findPlatform(
  platforms: readonly DistortionPlatform[], x: number, y: number, z: number,
  kind: number = PLATFORM_NONE,
): number {
  for (const [i, p] of platforms.entries()) {
    if (!inBounds(x, y, z, p.bounds)) continue
    if (kind === PLATFORM_NONE || kind === p.kind) return i
  }
  return -1
}

/**
 * 판 위 한 칸의 통행 값 (`GetCurrentFloatingPlatformTileAttributes`).
 *
 * 갈래마다 격자의 세로·가로가 다르다:
 *
 * · 바닥 — 세로 x · 가로 z
 * · 서쪽 벽 — 세로 **`sizeY − (y − startY)`** (뒤집힌다) · 가로 z
 * · 동쪽 벽 — 세로 y · 가로 z
 * · 천장 — 세로 **`sizeX − (x − startX)`** (뒤집힌다) · 가로 z
 *
 * ⚠️ 격자를 읽는 자리가 `세로 + 가로 × rows`다 — **세로가 안쪽**이다
 */
export function tileAttributes(
  platform: DistortionPlatform | undefined, grid: readonly number[] | undefined,
  x: number, y: number, z: number,
): number {
  if (platform === undefined || grid === undefined) return ATTRS_INVALID
  const b = platform.bounds
  if (!inBounds(x, y, z, b)) return ATTRS_OUT_OF_BOUNDS
  let vertical: number
  switch (platform.kind) {
    case PLATFORM_FLOOR: vertical = x - b.x; break
    case PLATFORM_WEST_WALL: vertical = b.sy - (y - b.y); break
    case PLATFORM_EAST_WALL: vertical = y - b.y; break
    case PLATFORM_CEILING: vertical = b.sx - (x - b.x); break
    default: return ATTRS_INVALID
  }
  const horizontal = z - b.z
  return grid[vertical + horizontal * platform.rows] ?? ATTRS_INVALID
}

/** 막혔는가 (`DistWorld_CheckCollisionOnCurrentFloatingPlatform`). 판 밖도 막힘이다 */
export function blocked(attrs: number): boolean {
  if (attrs === ATTRS_INVALID || attrs === ATTRS_OUT_OF_BOUNDS) return true
  return (attrs & COLLISION_BIT) !== 0
}

/** 판 안의 칸인가 (`DistWorld_IsValidTileOnCurrentFloatingPlatform`) */
export function validTile(attrs: number): boolean {
  return attrs !== ATTRS_INVALID && attrs !== ATTRS_OUT_OF_BOUNDS
}

/** 그 칸의 성질 (`DistWorld_GetTileBehaviorOnCurrentFloatingPlatform`) */
export function tileBehavior(attrs: number): number | null {
  return validTile(attrs) ? attrs & BEHAVIOR_MASK : null
}

/** 뛰는 자리 (`FindFloatingPlatformJumpPointAt`). 방향이 먼저다 */
export function jumpAt(
  jumps: readonly DistortionJump[], x: number, y: number, z: number, dir: number,
): DistortionJump | null {
  for (const j of jumps) {
    if (j.dir !== dir) continue
    if (inBounds(x, y, z, j.bounds)) return j
  }
  return null
}

/**
 * 뛰고 나서 보는 쪽 (`JumpOnFloatingPlatform`의 `newPlayerDirs`).
 *
 * 벽·천장에 서 있으면 화면의 위아래좌우가 세계의 그것과 어긋난다. 그 표다 —
 * **판을 갈아타기 전의 갈래**로 돌린다
 */
export function faceOnPlatform(dir: number, kind: number): number {
  switch (kind) {
    case PLATFORM_WEST_WALL:
      return [DIR.west, DIR.east, DIR.north, DIR.south][dir] ?? dir
    case PLATFORM_EAST_WALL:
      return [DIR.east, DIR.west, DIR.north, DIR.south][dir] ?? dir
    case PLATFORM_CEILING:
      return [DIR.south, DIR.north, DIR.east, DIR.west][dir] ?? dir
    default:
      return dir
  }
}

/** 카메라 각 (`FindCameraAngleForPlayerPosition`) */
export function cameraAt(
  cameras: readonly DistortionCamera[], x: number, y: number, z: number, dir: number,
): DistortionCamera | null {
  for (const c of cameras) {
    if (c.dir !== dir) continue
    if (inBounds(x, y, z, c.bounds)) return c
  }
  return null
}

/** 세이브에 남는 것 (`DistWorldPersistedData`) */
export interface DistortionState {
  /** 한 번이라도 들어와 봤는가. 아니면 카메라·판을 처음부터 다시 잡는다 */
  valid: boolean
  /** 감춘 유령 소품 무리. 24비트 */
  hiddenGroups: number
  /** 지금 서 있는 판. 4비트라 **판이 열여섯을 넘으면 못 담는다** */
  platformIndex: number
  cameraAngleX: number
  cameraAngleY: number
  cameraAngleZ: number
  /** 움직인 발판 11자리 */
  platformFlags: number
  /** 바위 수수께끼 17자리 */
  puzzleFlags: number
}

export function newDistortionState(): DistortionState {
  return {
    valid: false, hiddenGroups: 0, platformIndex: 0,
    cameraAngleX: 0, cameraAngleY: 0, cameraAngleZ: 0,
    platformFlags: 0, puzzleFlags: 0,
  }
}

/** 판 자리는 4비트다 (`DIST_WORLD_PERSISTED_DATA_CURRENT_FLOATING_PLATFORM_MAX`) */
export const MAX_PERSISTED_PLATFORMS = 16

/** 유령 소품 무리는 24개까지다 (`GHOST_PROP_GROUP_MAX_COUNT`) */
export const MAX_GHOST_PROP_GROUPS = 24

export function groupHidden(state: DistortionState, group: number): boolean {
  return (state.hiddenGroups & (1 << group)) !== 0
}

export function hideGroup(state: DistortionState, group: number): void {
  state.hiddenGroups |= 1 << group
}

export function showGroup(state: DistortionState, group: number): void {
  state.hiddenGroups &= ~(1 << group)
}

export function puzzleFlag(state: DistortionState, flag: number): boolean {
  return (state.puzzleFlags & (1 << flag)) !== 0
}

/**
 * 사건·소품이 걸리는 조건 (`CheckFlagCondition`).
 *
 * ⚠️ **`manualAddOnly`는 늘 거짓이다** — 스크립트가 직접 세우는 것만 있다는
 * 표시라 조건으로는 통과하지 않는다. 원작의 `switch`에 그 자리가 없다
 */
export function flagHolds(
  cond: number, val: number,
  ctx: { progress: number; state: DistortionState; giratinaAnim: (n: number) => boolean;
    cyrusAppearance: number },
): boolean {
  switch (cond) {
    case FLAG_COND.none: return true
    case FLAG_COND.boulderFalse: return !puzzleFlag(ctx.state, val)
    case FLAG_COND.boulderTrue: return puzzleFlag(ctx.state, val)
    case FLAG_COND.progressEq: return ctx.progress === val
    case FLAG_COND.progressLeq: return ctx.progress <= val
    case FLAG_COND.progressGeq: return ctx.progress >= val
    case FLAG_COND.giratinaShadow: return !ctx.giratinaAnim(val)
    case FLAG_COND.cyrusAppearance: return ctx.cyrusAppearance === val
    default: return false
  }
}

/** 층 잇기 (`GetConnectionsForMap`) */
export function connectionOf(
  data: Pick<DistortionData, 'connections'>, map: number,
): { prev: number; next: number } | null {
  for (const c of data.connections) {
    if (c.currID === map) return { prev: c.prevID, next: c.nextID }
  }
  return null
}

export function mapOf(data: Pick<DistortionData, 'maps'>, map: number): DistortionMap | null {
  return data.maps.find((m) => m.map === map) ?? null
}

/**
 * 서 있는 판이 정하는 **걷는 축**.
 *
 * · 바닥·천장 — (x, z)를 걷고 y가 판의 높이에 붙는다
 * · 서쪽·동쪽 벽 — (y, z)를 걷고 x가 판의 x에 붙는다
 *
 * ⚠️ **부호가 갈래마다 다르다.** 통행 격자의 세로 자리가 서쪽 벽과 천장에서
 * 뒤집혀 있어서(`tileAttributes`), 화면에서 오른쪽으로 가는 것이 세계에서는
 * 축이 줄어드는 쪽이다. 안 맞추면 벽에서 좌우가 뒤집힌 채로 걷는다
 */
export interface DistortionFrame {
  /** 걷는 첫째 축 (둘째는 늘 z다) */
  axis: 'x' | 'y'
  /** 그 축이 화면 오른쪽과 같은 방향인가 */
  sign: 1 | -1
  /** 고정되는 축의 값 (맵 좌표) */
  lock: number
  lockAxis: 'x' | 'y'
}

/**
 * 씬이 채우는 다리.
 *
 * `src/engine`은 스토어도 자료 파일도 못 읽는다 (PLAN §3.2). 이동 시스템이
 * 파열된 세계를 알아야 하는 것은 **두 가지뿐**이라 그 둘만 꽂는다
 */
export const distortionBridge: {
  /** 그 칸이 막혔는가. 판 위가 아니면 null — 그때는 평소의 맵 격자를 본다 */
  blockedAt: ((x: number, y: number, z: number) => boolean | null) | null
  /** 지금 걷는 축. 파열된 세계 밖이면 null */
  frame: (() => DistortionFrame | null) | null
} = { blockedAt: null, frame: null }

/** 파열된 세계의 맵인가 */
export function isDistortionMap(data: Pick<DistortionData, 'maps'>, map: number): boolean {
  return data.maps.some((m) => m.map === map)
}
