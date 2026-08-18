// 깨어진 세계를 세계에 이어 붙인다 (PARITY §6.10)
//
// 규칙은 `engine/world/distortion`에 있고, 여기서는 **누가 언제 손대는가**만 정한다:
//
//   맵에 들어선다   → 자료를 받고 발밑의 판을 잡는다 (`InitMapElements`)
//   한 칸 걸었다    → 카메라 각 · 뛰는 자리 · 사건 (`DistWorld_HandlePlayerMoved`)
//   판을 갈아탄다   → 중력이 돈다 (`AvatarDistortionState`)
//   맵을 나간다     → 서 있던 판과 카메라 각을 세이브에 적는다
//
// ⚠️ **자료의 좌표는 세계 좌표다.** 맵마다 (offsetX, offsetY, offsetZ)를 더해
// 여덟 층을 하나의 세로 통로로 쌓아 놓았다 — 1F가 y=289, B7F가 y=65다.
// 우리 맵 격자는 층마다 0에서 시작하므로 오갈 때마다 이 값을 더하고 뺀다.
import { Vector3 } from 'three'
import { surfaceVector } from '../engine/actor/distortionSurface'
import { loadDistortion } from '../data/gameData'
import type { DistortionData, DistortionMap } from '../data/schema'
import {
  ATTRS_INVALID, CYNTHIA_BLOCK, EVENT_CMD, FLAG_COND, MAP, PLATFORM_CEILING, PLATFORM_EAST_WALL,
  PLATFORM_FLOOR, PLATFORM_NONE, PLATFORM_WEST_WALL, PROGRESS, TELEPORT, blocked, cameraAt,
  connectionOf, findPlatform,
  flagHolds, initialHiddenGroups, MAX_PERSISTED_PLATFORMS, distortionBridge, hasPlatformAt,
  jumpAt, mapOf,
  tileAttributes, tileBehavior, type DistortionFrame, type DistortionState,
} from '../engine/world/distortion'
import { DIR } from '../engine/script/movement'
import {
  cameraDegrees, cameraTurnAngles, cameraTurnDone, type CameraTurn,
} from '../engine/world/distortionCamera'
import { SFX } from '../engine/audio/sfx'
import { music } from '../engine/audio/music'
import {
  CASCADE_UNIT, cascadeAt, cascadeBob, cascadeBobFix, cascadeCameraAt, cascadeFrames,
  cascadeLoadFrame, cascadeOffset, cascadeRoll, type CascadeSite,
} from '../engine/world/distortionCascade'

/**
 * `DIST_WORLD_PLATFORM_FLAG_B5F_1` — 폭포로 내려가면 서는 B5F의 승강 발판.
 *
 * 원작이 폭포 끝에서 이 플래그를 세우고 그 발판을 세운다
 * (`InitSpecificMovingPlatformPropForMap(..., B5F, 0)`) — 없으면 내려가 놓고
 * 다음 층으로 갈 발판이 안 보인다
 */
const CASCADE_B5F_FLAG = 7
import {
  ELEVATOR_DIR, changeMapFrame, cyrusB4FWalk, cyrusLeavesB4F, DIST_OBJ, downEndFlags, elevatorAt,
  elevatorLegs, initialPlatformFlags, legFrames, passengerAfter, passengerLocalID,
  platformFlagShown, upStartFlags,
  withFlag, type ElevatorLeg,
} from '../engine/world/distortionElevator'
import {
  FALL_DEST, fallDestination, fallLocationAt, fellIntoPit, fellIntoWrongPit, fellToB6F,
  initialPuzzleFlags, puzzleSolved,
} from '../engine/world/distortionBoulder'
import {
  HOP_FRAMES, HOP_TILES, VIBRATION, hopDirOf, hopLift, platformFrames,
} from '../engine/world/distortionMovePlatform'
import { DIR_STEP } from '../engine/script/movement'
import { addNpcFrom, npcActors, removeNpc } from '../engine/actor/npcs'
import { world, type Npc } from '../engine/map/world'
import type { VarStore } from '../engine/script/vars'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'

let data: DistortionData | null = null
let loading: Promise<void> | null = null

/** 지금 서 있는 층. 깨어진 세계 밖이면 null */
let floor: DistortionMap | null = null
/** `floor.platforms`의 몇 번째. 판 위가 아니면 −1 */
let platform = -1

/** 자료를 받는다. 깨어진 세계에 처음 들어설 때 한 번이면 된다 */
export function distortionPreload(): Promise<void> {
  loading ??= loadDistortion().then((d) => { data = d })
  return loading
}

export function distortionLoaded(): boolean {
  return data !== null
}

/** 그 맵이 깨어진 세계인가. 자료가 없으면 **맵 번호만** 보고 답한다 */
export function isDistortionFloor(mapId: number): boolean {
  if (data !== null) return mapOf(data, mapId) !== null
  return Object.values(MAP).includes(mapId as never)
}

function state(): DistortionState {
  return useSaveStore.getState().distortion
}

function setState(next: Partial<DistortionState>): void {
  useSaveStore.setState({ distortion: { ...state(), ...next } })
}

// ── 좌표 ─────────────────────────────────────────────────────────────────────

/** 우리 맵 좌표 → 세계 좌표. y는 타일 단위 높이다 */
export function toWorldTiles(x: number, y: number, z: number): [number, number, number] {
  if (floor === null) return [Math.floor(x), Math.round(y), Math.floor(z)]
  return [
    Math.floor(x) + floor.offsetX,
    Math.round(y) + floor.offsetY,
    Math.floor(z) + floor.offsetZ,
  ]
}

/** 세계 좌표 → 우리 맵 좌표 */
export function toLocalTiles(x: number, y: number, z: number): [number, number, number] {
  if (floor === null) return [x, y, z]
  return [x - floor.offsetX, y - floor.offsetY, z - floor.offsetZ]
}

// ── 중력 ─────────────────────────────────────────────────────────────────────

/**
 * 지금 서 있는 판의 갈래 (`GetCurrentFloatingPlatformKind`).
 *
 * 바닥이 아니면 **움직이는 축이 바뀐다** — 벽에서는 x가 고정되고 y가 걷는 축이
 * 된다. 판 위가 아니면 `PLATFORM_NONE`이고 그때는 평범한 맵 격자를 쓴다
 */
export function distortionKind(): number {
  if (floor === null || platform < 0) return PLATFORM_NONE
  return floor.platforms[platform]?.kind ?? PLATFORM_NONE
}

export function distortionFrame(): DistortionFrame | null {
  if (floor === null || platform < 0) return null
  const p = floor.platforms[platform]
  if (p === undefined) return null
  const [lx, ly] = toLocalTiles(p.bounds.x, p.bounds.y, 0)
  // 벽은 x가 판에 붙고, 바닥·천장은 y가 붙는다. 걷는 축과 회전은 갈래에서
  // 나오므로 여기서 따로 안 적는다 (`platformBasis`)
  switch (p.kind) {
    case PLATFORM_FLOOR:
    case PLATFORM_CEILING:
      return { kind: p.kind, lock: ly, lockAxis: 'y' }
    case PLATFORM_WEST_WALL:
    case PLATFORM_EAST_WALL:
      return { kind: p.kind, lock: lx, lockAxis: 'x' }
    default:
      return null
  }
}

// ── 통행 ─────────────────────────────────────────────────────────────────────

/**
 * 그 칸이 막혔는가. **맵 좌표로 묻는다.**
 *
 * 판 위가 아니면 null을 준다 — 그때는 부르는 쪽이 평소의 맵 격자를 본다.
 * 원작도 판이 없는 층(1F·B5F·B6F·B7F)에서는 보통 판정으로 돌아간다
 */
export function distortionBlockedAt(x: number, y: number, z: number): boolean | null {
  if (floor === null) return null
  const [wx, wy, wz] = toWorldTiles(x, y, z)
  // 스크립트가 서는 두 칸은 **막힘으로 만들어져 있다**
  // (`DistWorld_DynamicMapFeaturesCheckCollision`) — 판이 있든 없든 먼저 본다
  if (floor.map === TELEPORT.giratinaRoom.map
    && wx === TELEPORT.giratinaRoom.x && wz === TELEPORT.giratinaRoom.z + 1) return true
  if (floor.map === TELEPORT.b7f.map
    && wx === TELEPORT.b7f.x && wz === TELEPORT.b7f.z - 1) return true
  if (platform < 0) return null
  const p = floor.platforms[platform]
  const attrs = tileAttributes(p, data?.attrs[p?.attr ?? -1], wx, wy, wz)
  if (attrs === ATTRS_INVALID) return null
  return blocked(attrs)
}

/**
 * 판 위 그 칸의 성질 (`DistWorld_GetTileBehaviorOnCurrentFloatingPlatform`).
 *
 * 판 위가 아니면 null이고, 그때는 부르는 쪽이 맵 격자의 성질을 본다 —
 * 판이 없는 층이 열 중 여섯이라 실제로는 그쪽이 흔하다
 */
export function distortionBehaviorAt(x: number, y: number, z: number): number | null {
  if (floor === null || platform < 0) return null
  const p = floor.platforms[platform]
  if (p === undefined) return null
  const [wx, wy, wz] = toWorldTiles(x, y, z)
  return tileBehavior(tileAttributes(p, data?.attrs[p.attr], wx, wy, wz))
}

/** 바라보는 각 넷의 로컬 걸음 (`FACING_STEP`과 같은 차례) */
const FACE_STEP = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const

/**
 * 판 위에서 **앞 칸** (`tileInFront`의 깨어진 세계 몫).
 *
 * ⚠️ **바라보는 각은 판 위의 로컬 각이다** (`surfaceHeading`). 좌표는 세계
 * 축이라, 로컬 걸음을 판의 기저로 되돌려야 앞 칸이 나온다 — 천장에서는
 * 앞뒤가 좌표의 z와 **뒤집혀** 있어서, 그냥 x·z로 세면 등 뒤 칸을 집는다.
 * 판 위가 아니면 null이고 그때는 부르는 쪽이 평소대로 센다.
 *
 * 바닥 판에서는 기저가 항등이라 값이 안 바뀐다
 */
export function distortionFrontTile(
  x: number, y: number, z: number, facing: number,
): { x: number, y: number, z: number } | null {
  const frame = distortionFrame()
  if (frame === null) return null
  const step = FACE_STEP[((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4]
  if (step === undefined) return null
  surfaceVector(frame, step[0], 0, step[1], frontStep)
  return {
    x: Math.floor(x) + Math.round(frontStep.x),
    // 벽에서는 앞뒤가 **오르내림**이라 y도 바뀐다
    y: Math.round(y) + Math.round(frontStep.y),
    z: Math.floor(z) + Math.round(frontStep.z),
  }
}
const frontStep = new Vector3()

/**
 * 시로나가 막고 서서 못 뛰는 칸인가 (`DistWorld_IsBlockedByCynthia`).
 *
 * 기라티나를 이긴 **직후에만** 참이다 — 그 방에서 남쪽으로 뛰어 나가려는
 * 것을 한 칸으로 막아 세운다. 다음 진행도로 넘어가면 풀린다.
 *
 * ⚠️ 원작은 셋째 인자를 `tileY`라 부르면서 `..._TILE_Y`(1)와 견주는데,
 * 부르는 쪽은 거기에 **방향**을 넘긴다 (`PlayerAvatar_WillJumpTwice`).
 * 그래서 실제로 걸리는 것은 남쪽(`DIR_SOUTH` = 1)뿐이다. 그대로 옮긴다
 */
export function distortionJumpBlocked(x: number, z: number, dir: number): boolean {
  if (floor === null || floor.map !== MAP.giratinaRoom) return false
  const [wx, , wz] = toWorldTiles(x, 0, z)
  if (wx !== CYNTHIA_BLOCK.x || wz !== CYNTHIA_BLOCK.z || dir !== DIR.south) return false
  return (distortionHooks.progress?.() ?? 0) === PROGRESS.battledGiratina
}

/**
 * 발밑의 판을 다시 잡는다 (`player_move.c` 232~237줄).
 *
 * 지금 판 밖으로 나갔는데 **아무 판에라도** 들어가는 자리면 그 판으로 갈아탄다.
 * 갈아탈 판을 고르는 것은 `findPlatform`이고 그쪽은 **같은 갈래만** 본다 —
 * 벽으로 넘어가는 것은 뛰는 자리가 시킨다 (`engine/world/distortion` 머리말)
 */
export function distortionRebindPlatform(x: number, y: number, z: number): void {
  if (floor === null) return
  const [wx, wy, wz] = toWorldTiles(x, y, z)
  const kind = distortionKind()
  const p = floor.platforms[platform]
  if (p !== undefined) {
    const attrs = tileAttributes(p, data?.attrs[p.attr], wx, wy, wz)
    if (attrs !== ATTRS_INVALID && attrs !== -2) return
  }
  if (!hasPlatformAt(floor.platforms, wx, wy, wz, kind)) return
  const found = findPlatform(floor.platforms, wx, wy, wz, kind)
  if (found >= 0) bindPlatform(found)
}

/**
 * 서 있는 판을 갈아 끼운다.
 *
 * ⚠️ **판 밖도 판이다.** 뛰는 자리의 절반은 `platformIndex`가 0xFFFF인데,
 * 그것이 「벽에서 내려와 보통 바닥으로」라는 뜻이다. 표 밖의 번호를 그대로
 * 두면 세이브가 안 들어가므로(4비트) 원작처럼 **판 개수**를 적어 둔다 —
 * 그 값이 곧 「어느 판도 아니다」다
 */
function bindPlatform(index: number): void {
  const count = floor?.platforms.length ?? 0
  const outside = index < 0 || index >= count
  platform = outside ? -1 : index
  setState({ platformIndex: outside ? Math.min(count, MAX_PERSISTED_PLATFORMS - 1) : index })
}

// ── 들고 나기 ────────────────────────────────────────────────────────────────

/**
 * 깨어진 세계의 한 층에 들어섰다 (`InitMapElements`).
 *
 * ⚠️ 원작은 처음 들어올 때만 발밑을 보고 판을 잡고, 그 뒤로는 **세이브에 적힌
 * 판 번호**를 그대로 쓴다 (`IsPersistedDataValid`). 층을 넘나들 때 판이 도로
 * 바닥으로 잡히면 벽에 붙어 있다가 층을 옮긴 순간 떨어지기 때문이다
 */

/**
 * 이 세계에서 서 있는 높이 (맵 안 좌표). 한 층 내내 **한 값**이다.
 *
 * ⚠️ **여기서는 지면을 따라가지 않는다.** 원작이 이 세계에 들어서면서
 * `MapObject_SetHeightCalculationDisabled(playerMapObj, TRUE)`를 건다
 * (`InitPlayer`) — 서쪽 벽에 붙어 있을 때만 푼다. 즉 주인공의 y는 지형에서
 * 읽는 값이 아니라 **들고 다니는 상태**고, 승강 발판·뛰는 자리·움직이는
 * 발판·벽 걷기만 그것을 바꾼다.
 *
 * 처음 서는 높이는 원작이 `LoadFloor`에서 한 줄로 적어 둔다 —
 * `playerPos.y = mapOffset.y + MAP_OBJECT_TILE_SIZE`, 즉 **층 오프셋 + 한 칸**.
 * 층을 오르내려도 그대로다: 승강 경로의 y 변화(−32·−14·−50)가 층 오프셋의
 * 차이와 정확히 같아서 지역 y가 보존된다.
 *
 * ⚠️ **판의 bounds나 배치표의 중앙값으로 짐작하면 안 된다.** 그렇게 하던 때
 * B2F에서 여덟 칸이 떴다 — 그 층의 바닥 판 넷이 세계 y=233(지역 9)에 있는데
 * 그건 서쪽 벽을 타고 올라가야 닿는 위층이고, 바닥은 지역 1이다 (실측:
 * 걸을 수 있는 196칸 중 170칸의 그림이 지역 1, 지역 9에는 셋뿐)
 */
export const DISTORTION_STAND_Y = 1

export function distortionGroundY(mapId: number): number | null {
  // ⚠️ 지금 걸린 층(`floor`)도, 받아 놓은 자료도 보지 않는다. 워프는 자리를
  // **먼저** 잡고 층을 나중에 거는데 그때 `floor`는 아직 떠나온 층이고,
  // 자료는 처음 들어설 때 아직 안 와 있다 — 그 한 번을 놓치면 y가 0으로
  // 잡히고, 그러면 승강 발판이 있는 칸의 세계 y가 한 칸 어긋나 **아래층으로
  // 내려가는 발판이 안 걸린다** (실측: 1F에서 발판을 밟아도 안 탔다)
  return isDistortionFloor(mapId) ? DISTORTION_STAND_Y : null
}

/**
 * 그 층의 판 한가운데 (맵 안 좌표). 판이 없으면 null이다.
 *
 * ⚠️ **이 세계에서는 「(x,z) 고르고 높이 물어보기」가 성립하지 않는다.** 판이
 * 벽이면 걷는 면이 세로라, 맵 격자에서 고른 (x,z)는 판 위가 아니라 허공이다 —
 * 확인 지점이 그렇게 잡혀서 주인공과 난천이 판 속에 묻힌 채로 섰다.
 *
 * 판마다 서는 면이 다르다: 바닥·천장은 y가 고정이고 x·z로 걷지만, 서쪽·동쪽
 * 벽은 **x가 고정**이고 y·z로 걷는다 (`tileAttributes`가 그 축을 가른다)
 */
export function distortionSpawn(mapId: number): { x: number; y: number; z: number } | null {
  const map = data === null ? null : mapOf(data, mapId)
  if (map === null) return null
  const p = map.platforms[0]
  if (p === undefined) return null
  const b = p.bounds
  const mid = (at: number, size: number) => at + Math.floor(size / 2)
  return {
    x: mid(b.x, b.sx) - map.offsetX,
    y: mid(b.y, b.sy) - map.offsetY,
    z: mid(b.z, b.sz) - map.offsetZ,
  }
}

/**
 * 그 칸의 발 높이. 깨어진 세계면 판에서, 아니면 맵 격자에서 받는다.
 *
 * 주인공·NPC·소품이 **같은 함수**를 봐야 한다 — 한쪽만 고치면 사람은 판 위에
 * 서고 다른 쪽은 판 속에 묻힌다. 실제로 난천이 그렇게 묻혀 있었다
 */
export function groundYAt(
  grid: { heightAtWorld(x: number, z: number, layer: number): number | null },
  mapId: number, x: number, z: number, layer: number,
  /**
   * 그 배우가 배치표에서 받은 제 높이.
   *
   * ⚠️ **깨어진 세계에서는 이게 맞고 격자가 틀리다.** 배치표의 y는 고정소수점
   * 세계 높이라(`distortionAddObject`가 풀어 둔다) 층마다 다른데, 격자에 물으면
   * 0이 온다 — 그래서 난천이 판에 한 칸 파묻힌 채로 서 있었다
   */
  own?: number,
): number {
  if (isDistortionFloor(mapId)) {
    if (own !== undefined) return own
    const y = distortionGroundY(mapId)
    if (y !== null) return y
  }
  return grid.heightAtWorld(x, z, layer) ?? 0
}

export function distortionEnter(mapId: number, x: number, y: number, z: number): void {
  // 발판 자리 번호는 **층마다** 다시 센다 — 앞 층에서 밀려 있던 값을 들고
  // 오면 다음 층의 엉뚱한 판이 그만큼 옆으로 나가 서 있는다
  running = null
  slid.clear()
  stoodAside.clear()
  if (data === null) { floor = null; platform = -1; return }
  floor = mapOf(data, mapId)
  if (floor === null) { platform = -1; return }
  const s = state()
  if (!s.valid) {
    const [wx, wy, wz] = toWorldTiles(x, y, z)
    platform = findPlatform(floor.platforms, wx, wy, wz)
    // 처음 들어설 때 발판 자리와 바위 자리를 세운다 (`InitPersistedData`).
    // ⚠️ **들어선 층이 값을 바꾼다** — B7F로 들어오면 위로 갈 발판이 다 서 있다
    setState({
      valid: true,
      platformIndex: Math.max(0, platform),
      platformFlags: initialPlatformFlags(mapId),
      puzzleFlags: initialPuzzleFlags(distortionHooks.puzzleFinished?.() ?? false),
      hiddenGroups: initialHiddenGroups(floor.visibleGroups),
    })
    seatCamera()
    spawnFloorObjects(mapId)
    return
  }
  // 판 개수 이상이면 「어느 판도 아니다」다 — 보통 격자로 걷는다
  platform = s.platformIndex < floor.platforms.length ? s.platformIndex : -1
  seatCamera()
  spawnFloorObjects(mapId)
  // ⚠️ **층을 갈아탈 때마다 소품 보임새를 그 층 기본값으로 되돌린다.**
  // 원작이 층을 바꿀 때 `SetPersistedHiddenGhostPropGroups(system, 0)` 뒤에
  // `InitActiveGhostPropManager(system, TRUE)`를 부른다 — 즉 이어받는 것이
  // 아니라 **다시 세운다**. 안 그러면 앞 층에서 켠 무리가 다음 층에서 켜진
  // 채로 남아, 아직 나오면 안 되는 발판이 미리 서 있는다
  if (s.hiddenGroups !== initialHiddenGroups(floor.visibleGroups)) {
    setState({ hiddenGroups: initialHiddenGroups(floor.visibleGroups) })
  }
}

/** 깨어진 세계를 나갔다 */
export function distortionLeave(): void {
  floor = null
  platform = -1
  ride = null
  jumping = null
  running = null
  slid.clear()
  stoodAside.clear()
}

/** 지금 깨어진 세계 안인가 */
export function distortionActive(): boolean {
  return floor !== null
}

/** 이번 층의 모든 판. 그림을 그리는 쪽이 본다 */
export function distortionFloor(): DistortionMap | null {
  return floor
}

/**
 * 화면에 세울 소품 하나. 세 갈래를 한 모양으로 모은다.
 *
 * ⚠️ **유령 소품만 그리면 길이 안 보인다.** 원작의 소품은 세 관리자가 나눠
 * 든다 — 밟으면 나타나는 유령 소품(`InitGhostPropManager`), 층을 오르내리는
 * 승강 발판(`InitMovingPlatformPropsForMap`), 그리고 문·폭포·덩굴처럼 늘
 * 서 있는 것(`InitSimplePropsForMap`)이다. 뒤의 둘을 빼먹으면 **타야 할
 * 발판이 통째로 안 보인다** — 1F에서 아래로 내려가는 그 판이 그것이다
 */
export interface DistortionPropPlace {
  kind: number
  /** 맵 안 타일 좌표 (보정 전) */
  x: number
  y: number
  z: number
  /** 유령 소품의 무리. 나머지는 −1 */
  group: number
  /** 승강 발판의 자리 비트. 없으면 −1이고 늘 보인다 */
  flag: number
  /** 늘 서 있는 소품의 조건 (`CheckFlagCondition`) */
  cond: number
  condVal: number
  /** 승강 발판이면 표에서의 자리 번호. 아니면 −1 */
  elevator: number
}

const NO_FLAG = -1

/** 이번 층에 세울 소품 전부. 층이 바뀔 때 한 번만 부르면 된다 */
export function distortionPropPlaces(mapId: number): DistortionPropPlace[] {
  const map = data === null ? null : mapOf(data, mapId)
  if (map === null || data === null) return []
  const out: DistortionPropPlace[] = []
  for (const p of map.props) {
    out.push({
      kind: p.kind, x: p.x - map.offsetX, y: p.y - map.offsetY, z: p.z - map.offsetZ,
      group: p.group, flag: NO_FLAG, cond: 0, condVal: 0, elevator: -1,
    })
  }
  for (const t of data.movingPlatforms.find((m) => m.map === mapId)?.platforms ?? []) {
    out.push({
      kind: t.propKind,
      x: t.tileX - map.offsetX, y: t.tileY - map.offsetY, z: t.tileZ - map.offsetZ,
      group: -1, flag: t.persistedFlag, cond: 0, condVal: 0, elevator: t.index,
    })
  }
  for (const s of data.simpleProps.find((m) => m.map === mapId)?.props ?? []) {
    out.push({
      kind: s.propKind,
      x: s.tileX - map.offsetX, y: s.tileY - map.offsetY, z: s.tileZ - map.offsetZ,
      group: -1, flag: NO_FLAG, cond: s.flagCond, condVal: s.flagCondVal, elevator: -1,
    })
  }
  return out
}

/** 그 소품이 지금 보이는가. 세 갈래가 각자 다른 것을 본다 */
export function distortionPropShown(p: DistortionPropPlace): boolean {
  const s = state()
  if (p.group >= 0) return (s.hiddenGroups & (1 << p.group)) === 0
  if (p.flag !== NO_FLAG) return platformFlagShown(p.flag, s.platformFlags)
  return flagHolds(p.cond, p.condVal, {
    progress: distortionHooks.progress?.() ?? 0,
    state: s,
    giratinaAnim: (n: number) => distortionHooks.giratinaAnim?.(n) ?? false,
    cyrusAppearance: distortionHooks.cyrusAppearance?.() ?? 0,
  })
}

/**
 * 지금 타고 있는 발판의 자리 번호와 서 있는 칸 (맵 좌표).
 *
 * 타는 동안 그 발판은 주인공 발밑에 붙어 같이 간다 — 원작이 발판을 옮기고
 * 주인공을 그 위에 얹는다. 우리는 주인공 자리가 먼저 정해지므로 뒤집어 붙인다
 */
export function distortionRideAt(): { index: number; x: number; y: number; z: number } | null {
  if (ride === null) return null
  const p = worldState.player.position
  return { index: ride.platformIndex, x: p.x - 0.5, y: p.y, z: p.z - 0.5 }
}

// ── 한 칸 걸었다 ─────────────────────────────────────────────────────────────

/** 스크립트를 돌려 달라고 밖에 부탁하는 자리. `MapStreamer`가 채운다 */
export const distortionHooks: {
  runScript: ((scriptId: number) => void) | null
  progress: (() => number) | null
  setProgress: ((value: number) => void) | null
  giratinaAnim: ((n: number) => boolean) | null
  cyrusAppearance: (() => number) | null
  setCyrusAppearance: ((value: number) => void) | null
  /** `FLAG_DISTORTION_WORLD_PUZZLE_FINISHED` (2477) */
  puzzleFinished: (() => boolean) | null
  setPuzzleFinished: (() => void) | null
  /** 번호로 사람을 세운다. `fieldServices`가 스크립트 변수를 들고 있어서 거기 있다 */
  addObject: ((localID: number) => void) | null
  /** 스크립트 변수·플래그. 층에 들어설 때 사람을 세우려면 숨김 플래그를 봐야 한다 */
  vars: (() => VarStore) | null
} = {
  runScript: null, progress: null, setProgress: null,
  giratinaAnim: null, cyrusAppearance: null, setCyrusAppearance: null,
  puzzleFinished: null, setPuzzleFinished: null, addObject: null, vars: null,
}

/** 이미 돈 사건은 다시 안 돈다. 맵을 나가면 지운다 */
const ranEvents = new Set<string>()

/**
 * **떠나려는 칸에서** 도는 것 (`DistWorld_HandlePlayerMoved`).
 *
 * ⚠️ **도착한 칸이 아니라 서 있던 칸이다.** 원작은 걸음을 시작하는 순간
 * (`ov5_021DFE68`, 이동 상태가 `AVATAR_MOVE_STATE_MOVING`일 때) 지금 서 있는
 * 칸과 **누른 방향**으로 이 셋을 돌린다. 도착한 칸에서 돌리면 「제자리에서
 * 돌아서서 걷기」가 통째로 빠진다 — 방아쇠 칸에 서서 아래를 보고 걸으면
 * 발판이 나타나야 하는데, 다음 칸에는 방아쇠가 없어서 아무 일도 안 일어난다.
 * 실제로 그래서 밟아도 블록이 안 생겼다.
 *
 * 차례도 원작 그대로다 — 유령 소품 → 카메라 → 뛰는 자리. 뛰면 거기서 끝난다
 */
export function distortionMoved(x: number, y: number, z: number, dir: number): void {
  if (floor === null || ride !== null || running !== null || cascade !== null) return
  const [wx, wy, wz] = toWorldTiles(x, y, z)
  applyTriggers(wx, wy, wz, dir)
  applyCamera(wx, wy, wz, dir)
  if (applyJump(wx, wy, wz, dir)) return
  applyCascade(wx, wy, wz, dir)
}

// ── 폭포 ─────────────────────────────────────────────────────────────────────

interface Cascading {
  site: CascadeSite
  /** 지난 프레임 수 */
  frame: number
  total: number
  loadAt: number
  /** 뛰어들 때의 세계 칸 */
  from: [number, number, number]
  /** 층을 이미 불렀는가 */
  loaded: boolean
}

let cascade: Cascading | null = null

/** 폭포를 타는 중인가. 그동안은 조작이 안 먹는다 */
export function distortionCascading(): boolean {
  return cascade !== null
}

/**
 * 폭포를 타는 동안의 **몸짓** — 화면이 읽는다.
 *
 * `roll`은 몸이 돌아 있는 각(도)이고 `bob`은 옆으로 밀린 양(칸)이다.
 * 흔들림은 물살의 삼각파와 카메라가 갈릴 때 옮겨지는 중심을 더한 것이다.
 * 폭포를 안 타면 null이라 부르는 쪽은 아무것도 안 한다
 */
export function distortionCascadePose(): { roll: number, bob: number } | null {
  if (cascade === null) return null
  return {
    roll: cascadeRoll(cascade.site, cascade.frame),
    bob: cascadeBob(cascade.site, cascade.frame) + cascadeBobFix(cascade.site, cascade.frame),
  }
}

/**
 * 폭포에 뛰어든다 (`DistWorld_HandlePlayerMoved`의 `sMapEvent*_Waterfall`).
 *
 * 원작은 사건 명령 하나(`EVENT_CMD_CASCADE_DOWN`/`UP`)로 돌리는데, 그 명령은
 * **자료가 아니라 코드에 박힌 표**를 물고 있어 우리 사건 표에는 없다. 그래서
 * 방아쇠도 규칙도 `world/distortionCascade`가 든다
 */
function applyCascade(wx: number, wy: number, wz: number, dir: number): boolean {
  if (floor === null) return false
  const site = cascadeAt(floor.map, wx, wy, wz, dir)
  if (site === null) return false
  cascade = {
    site,
    frame: 0,
    total: cascadeFrames(site),
    loadAt: cascadeLoadFrame(site),
    from: [wx, wy, wz],
    loaded: false,
  }
  worldState.player.velocity.set(0, 0, 0)
  // 물소리가 타는 내내 난다 (`Sound_PlayEffect(SEQ_SE_PL_FW463)`)
  void music.playEffect(SFX.WATERFALL)
  // 원작이 몸을 돌려 물살을 등진다 (`MapObject_TryFace(FACE_LEFT)`)
  worldState.player.facing = FACING_YAW[DIR.west] ?? worldState.player.facing
  return true
}

/**
 * 한 프레임 (`CmdRunDataCascadeBase_Update`).
 *
 * ⚠️ **층을 부르는 자리가 도중이다.** 다 떨어지고 나서 부르면 사람이 앞 층의
 * 좌표계로 41.5칸을 내려가 허공에 선다 — 원작은 21칸째에 갈아 끼우고 나머지
 * 20.5칸을 **새 층에서** 마저 내려간다
 */
export function distortionCascadeTick(dt: number): void {
  const run = cascade
  if (run === null || floor === null) return
  // 층을 받아 오는 동안은 멈춘다 (`IsFloorLoaderActive`)
  if (world.pending !== null) return
  run.frame = Math.min(run.total, run.frame + dt * 60)

  const moved = cascadeOffset(run.site, run.frame) / CASCADE_UNIT
  const p = worldState.player.position
  const [, wy] = run.from
  const [, ly] = toLocalTiles(0, wy + moved, 0)
  p.y = ly
  worldState.player.prevPosition.copy(p)
  worldState.player.velocity.set(0, 0, 0)

  // 카메라가 물살을 따라 돈다 (`UpdateCascadeDownCamera` · `UpdateCascadeUpCamera`)
  // — ⚠️ **프레임이 아니라 몇 칸 떨어졌는가로 갈린다**
  const cam = cascadeCameraAt(run.site, run.frame)
  if (cam !== null) {
    setState({ cameraAngleX: cam.angleX, cameraAngleY: cam.angleY, cameraAngleZ: cam.angleZ })
  }

  if (!run.loaded && run.frame >= run.loadAt) {
    run.loaded = true
    changeFloorTo(run.site.down)
    return
  }
  if (run.frame >= run.total) endCascade(run)
}

/** 폭포가 끝났다 (`..._FinishCascading`) */
function endCascade(run: Cascading): void {
  cascade = null
  if (floor === null) return
  const [wx, wy, wz] = run.from
  const [lx, ly, lz] = toLocalTiles(wx, wy + run.site.finishY, wz)
  const p = worldState.player.position
  p.set(lx + 0.5, ly, lz + 0.5)
  worldState.player.prevPosition.copy(p)
  worldState.player.velocity.set(0, 0, 0)
  worldState.player.facing = FACING_YAW[DIR.west] ?? worldState.player.facing
  // 닿은 자리의 판을 잡는다 (`FindAndPrepareNewCurrentFloatingPlatform`) —
  // 갈래를 안 가린다. 판이 없는 층이면 그대로 판 밖이다
  const [nwx, nwy, nwz] = toWorldTiles(p.x, p.y, p.z)
  bindPlatform(findPlatform(floor.platforms, nwx, nwy, nwz))
  // 다 내려선 자리에서 물소리를 끈다 (`Sound_StopEffect`)
  music.stopEffect(SFX.WATERFALL)
  // 물살에서 서쪽으로 걸어 나온다 (`..._MoveAway`) — 원작도 폭포 칸 위에 서 있지
  // 않는다. ⚠️ **내려간 뒤는 두 걸음, 올라간 뒤는 세 걸음이다**
  const step = DIR_STEP[DIR.west]
  const away = run.site.moveAway
  if (step !== undefined) p.set(p.x + step.x * away, p.y, p.z + step.z * away)
  worldState.player.prevPosition.copy(p)
  // 내려간 쪽만 B5F의 승강 발판을 세운다 (`SetPersistedMovingPlatformFlag`)
  if (run.site.down) {
    setState({ platformFlags: state().platformFlags | (1 << CASCADE_B5F_FLAG) })
  }
}

/** 폭포가 층을 간다 (`LoadFloor(FLOOR_LOAD_NEXT | PREVIOUS)`) */
function changeFloorTo(down: boolean): void {
  if (floor === null || data === null) return
  const conn = connectionOf(data, floor.map)
  const dest = down ? conn?.next : conn?.prev
  if (dest === undefined) return
  const target = mapOf(data, dest)
  if (target === null) return
  const p = worldState.player.position
  const [wx, wy, wz] = toWorldTiles(p.x, p.y, p.z)
  world.pending = {
    to: dest,
    matrix: world.maps?.[dest]?.matrix ?? 0,
    x: wx - target.offsetX,
    z: wz - target.offsetZ,
    y: wy - target.offsetY,
    viaDoor: false,
    silent: true,
  }
}

/**
 * **닿은 칸에서** 도는 것 (`DistWorld_HandlePlayerPositionChanged`).
 *
 * 승강 발판 → 사건 → 스크립트 칸. 발판이 걸리면 거기서 끝난다 —
 * 원작이 그것을 제일 먼저 본다
 */
export function distortionStepped(x: number, y: number, z: number, dir: number): void {
  if (floor === null || ride !== null || running !== null) return
  const [wx, wy, wz] = toWorldTiles(x, y, z)
  if (startRide(wx, wy, wz)) return
  applyEvents(wx, wy, wz)
  applyTeleport(wx, wy, wz, dir)
}

function applyTriggers(wx: number, wy: number, wz: number, dir: number): void {
  if (floor === null) return
  const s = state()
  let hidden = s.hiddenGroups
  for (const t of floor.triggers) {
    if (t.dir !== dir) continue
    if (!inBoundsOf(t.bounds, wx, wy, wz)) continue
    if (t.show) hidden &= ~(1 << t.group)
    else hidden |= 1 << t.group
  }
  if (hidden !== s.hiddenGroups) setState({ hiddenGroups: hidden })
}

function inBoundsOf(
  b: { x: number; y: number; z: number; sx: number; sy: number; sz: number },
  x: number, y: number, z: number,
): boolean {
  return y >= b.y && y <= b.y + b.sy && z >= b.z && z <= b.z + b.sz
    && x >= b.x && x <= b.x + b.sx
}

/**
 * 카메라가 도는 중이다 (`DistWorldCameraTransition`).
 *
 * 세이브에 적는 것은 **목표**고(`SetPersistedCameraAngles`) 화면이 쓰는 것은
 * 도는 도중의 값이다. 층을 다시 들어오면 도중이 없이 목표에서 시작한다
 */
let camTurn: { turn: CameraTurn, frame: number } | null = null
let camAngles: [number, number, number] = [0, 0, 0]

function applyCamera(wx: number, wy: number, wz: number, dir: number): void {
  if (floor === null) return
  const found = cameraAt(floor.cameras, wx, wy, wz, dir)
  if (found === null) return
  const s = state()
  const to = [found.angleX, found.angleY, found.angleZ] as const
  if (s.cameraAngleX === to[0] && s.cameraAngleY === to[1] && s.cameraAngleZ === to[2]) return
  camTurn = {
    turn: { from: [s.cameraAngleX, s.cameraAngleY, s.cameraAngleZ], to, steps: found.steps },
    frame: 0,
  }
  setState({ cameraAngleX: to[0], cameraAngleY: to[1], cameraAngleZ: to[2] })
}

/** 지금 카메라가 밑각에서 얼마나 돌아 있는가 (**도**). 카메라가 읽는다 */
export function distortionCameraSwing(): { x: number, y: number, z: number } | null {
  if (floor === null) return null
  const [x, y, z] = camAngles
  return { x, y, z }
}

/** 층을 들어설 때 도중 없이 목표에 앉힌다 (`CameraInit`의 `IsPersistedDataValid`) */
function seatCamera(): void {
  const s = state()
  camTurn = null
  camAngles = [
    cameraDegrees(s.cameraAngleX), cameraDegrees(s.cameraAngleY), cameraDegrees(s.cameraAngleZ),
  ]
}

/** 한 프레임 (`CameraTransitionTask`). 60프레임/초로 센다 */
export function distortionCameraTick(dt: number): void {
  if (camTurn === null) return
  camTurn.frame += dt * 60
  camAngles = cameraTurnAngles(camTurn.turn, camTurn.frame)
  if (cameraTurnDone(camTurn.turn, camTurn.frame)) camTurn = null
}

/**
 * 벽·천장으로 건너뛰는 자리 (`HandleFloatingPlatformJumpPointAt`).
 *
 * ⚠️ **한 프레임에 옮기면 안 된다.** 원작은 `steps`프레임에 걸쳐 조금씩 밀고
 * (`TickJumpOnFloatingPlatformMovementAnimation`), **다 옮긴 뒤에야** 판을
 * 갈아 끼운다 (`PrepareNewCurrentFloatingPlatform`은 `..._MOVE_PLAYER`의
 * 끝에 있다). 즉시 갈아 끼우면 중력 축이 그 프레임에 뒤집혀 **화면이 뚝
 * 끊기며 돌아간다** — 실제로 그렇게 보였다. 표의 `steps`가 16이다
 */
interface PlatformJump {
  /** 남은 프레임 */
  frames: number
  total: number
  from: [number, number, number]
  to: [number, number, number]
  platformIndex: number
  /** 다 뛰고 나서 보는 쪽 (`finalFacingDir`) */
  facing: number
}

let jumping: PlatformJump | null = null

/** 판을 건너뛰는 중인가. 그동안은 조작이 안 먹는다 */
export function distortionJumping(): boolean {
  return jumping !== null
}

function applyJump(wx: number, wy: number, wz: number, dir: number): boolean {
  if (floor === null || jumping !== null) return false
  const jump = jumpAt(floor.jumps, wx, wy, wz, dir)
  if (jump === null) return false

  const p = worldState.player
  const [lx, ly, lz] = toLocalTiles(wx + jump.dx, wy + jump.dy, wz + jump.dz)
  jumping = {
    frames: 0,
    total: Math.max(1, jump.steps),
    from: [p.position.x, p.position.y, p.position.z],
    to: [lx + 0.5, ly, lz + 0.5],
    platformIndex: jump.platformIndex,
    facing: jump.facing,
  }
  p.velocity.set(0, 0, 0)
  return true
}

/** 한 프레임 (`TickJumpOnFloatingPlatformMovementAnimation`) */
export function distortionJumpTick(dt: number): void {
  const j = jumping
  if (j === null) return
  j.frames = Math.min(j.total, j.frames + dt * 60)
  const k = j.frames / j.total
  const p = worldState.player
  p.position.set(
    j.from[0] + (j.to[0] - j.from[0]) * k,
    j.from[1] + (j.to[1] - j.from[1]) * k,
    j.from[2] + (j.to[2] - j.from[2]) * k,
  )
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  if (j.frames < j.total) return
  // 다 옮긴 자리에서 판을 갈아 끼운다 — 여기서 중력 축이 바뀐다
  bindPlatform(j.platformIndex)
  p.facing = FACING_YAW[j.facing] ?? p.facing
  jumping = null
}

/** 방향 번호 → 우리 yaw. `facing`은 `atan2(vx, vz)`라 0이 남쪽이다 */
const FACING_YAW: Readonly<Record<number, number>> = {
  [DIR.south]: 0,
  [DIR.east]: Math.PI / 2,
  [DIR.north]: Math.PI,
  [DIR.west]: -Math.PI / 2,
}

function applyEvents(wx: number, wy: number, wz: number): void {
  if (floor === null || data === null) return
  const table = data.events.find((e) => e.map === floor?.map)
  if (table === undefined) return
  const ctx = {
    progress: distortionHooks.progress?.() ?? 0,
    state: state(),
    giratinaAnim: (n: number) => distortionHooks.giratinaAnim?.(n) ?? false,
    cyrusAppearance: distortionHooks.cyrusAppearance?.() ?? 0,
  }
  for (const [i, event] of table.events.entries()) {
    if (event.x !== wx || event.y !== wy || event.z !== wz) continue
    if (!flagHolds(event.flagCond, event.flagVal, ctx)) continue
    const key = `${String(floor.map)}:${String(i)}`
    if (ranEvents.has(key)) continue
    ranEvents.add(key)
    runEvent(event.cmds)
    return
  }
}

type EventCmd = { kind: number; params: Record<string, unknown> | null }

/**
 * 사건 프로그램 (`RunEventCommands`).
 *
 * ⚠️ **명령은 차례로, 프레임을 두고 돈다.** 원작의 명령 하나하나가 제 상태
 * 기계라(`sMovePlatformHandlers`) 한 걸음에 끝나지 않는다 — 발판이 떨고,
 * 미끄러지고, 주인공이 뛰어내리고, 빈 판이 돌아오기까지가 한 사건이다.
 * 예전엔 전부 같은 프레임에 실행했는데, 그러면 판은 가만히 있고 사람만
 * 여덟 칸 순간이동한다 (사용자가 「바닥이 이동하는 모션이 없다」고 한 것).
 *
 * 상태만 바꾸는 명령(진행도·바위 자리·스크립트 시작)은 그 자리에서 끝내고
 * 다음 명령으로 넘어간다
 */
function runEvent(cmds: readonly EventCmd[]): void {
  running = { cmds, at: 0, frame: 0, slide: null, hop: null }
  advanceEvent()
}

/** 지금 도는 사건. 도는 동안은 조작이 안 먹는다 */
interface EventRun {
  cmds: readonly EventCmd[]
  /** 다음에 실행할 명령 */
  at: number
  /** 지금 명령이 시작한 뒤 흐른 프레임 */
  frame: number
  slide: {
    /** 움직이는 발판의 자리 번호 (`movingPlatforms`의 `index`) */
    index: number
    /** 다 가면 얼마나 밀리는가 (타일) */
    final: [number, number, number]
    /** 이 명령이 시작할 때 그 발판이 이미 밀려 있던 만큼 */
    from: [number, number, number]
    total: number
    movePlayer: boolean
    /** 태우고 갈 때 주인공이 서 있던 자리 */
    rider: [number, number, number]
  } | null
  hop: { dir: number; from: [number, number, number] } | null
}

let running: EventRun | null = null

/**
 * 지금 밀려나 있는 발판. 자리 번호 → 타일 어긋남.
 *
 * 사건 하나가 판을 보냈다가 되돌리므로 끝나면 0으로 돌아온다. 그림을 그리는
 * 쪽(`DistortionProps`)이 프레임마다 이걸 본다
 */
const slid = new Map<number, [number, number, number]>()

/** 사건 연출이 도는 중인가 */
export function distortionEventRunning(): boolean {
  return running !== null
}

/** 그 발판이 지금 얼마나 밀려 있는가 (타일). 안 밀렸으면 null */
export function distortionSlideAt(index: number): readonly [number, number, number] | null {
  return slid.get(index) ?? null
}

/** 다음 명령으로 넘어간다. 연출이 걸리면 거기서 멈추고 프레임을 기다린다 */
function advanceEvent(): void {
  while (running !== null) {
    const cmd = running.cmds[running.at]
    if (cmd === undefined) { running = null; return }
    running.at += 1
    running.frame = 0
    const p = cmd.params ?? {}
    switch (cmd.kind) {
      case EVENT_CMD.startScript:
        distortionHooks.runScript?.(p.scriptID as number)
        break
      case EVENT_CMD.setProgress:
        distortionHooks.setProgress?.(p.progress as number)
        break
      case EVENT_CMD.setPuzzleFlag:
        setState({ puzzleFlags: state().puzzleFlags | (1 << (p.flagIndex as number)) })
        break
      case EVENT_CMD.clearPuzzleFlag:
        setState({ puzzleFlags: state().puzzleFlags & ~(1 << (p.flagIndex as number)) })
        break
      case EVENT_CMD.movePlatform:
        if (beginSlide(p)) return
        break
      case EVENT_CMD.setMapObjectAnimation:
        if (beginHop(p)) return
        break
      // ⚠️ **이 둘을 「연출」로 넘기면 기라티나 방에서 길이 안 생긴다.**
      // 발판 무리 1~3을 한 무리씩 세우는 것이 이 명령이고, 그게 없으면
      // 숨은 소품 여섯이 영영 안 나타나서 그 방에서 못 나간다
      case EVENT_CMD.showGiratinaRoomPlatforms:
        ghost = { group: GIRATINA_ROOM_GROUP.first, delay: SHOW_INITIAL_DELAY, show: true }
        break
      case EVENT_CMD.hideGiratinaRoomPlatforms:
        ghost = { group: GIRATINA_ROOM_GROUP.last, delay: HIDE_INITIAL_DELAY, show: false }
        break
      default:
        // 남은 것은 전부 연출이다 (그림자·폭포·바위 안내·기라티나 도착)
        break
    }
  }
}

/** 발판이 움직이기 시작한다 (`EventCmdMovePlatform_BeginMovement`) */
function beginSlide(p: Record<string, unknown>): boolean {
  if (running === null) return false
  const index = (p.platformIndex as number | undefined) ?? -1
  const final: [number, number, number] = [
    (p.finalTileXOffset as number | undefined) ?? 0,
    (p.finalTileYOffset as number | undefined) ?? 0,
    (p.finalTileZOffset as number | undefined) ?? 0,
  ]
  const delta = (p.posDelta as [number, number, number] | undefined) ?? [0, 0, 0]
  const total = platformFrames(final, delta)
  if (index < 0 || total <= 0) return false
  const pos = worldState.player.position
  running.slide = {
    index,
    final,
    from: [...(slid.get(index) ?? [0, 0, 0])] as [number, number, number],
    total,
    movePlayer: p.movePlayer === 1,
    rider: [pos.x, pos.y, pos.z],
  }
  worldState.player.velocity.set(0, 0, 0)
  return true
}

/** 주인공이 판에서 뛰어내린다 (`EVENT_CMD_SET_MAP_OBJECT_ANIMATION`) */
function beginHop(p: Record<string, unknown>): boolean {
  if (running === null) return false
  // 자료에 있는 것은 주인공(`LOCALID_PLAYER` = 255)의 뛰기 넷뿐이다
  const dir = hopDirOf((p.movementAction as number | undefined) ?? -1)
  if (dir === null || (p.mapObjLocalID as number | undefined) !== 255) return false
  const pos = worldState.player.position
  running.hop = { dir, from: [pos.x, pos.y, pos.z] }
  worldState.player.facing = FACING_YAW[dir] ?? worldState.player.facing
  worldState.player.velocity.set(0, 0, 0)
  return true
}

/**
 * 한 프레임 (`CallLoadedEventHandler`).
 *
 * 떨림 열두 프레임 → 미끄러짐 → 뜀 스물네 프레임이 차례로 돈다
 */
export function distortionEventTick(dt: number): void {
  const run = running
  if (run === null) return
  run.frame += dt * 60
  if (run.slide !== null) tickSlide(run, run.slide)
  else if (run.hop !== null) tickHop(run, run.hop)
  else advanceEvent()
}

function place(x: number, y: number, z: number): void {
  const p = worldState.player.position
  p.set(x, y, z)
  worldState.player.prevPosition.copy(p)
  worldState.player.velocity.set(0, 0, 0)
}

function tickSlide(run: EventRun, s: NonNullable<EventRun['slide']>): void {
  const shake = run.frame < VIBRATION.length
  if (shake) {
    const y = VIBRATION[Math.floor(run.frame)] ?? 0
    slid.set(s.index, [s.from[0], s.from[1] + y, s.from[2]])
    if (s.movePlayer) place(s.rider[0], s.rider[1] + y, s.rider[2])
    return
  }
  const k = Math.min(1, (run.frame - VIBRATION.length) / s.total)
  const at: [number, number, number] = [
    s.from[0] + s.final[0] * k, s.from[1] + s.final[1] * k, s.from[2] + s.final[2] * k,
  ]
  slid.set(s.index, at)
  if (s.movePlayer) {
    place(s.rider[0] + s.final[0] * k, s.rider[1] + s.final[1] * k, s.rider[2] + s.final[2] * k)
  }
  if (k < 1) return
  // 다 갔다 (`EventCmdMovePlatform_EndMovement`) — 닿은 칸에서 발밑의 판을
  // 다시 잡는다. 이걸 빼면 옮겨진 자리가 앞 판의 격자 밖이라 못 움직인다
  if (s.movePlayer && floor !== null) {
    const p = worldState.player.position
    const [wx, wy, wz] = toWorldTiles(p.x, p.y, p.z)
    bindPlatform(findPlatform(floor.platforms, wx, wy, wz))
  }
  run.slide = null
  advanceEvent()
}

function tickHop(run: EventRun, h: NonNullable<EventRun['hop']>): void {
  const step = DIR_STEP[h.dir] ?? { x: 0, z: 0 }
  const f = Math.min(HOP_FRAMES, run.frame)
  const along = (f / HOP_FRAMES) * HOP_TILES
  place(h.from[0] + step.x * along, h.from[1] + hopLift(f), h.from[2] + step.z * along)
  if (run.frame < HOP_FRAMES) return
  place(h.from[0] + step.x * HOP_TILES, h.from[1], h.from[2] + step.z * HOP_TILES)
  if (floor !== null) {
    const p = worldState.player.position
    const [wx, wy, wz] = toWorldTiles(p.x, p.y, p.z)
    bindPlatform(findPlatform(floor.platforms, wx, wy, wz))
  }
  run.hop = null
  advanceEvent()
}

// ── 승강 발판 ────────────────────────────────────────────────────────────────

/**
 * 타고 가는 중 (`DistWorldElevatorPlatform`).
 *
 * 층을 넘는 유일한 길이라, 이게 없으면 이야기가 1F에서 끝난다. 규칙은
 * `engine/world/distortionElevator`에 있고 여기서는 **시간과 층 갈이**만 본다
 */
interface Ride {
  legs: ElevatorLeg[]
  /** 몇 번째 다리인가 */
  leg: number
  /** 이 다리가 시작한 뒤 흐른 프레임 (60분의 1초 단위) */
  frame: number
  dir: number
  /** 이 다리에서 층을 이미 갈았는가 */
  changed: boolean
  /** 다리가 시작할 때의 세계 좌표 */
  from: [number, number, number]
  /** 같이 타는 사람의 번호. 없으면 null */
  passenger: number | null
  /**
   * 층이 바뀐 뒤 다시 세울 사람. 세계 좌표로 들고 있는다.
   *
   * ⚠️ **닿는 층의 배치표에는 그 사람이 없다.** 원작은 새로 세우지 않고 타고
   * 온 객체의 번호만 갈아 끼운다 (`MapObject_SetLocalID` · `..._SetMapHeaderID`).
   * 우리는 층이 바뀌면 배우 목록을 다시 세우므로(`spawnNpcs`) 그 사람이
   * 지워지는데, 닿는 층 표에서 찾으면 없다 — B1F의 시로나가 그래서 사라졌다.
   * 그래서 **타고 온 사람의 정보를 그대로 들고 가** 번호만 바꿔 다시 세운다
   */
  carry: { info: Npc; worldX: number; worldZ: number } | null
  /** 층이 바뀐 뒤 그 사람을 아직 안 세웠다 */
  addPassenger: boolean
  /** 발판의 자리 번호 (B4F의 태홍이 이걸 본다) */
  platformIndex: number
}

let ride: Ride | null = null

/**
 * 씬이 프레임을 물려 주고 있는가.
 *
 * ⚠️ **안 물려 주면 아예 안 태운다.** 태워 놓고 아무도 안 움직이면 그 자리에서
 * 통째로 갇힌다 — 발판 위는 조작이 안 먹는 자리라서 되돌릴 길이 없다.
 * 첫 프레임에 켜지므로 실제로 막는 것은 「배선이 빠졌을 때」뿐이다
 */
let ticking = false

/** 지금 발판을 타고 있는가. 타는 동안은 조작도 조우도 멈춘다 */
export function distortionRiding(): boolean {
  return ride !== null
}

/**
 * 그 칸에 승강 발판이 있으면 태운다 (`HandleElevatorPlatformPropAnimatorAt`).
 *
 * ⚠️ **올라갈 때는 시작하기 전에 자리 표를 손본다** — 원작이 다리마다 `INIT`을
 * 다시 지나면서 그 `switch`를 돌린다
 */
function startRide(wx: number, wy: number, wz: number): boolean {
  if (floor === null || data === null || !ticking) return false
  const templates = data.movingPlatforms.find((m) => m.map === floor?.map)?.platforms ?? []
  const found = elevatorAt(templates, state().platformFlags, wx, wy, wz)
  if (found === null) return false
  const legs = elevatorLegs(data.elevatorPaths, found.elevatorPathIndex)
  if (legs.length === 0) return false

  ride = {
    legs, leg: 0, frame: 0, dir: found.elevatorDir, changed: false,
    from: [wx, wy, wz],
    passenger: passengerLocalID(floor.map, distortionHooks.progress?.() ?? 0),
    carry: null,
    addPassenger: false,
    platformIndex: found.index,
  }
  beginLeg()
  return true
}

function beginLeg(): void {
  if (ride === null) return
  const leg = ride.legs[ride.leg]
  if (leg === undefined) { ride = null; return }
  if (ride.dir === ELEVATOR_DIR.up) {
    setState({ platformFlags: upStartFlags(state().platformFlags, leg.path.index) })
  }
}

/**
 * 한 프레임 (`..._MoveFirstHalf` · `..._ChangeMaps` · `..._MoveSecondHalf`).
 *
 * 원작이 프레임마다 `posDelta`를 더하므로 60분의 1초를 한 프레임으로 센다 —
 * 실제 화면이 몇 헤르츠든 걸리는 시간이 같다
 */
export function distortionRideTick(dt: number): void {
  ticking = true
  if (ride === null || floor === null) return
  // 층을 받아 오는 동안은 멈춘다 (`IsFloorLoaderActive`). 안 그러면 아직 앞
  // 층의 좌표계로 계산해서 발판이 딴 데로 간다
  if (world.pending !== null) return
  const leg = ride.legs[ride.leg]
  if (leg === undefined) { ride = null; return }

  const total = legFrames(leg.path)
  if (total <= 0) { ride = null; return }
  ride.frame = Math.min(total, ride.frame + dt * 60)

  // 층을 다 받았으면 같이 타고 온 사람을 **번호만 갈아** 다시 세운다
  const carry = ride.carry
  if (ride.addPassenger && carry !== null) {
    ride.addPassenger = false
    ride.carry = null
    const vars = distortionHooks.vars?.()
    const [lx0, , lz0] = toLocalTiles(carry.worldX, 0, carry.worldZ)
    if (vars) addNpcFrom({ ...carry.info, x: lx0, z: lz0 }, vars)
  }

  const k = ride.frame / total
  const p = worldState.player.position
  const [fx, fy, fz] = ride.from
  const [lx, ly, lz] = toLocalTiles(
    fx + leg.path.finalTileXOffset * k,
    fy + leg.path.finalTileYOffset * k,
    fz + leg.path.finalTileZOffset * k,
  )
  p.set(lx + 0.5, ly, lz + 0.5)
  worldState.player.prevPosition.copy(p)
  worldState.player.velocity.set(0, 0, 0)
  movePassenger(ly)

  if (!ride.changed && ride.frame >= changeMapFrame(leg.path)) {
    ride.changed = true
    changeFloor(leg)
  }
  if (ride.frame >= total) endLeg(leg)
}

/** 같이 타는 사람은 높이만 따라온다 (`passengerPos.y = playerPos.y`) */
function movePassenger(localY: number): void {
  const id = ride?.passenger
  if (id === null || id === undefined) return
  const actor = npcActors.byLocalID.get(id)
  if (actor !== undefined) actor.y = localY
}

/**
 * 층을 간다 (`..._ChangeMaps` → `LoadFloor`).
 *
 * ⚠️ **다리마다 한 층씩이다.** 두 다리짜리 자리 둘(B3F↔B5F)은 중간 층을
 * 스쳐 지난다 — 한 번에 두 층을 건너뛰는 것이 아니라 두 번 갈아탄다.
 *
 * ⚠️ **자리 표는 마지막 다리에서만 바뀐다** (`if (nextPathIndex == INVALID)`)
 */
function changeFloor(leg: ElevatorLeg): void {
  if (ride === null || floor === null || data === null) return
  const conn = connectionOf(data, floor.map)
  const dest = ride.dir === ELEVATOR_DIR.down ? conn?.next : conn?.prev
  if (dest === undefined || mapOf(data, dest) === null) return

  if (leg.last) {
    let flags = state().platformFlags
    flags = withFlag(flags, leg.path.persistedFlagToSet, true)
    flags = withFlag(flags, leg.path.persistedFlagToClear, false)
    setState({ platformFlags: flags })
  }
  // ⚠️ **번호가 층마다 다시 128에서 센다.** 같이 타는 사람은 층이 바뀌는 순간
  // 다른 번호가 된다 — 원작은 **같은 객체의** `localID`를 갈아 끼운다
  // (`MapObject_SetLocalID` · `MapObject_SetMapHeaderID`). 닿는 층의 배치표에는
  // 그 사람이 아예 없으므로 거기서 찾아 세우면 아무도 안 나온다 (실측: B1F에
  // 시로나가 없는데 대사만 떴다). 그래서 타고 온 사람을 **그대로 들고 간다**
  const after = ride.passenger === null ? null : passengerAfter(dest)
  if (ride.passenger !== null) {
    const actor = npcActors.byLocalID.get(ride.passenger)
    if (actor !== undefined && after !== null) {
      const [awx, , awz] = toWorldTiles(actor.x, 0, actor.z)
      ride.carry = {
        info: {
          ...actor.info,
          localID: after.localID,
          script: after.script ?? actor.info.script,
        },
        worldX: awx,
        worldZ: awz,
      }
    }
    removeNpc(ride.passenger)
  }

  // 지금 세계 좌표 그대로 다음 층의 지역 좌표로 옮긴다 — 층마다 오프셋이 달라서
  // 같은 칸이라도 지역 좌표는 딴판이다
  const target = mapOf(data, dest)
  if (target === null) return
  const p = worldState.player.position
  const [wx, wy, wz] = toWorldTiles(p.x, p.y, p.z)
  ride.passenger = after?.localID ?? null
  ride.addPassenger = after !== null
  world.pending = {
    to: dest,
    matrix: matrixOf(dest),
    x: wx - target.offsetX,
    z: wz - target.offsetZ,
    y: wy - target.offsetY,
    viaDoor: false,
    silent: true,
  }
}

/** 층마다의 행렬 번호. 맵 헤더가 들고 있다 */
function matrixOf(map: number): number {
  return world.maps?.[map]?.matrix ?? 0
}

/** 다리가 끝났다 (`..._MoveSecondHalf`의 마지막 · `..._EndMovement`) */
function endLeg(leg: ElevatorLeg): void {
  if (ride === null) return
  const [fx, fy, fz] = ride.from
  const at: [number, number, number] = [
    fx + leg.path.finalTileXOffset,
    fy + leg.path.finalTileYOffset,
    fz + leg.path.finalTileZOffset,
  ]
  if (!leg.last) {
    ride.leg++
    ride.frame = 0
    ride.changed = false
    ride.from = at
    beginLeg()
    return
  }

  if (ride.dir === ELEVATOR_DIR.down) {
    setState({ platformFlags: downEndFlags(state().platformFlags, leg.path.index) })
    cyrusOffB4F()
  }
  // 닿은 칸에서 발밑의 판을 다시 잡는다 (`FindAndPrepareNewCurrentFloatingPlatform`)
  const [lx, ly, lz] = toLocalTiles(at[0], at[1], at[2])
  const p = worldState.player.position
  p.set(lx + 0.5, ly, lz + 0.5)
  worldState.player.prevPosition.copy(p)
  const found = floor === null ? -1 : findPlatform(floor.platforms, at[0], at[1], at[2])
  bindPlatform(found)
  ride = null
}

/**
 * B4F에 처음 내려서면 태홍이 걸어 나간다 (`..._CyrusB4FStartAnimation`).
 *
 * 걸음 수만 옮긴다 — 서 있던 x가 셋 중 무엇이냐에 따라 동쪽으로 두 칸·한 칸·
 * 안 가고, 셋 다 북쪽 넷을 걸어 같은 자리에서 사라진다
 */
function cyrusOffB4F(): void {
  if (ride === null || floor === null) return
  const appearance = distortionHooks.cyrusAppearance?.() ?? 0
  if (!cyrusLeavesB4F(floor.map, ride.dir, ride.platformIndex, appearance)) return
  const actor = npcActors.list.find((a) => a.localID === DIST_OBJ.b4fCyrus)
  if (actor === undefined) return
  const [wx] = toWorldTiles(actor.x, 0, actor.z)
  const walk = cyrusB4FWalk(wx)
  if (walk === null) return
  actor.x += walk.east
  actor.z -= walk.north
  removeNpc(DIST_OBJ.b4fCyrus)
  distortionHooks.setCyrusAppearance?.(1)
}

// ── 바위 수수께끼 ────────────────────────────────────────────────────────────

/**
 * 떨어지는 중인 바위 (`DistWorldFallingBoulder`).
 *
 * 셋 다 프레임 수가 원작에 박혀 있다 — 맞는 웅덩이는 여덟 + 넷 프레임을
 * 떨어지고 서른둘을 튕기며, 틀린 웅덩이는 여덟 + 넷 + **마흔**을 그대로
 * 떨어져 사라진다. B6F로 내려가는 것은 열네 칸을 한 프레임에 반 칸씩이다
 */
interface FallingBoulder {
  localID: number
  dest: number
  flag: number
  frame: number
  /** 밀린 방향 */
  step: { x: number; z: number }
  fromY: number
}

let falling: FallingBoulder | null = null

/** `..._TickToB6F` — 한 프레임에 반 칸씩, 열네 칸 */
const FALL_TO_B6F_FRAMES = 28
/** `..._TickToCorrectPit`의 0·1단계 */
const FALL_INTO_PIT_FRAMES = 12
/** 2단계의 튕김 */
const PIT_SETTLE_FRAMES = 32
/** `..._TickToWrongPit`의 0·1·2단계 */
const FALL_WRONG_FRAMES = 52


// ── 기라티나 방 발판 (`EventCmdShowGiratinaRoomPlatforms`) ────────────────────

/**
 * 세우고 거두는 무리 범위 (`GIRATINA_ROOM_PLATFORMS_*_GHOST_PROP_GROUP`).
 *
 * 셋이다 — 1·2·3. 세울 때는 1에서 3으로 올라가고 거둘 때는 3에서 1로 내려간다
 */
const GIRATINA_ROOM_GROUP = { first: 1, last: 3 } as const
/** 첫 무리가 서기까지 (`GIRATINA_ROOM_SHOW_PLATFORMS_INITIAL_DELAY`) */
const SHOW_INITIAL_DELAY = 36
/** 다음 무리까지 (`..._SHOW_PLATFORMS_DELAY` · `..._HIDE_PLATFORMS_DELAY`, 둘 다 48) */
const STEP_DELAY = 48
/** 거둘 때의 첫 뜸 (`GIRATINA_ROOM_HIDE_PLATFORMS_INITIAL_DELAY`) */
const HIDE_INITIAL_DELAY = 16

interface GhostRun {
  /** 다음에 손댈 무리 */
  group: number
  /** 남은 프레임 */
  delay: number
  show: boolean
}
let ghost: GhostRun | null = null

/** 발판이 서거나 거둬지는 중인가. 도는 동안은 조작을 막는다 */
export function distortionGhostRunning(): boolean {
  return ghost !== null
}

/**
 * 한 프레임 (`EventCmdShowGiratinaRoomPlatforms_ShowPlatforms`).
 *
 * 48프레임마다 한 무리씩이다. 한 번에 다 세우지 않는 이유가 있다 — 원작은
 * 발판이 하나씩 솟는 것을 보여 주고, 그 사이에 소리를 끊는다
 */
export function distortionGhostTick(dt: number): void {
  const run = ghost
  if (run === null) return
  run.delay -= dt * 60
  if (run.delay > 0) return

  const s = state()
  const bit = 1 << run.group
  setState({ hiddenGroups: run.show ? s.hiddenGroups & ~bit : s.hiddenGroups | bit })
  run.delay = STEP_DELAY
  run.group += run.show ? 1 : -1

  const done = run.show
    ? run.group > GIRATINA_ROOM_GROUP.last
    : run.group < GIRATINA_ROOM_GROUP.first
  if (done) ghost = null
}

export function distortionBoulderFalling(): boolean {
  return falling !== null
}

/**
 * 밀면 떨어지는가 (`ov5_021DFB54.c` 527줄).
 *
 * ⚠️ **미는 쪽의 한 칸 앞을 본다.** 바위가 선 칸이 아니라 갈 칸이다
 */
function dropBoulder(
  boulder: { localID: number; x: number; z: number }, step: { x: number; z: number },
): boolean {
  if (floor === null || falling !== null || !ticking) return false
  const [wx, , wz] = toWorldTiles(Math.round(boulder.x), 0, Math.round(boulder.z))
  const flag = fallLocationAt(floor.map, wx + step.x, wz + step.z)
  if (flag === null) return false
  const actor = npcActors.byLocalID.get(boulder.localID)
  falling = {
    localID: boulder.localID,
    dest: fallDestination(flag, state().puzzleFlags),
    flag,
    frame: 0,
    step,
    fromY: actor?.y ?? 0,
  }
  return true
}

/** 한 프레임 (`DistWorldFallingBoulder_Tick`) */
export function distortionBoulderTick(dt: number): void {
  if (falling === null) return
  const actor = npcActors.byLocalID.get(falling.localID)
  if (actor === undefined) { falling = null; return }
  falling.frame += dt * 60
  const f = falling.frame

  switch (falling.dest) {
    case FALL_DEST.b6f:
      actor.y = falling.fromY - 14 * Math.min(1, f / FALL_TO_B6F_FRAMES)
      if (f >= FALL_TO_B6F_FRAMES) {
        // 바위는 지워지는 게 아니라 **B6F 것이 된다.** 우리는 층이 다르면 안
        // 그리므로 이 층에서만 치운다
        setState({ puzzleFlags: fellToB6F(state().puzzleFlags, falling.localID) })
        removeNpc(falling.localID)
        falling = null
      }
      break

    case FALL_DEST.correctPit: {
      const k = Math.min(1, f / FALL_INTO_PIT_FRAMES)
      actor.y = falling.fromY - 2 * k
      actor.x += 0
      if (f >= FALL_INTO_PIT_FRAMES + PIT_SETTLE_FRAMES) {
        const after = fellIntoPit(state().puzzleFlags, falling.localID)
        if (after !== null) {
          setState({ puzzleFlags: after.flags })
          removeNpc(falling.localID)
          distortionHooks.addObject?.(after.localID)
          if (puzzleSolved(after.flags)) distortionHooks.setPuzzleFinished?.()
          distortionHooks.runScript?.(after.script)
        }
        falling = null
      }
      break
    }

    default:
      actor.y = falling.fromY - 10 * Math.min(1, f / FALL_WRONG_FRAMES)
      if (f >= FALL_WRONG_FRAMES) {
        setState({ puzzleFlags: fellIntoWrongPit(state().puzzleFlags, falling.localID) })
        removeNpc(falling.localID)
        falling = null
      }
      break
  }
}

/** 밟으면 스크립트가 서는 두 자리 (`DistWorld_HandlePlayerMovementEnd`) */
function applyTeleport(wx: number, wy: number, wz: number, dir: number): void {
  if (floor === null) return
  const progress = distortionHooks.progress?.() ?? 0
  for (const t of [TELEPORT.b7f, TELEPORT.giratinaRoom]) {
    if (floor.map !== t.map || dir !== t.dir) continue
    if (wx !== t.x || wy !== t.y || wz !== t.z) continue
    // B7F 쪽은 시로나가 길을 열어 준 뒤에만 선다
    if (t === TELEPORT.b7f && progress < 10) continue
    distortionHooks.runScript?.(t.script)
    return
  }
}

// ── 이 세계에만 있는 사람 ────────────────────────────────────────────────────

/** 고정소수점 한 타일. `MAP_OBJECT_TILE_SIZE` = `FX32_ONE * 16` */
const FX32_PER_TILE = 4096 * 16

/**
 * 번호로 사람을 세운다 (`DistWorld_AddMapObjectWithLocalID`).
 *
 * ⚠️ **좌표가 세계 좌표고 높이는 고정소수점이다.** x·z는 층의 오프셋을 빼야
 * 우리 맵 좌표가 되고, y는 `타일 × 4096 × 16`이라 그만큼 나눠야 한다
 */
/**
 * 스크립트가 부른 사람 때문에 **비켜선** 사람들. 부른 번호 → 비켜선 번호들.
 *
 * ⚠️ **같은 사람이 두 자리에 서 있었다.** 1F 배치표에는 시로나가 둘 있다 —
 * 스크립트가 부르는 「차원문 앞 시로나」(#128 @55,40)와 늘 서 있는 「승강판
 * 시로나」(#129 @39,52, 진행도 ≤ 2)다. 원작 스크립트도 둘을 같이 세우지만
 * (`scripts_distortion_world_1f.s`의 `OnFrame_FirstEntry`), 원작 화면은 위에서
 * 내려다보는 두 화면이라 16타일 떨어진 저쪽이 안 보인다. 우리 3인칭 화면에는
 * 둘이 같이 잡힌다 — 사용자가 「난천이 두 명」이라 한 것이 이것이다.
 *
 * 그래서 부른 쪽이 서 있는 동안 **같은 그림의 다른 사람은 비켜선다.** 스크립트가
 * 그 사람을 지우면(`DeleteDistortionWorldMapObject`) 비켜섰던 쪽이 돌아온다
 */
const stoodAside = new Map<number, number[]>()

export function distortionAddObject(localID: number, vars: VarStore): void {
  if (floor === null || data === null) return
  const table = data.mapObjects.find((m) => m.map === floor?.map)
  const row = table?.objects.find((o) => o.localID === localID)
  if (row === undefined) return
  // ⚠️ **바위에는 안 건다.** B6F의 바위 아홉은 그림이 셋뿐이라(84·84·84…)
  // 그림으로 지우면 수수께끼가 통째로 사라진다. 조건이 `manualAddOnly`인
  // 줄만 이 규칙을 탄다 — 자료 전체에서 여덟 줄이고 전부 사람이다
  if ((row.flagCond as number) === FLAG_COND.manualAddOnly) {
    const twins = (table?.objects ?? [])
      .filter((o) => o.graphicsID === row.graphicsID && o.localID !== localID)
      .map((o) => o.localID as number)
      .filter((id) => npcActors.byLocalID.has(id))
    if (twins.length > 0) {
      for (const id of twins) removeNpc(id)
      stoodAside.set(localID, twins)
    }
  }
  addObjectRow(row, vars)
}

function addObjectRow(row: Record<string, unknown>, vars: VarStore): void {
  const worldY = Math.round((row.y as number) / FX32_PER_TILE)
  const [lx, ly, lz] = toLocalTiles(row.x as number, worldY, row.z as number)
  const hidden = row.hiddenFlag as number
  addNpcFrom({
    x: lx, z: lz, height: ly,
    localID: row.localID as number,
    sprite: row.graphicsID as number,
    move: row.movementType as number,
    trainerType: row.trainerType as number,
    facing: row.dir as number,
    script: row.script as number,
    flag: hidden === 0 ? null : hidden,
    range: [row.movementRangeX as number, row.movementRangeZ as number],
    raw: [0, 0, 0, 0, 0, 0, 0, ...(row.data as number[])],
  }, vars)
}

/**
 * 층에 들어서면 **그 층의 사람과 바위를 세운다** (`AddMapObjectsForMap`).
 *
 * ⚠️ **이게 없으면 이 세계에는 아무도 없다.** 원작은 세계에 들어서는 순간
 * `AddMapObjectsForCurrentAndNextMap`을 부르고, 층을 갈 때마다 다시 부른다
 * (`ov9_02249960.c` 7152줄). 우리는 스크립트가 `AddDistortionWorldMapObject`로
 * 부를 때만 세우고 있었다 — 그래서 기라티나도, 엠라이트·아그노무·유크시도,
 * 바위 수수께끼의 바위 아홉도, 각 층의 시로나·태홍도 한 번도 안 나타났다.
 *
 * 거는 조건은 원작의 `CheckFlagConditionForObjectEvent`다: `manualAddOnly`는
 * 스크립트가 직접 부를 때만 서고(그래서 여기서는 건너뛴다), 나머지는
 * `CheckFlagCondition`을 통과해야 하며, 숨김 플래그가 서 있으면 안 선다.
 *
 * ⚠️ **다음 층 것은 안 세운다.** 원작이 같이 세우는 것은 좌표가 세계 좌표라
 * 층이 겹쳐도 자리가 안 겹치기 때문인데, 우리 배우는 층마다 지역 좌표라
 * 다음 층 사람이 이 층 한복판에 서 버린다. 승강 발판을 같이 타는 사람은
 * `changeFloor`가 따로 옮긴다
 */
function spawnFloorObjects(mapId: number): void {
  if (data === null) return
  const vars = distortionHooks.vars?.()
  if (vars === undefined || vars === null) return
  const table = data.mapObjects.find((m) => m.map === mapId)
  if (table === undefined) return
  const ctx = {
    progress: distortionHooks.progress?.() ?? 0,
    state: state(),
    giratinaAnim: (n: number) => distortionHooks.giratinaAnim?.(n) ?? false,
    cyrusAppearance: distortionHooks.cyrusAppearance?.() ?? 0,
  }
  for (const row of table.objects) {
    if ((row.flagCond as number) === FLAG_COND.manualAddOnly) continue
    if (!flagHolds(row.flagCond as number, row.flagCondVal as number, ctx)) continue
    const hidden = row.hiddenFlag as number
    if (hidden !== 0 && vars.checkFlag(hidden)) continue
    addObjectRow(row, vars)
  }
}

export function distortionRemoveObject(localID: number): void {
  removeNpc(localID)
  // 이 사람 때문에 비켜섰던 쪽을 도로 세운다. 조건은 그때 다시 본다 —
  // 이야기가 넘어가서 이제 서면 안 되는 사람은 안 선다
  const back = stoodAside.get(localID)
  if (back === undefined) return
  stoodAside.delete(localID)
  const vars = distortionHooks.vars?.()
  if (floor === null || data === null || vars === undefined || vars === null) return
  const table = data.mapObjects.find((m) => m.map === floor?.map)
  const ctx = {
    progress: distortionHooks.progress?.() ?? 0,
    state: state(),
    giratinaAnim: (n: number) => distortionHooks.giratinaAnim?.(n) ?? false,
    cyrusAppearance: distortionHooks.cyrusAppearance?.() ?? 0,
  }
  for (const id of back) {
    const row = table?.objects.find((o) => o.localID === id)
    if (row === undefined) continue
    if (!flagHolds(row.flagCond as number, row.flagCondVal as number, ctx)) continue
    const hidden = row.hiddenFlag as number
    if (hidden !== 0 && vars.checkFlag(hidden)) continue
    addObjectRow(row, vars)
  }
}

/** 카메라 각을 0으로 (`DistWorld_ResetPersistedCameraAngles`) */
export function distortionResetCamera(): void {
  setState({ cameraAngleX: 0, cameraAngleY: 0, cameraAngleZ: 0 })
}

/** 주인공의 세계 좌표. `GetPlayer3DPos`가 이걸 읽는다 */
export function distortionPlayerPos(): { x: number; y: number; z: number } {
  const p = worldState.player.position
  const [x, y, z] = toWorldTiles(p.x, p.y, p.z)
  return { x, y, z }
}

// 이동 시스템이 볼 수 있게 다리를 꽂는다 (`engine/world/distortion`의 머리말)
distortionBridge.blockedAt = distortionBlockedAt
distortionBridge.frontTile = distortionFrontTile
distortionBridge.cameraSwing = distortionCameraSwing
distortionBridge.frame = distortionFrame
distortionBridge.inWorld = () => floor !== null
distortionBridge.behaviorAt = distortionBehaviorAt
distortionBridge.jumpBlocked = distortionJumpBlocked
distortionBridge.dropBoulder = dropBoulder

/** 시험용 — 층을 나가면 사건 기억을 지운다 */
export function distortionForgetEvents(): void {
  ranEvents.clear()
}
