// 깨어진 세계의 **승강 발판** (PARITY §6.10) — `DistWorldElevatorPlatform_*`
//
// 이 세계에는 계단도 사다리도 없다. 층을 넘는 길은 **하나뿐**이다 — 떠 있는
// 발판 위에 서면 그것이 통째로 위아래로 움직이고, 반쯤 갔을 때 층이 바뀐다.
// 그래서 이것이 없으면 이야기가 1F에서 멈춘다.
//
// 한 번 탈 때 지나는 것:
//
//   1. 서 있는 칸에 승강 발판이 있는가          `FindMovingPlatformPropAnimatorAt`
//   2. 올라가는 것이면 먼저 지울 자리가 있다     `..._BeginMovement`의 `switch`
//   3. `posDelta`만큼씩 움직인다                 `..._MoveFirstHalf`
//   4. `changeMaps` 지점에서 층이 바뀐다          `..._ChangeMaps`
//   5. 남은 거리를 마저 간다                      `..._MoveSecondHalf`
//   6. `nextIndex`가 있으면 1로 돌아간다 (두 층을 한 번에 내려가는 자리가 둘)
//   7. 닿은 칸을 확정하고, 내려온 것이면 뒤처리   `..._EndMovement`
//
// ⚠️ **경로의 자리 값은 세계 좌표의 「칸」이다.** 원작이 맵 객체의 y를 반칸
// 단위로 들고 있어서 `finalTileYOffset * 2`를 더하는데, 우리 y는 칸 단위라
// 그대로 더한다.
import type { DistortionElevatorPath, DistortionMovingPlatform } from '../../data/schema'
import { MAP } from './distortion'

/** `MOVING_PLATFORM_ELEVATOR_DIR_*` */
export const ELEVATOR_DIR = { up: 0, down: 1, none: 2 } as const

/**
 * `DistWorldPersistedMovingPlatformFlag` — 세이브의 열한 자리.
 *
 * 「그 발판이 지금 그 층에 있는가」다. 발판 하나가 두 층을 오가므로, 내려가면
 * 아래층에 나타나고 위층에서는 사라진다
 */
export const PLATFORM_FLAG = {
  b1f1: 0, b2f1: 1, b3f1: 2, b4f1: 3, b4f2: 4, b5f3: 5,
  b3f2: 6, b5f1: 7, b4f3: 8, b6f1: 9, b7f1: 10,
} as const

/** `DIST_WORLD_PLATFORM_FLAG_COUNT` = `..._INVALID`. 「자리를 안 쓴다」 */
export const PLATFORM_FLAG_NONE = 11

/** `ELEVATOR_PLATFORM_PATH_COUNT` = `..._PATH_INVALID`. 「다음 경로가 없다」 */
export const ELEVATOR_PATH_NONE = 22

/** 한 칸이 고정소수점으로 얼마인가 (`MAP_OBJECT_TILE_SIZE` = `FX32_ONE << 4`) */
export const TILE_FX = 4096 * 16

/**
 * 새 판의 발판 자리 (`InitPersistedData`).
 *
 * ⚠️ **처음 들어선 층이 B7F면 전부 열려 있다.** 그쪽으로 들어오는 것은
 * 이야기를 되감고 다시 들어오는 길(귀혼동굴 쪽)뿐이라, 원작이 위로 올라갈
 * 발판을 미리 다 세워 둔다 — 안 그러면 B7F에 갇힌다
 */
export function initialPlatformFlags(map: number): number {
  if (map === MAP.b7f) {
    return (1 << PLATFORM_FLAG.b1f1) | (1 << PLATFORM_FLAG.b2f1) | (1 << PLATFORM_FLAG.b3f1)
      | (1 << PLATFORM_FLAG.b4f1) | (1 << PLATFORM_FLAG.b4f2) | (1 << PLATFORM_FLAG.b5f1)
      | (1 << PLATFORM_FLAG.b6f1) | (1 << PLATFORM_FLAG.b7f1)
  }
  return (1 << PLATFORM_FLAG.b4f1) | (1 << PLATFORM_FLAG.b5f1)
}

/** 그 발판이 지금 보이는가 (`InitMovingPlatformPropsForMapEx`) */
export function platformShown(t: DistortionMovingPlatform, flags: number): boolean {
  if (t.persistedFlag === PLATFORM_FLAG_NONE) return true
  return (flags & (1 << t.persistedFlag)) !== 0
}

/**
 * 그 칸의 승강 발판 (`HandleElevatorPlatformPropAnimatorAt`).
 *
 * ⚠️ **한 칸도 안 봐준다** — 세 축이 정확히 맞아야 한다. 그리고 갈래가
 * `none`인 발판은 그냥 서 있는 것이라 밟아도 아무 일이 없다 (B2F에 열여덟 장
 * 중 열여섯이 그렇다)
 */
export function elevatorAt(
  platforms: readonly DistortionMovingPlatform[], flags: number,
  wx: number, wy: number, wz: number,
): DistortionMovingPlatform | null {
  for (const t of platforms) {
    if (t.tileX !== wx || t.tileY !== wy || t.tileZ !== wz) continue
    if (!platformShown(t, flags)) continue
    if (t.elevatorDir !== ELEVATOR_DIR.up && t.elevatorDir !== ELEVATOR_DIR.down) continue
    return t
  }
  return null
}

export function pathAt(
  paths: readonly DistortionElevatorPath[], index: number,
): DistortionElevatorPath | null {
  return paths.find((p) => p.index === index) ?? null
}

/** 자리를 세운다/지운다. `PLATFORM_FLAG_NONE`이면 아무것도 안 한다 */
export function withFlag(flags: number, index: number, on: boolean): number {
  if (index >= PLATFORM_FLAG_NONE) return flags
  return on ? flags | (1 << index) : flags & ~(1 << index)
}

/**
 * **올라가기 전에** 지우고 세우는 자리 (`..._BeginMovement`의 `switch`).
 *
 * ⚠️ **경로 표의 `persistedFlagToSet`와 따로 있다.** 위로 갈 때만 도는
 * 곁가지라, 표에 담지 않고 코드에 세 자리를 박아 두었다 — 한 발판이 두 층을
 * 건너뛰며 오르내리는 B3F~B5F 구간의 뒤처리다
 */
export function upStartFlags(flags: number, pathIndex: number): number {
  switch (pathIndex) {
    case 13:
      return withFlag(withFlag(flags, PLATFORM_FLAG.b4f1, true), PLATFORM_FLAG.b4f2, false)
    case 10:
      return withFlag(flags, PLATFORM_FLAG.b5f3, false)
    case 11:
      return withFlag(
        withFlag(withFlag(flags, PLATFORM_FLAG.b3f2, true), PLATFORM_FLAG.b4f1, false),
        PLATFORM_FLAG.b5f3, false,
      )
    default:
      return flags
  }
}

/**
 * 다 내려온 뒤에 세우는 자리 (`..._EndMovement`).
 *
 * 하나뿐이다 — B3F에서 두 층을 내리 내려온 자리(경로 9)에 닿으면 B5F의
 * 첫 발판이 그 자리에서 생겨난다 (`InitSpecificMovingPlatformPropForMap`)
 */
export function downEndFlags(flags: number, pathIndex: number): number {
  if (pathIndex === 9) return withFlag(flags, PLATFORM_FLAG.b5f1, true)
  return flags
}

/**
 * 한 번의 승강이 지나는 다리들.
 *
 * 대개 하나지만 둘인 자리가 둘 있다 — B3F에서 B5F로 곧장 내려가는 경로 8→9와
 * 그 반대인 15→16이다. 다리마다 층이 한 번씩 바뀌므로 두 다리면 두 층을 지난다
 */
export interface ElevatorLeg {
  path: DistortionElevatorPath
  /** 이 다리가 마지막인가. 자리 표는 마지막 다리에서만 바뀐다 */
  last: boolean
}

/**
 * 탈 경로를 미리 다 펼친다.
 *
 * ⚠️ **끝이 없는 표를 믿지 않는다.** 원작은 `nextIndex`를 따라가기만 하는데,
 * 표가 잘못되면 그대로 무한히 돈다 — 경로 스물둘 중 **둘(20·21)이 실제로
 * 그렇다**. `posDelta`의 부호가 목표와 반대라 영영 못 닿는다. 쓰는 발판이
 * 하나도 없어서 원작에서는 안 터지지만, 우리는 길이를 재서 막는다
 */
export function elevatorLegs(
  paths: readonly DistortionElevatorPath[], first: number,
): ElevatorLeg[] {
  const legs: ElevatorLeg[] = []
  let index = first
  while (index !== ELEVATOR_PATH_NONE && legs.length < paths.length) {
    const path = pathAt(paths, index)
    if (path === null) break
    legs.push({ path, last: path.nextIndex === ELEVATOR_PATH_NONE })
    index = path.nextIndex
  }
  return legs
}

/**
 * 한 다리가 몇 프레임인가.
 *
 * 원작은 `currPosOffset`이 `finalPosOffset`과 **같아질 때까지** `posDelta`를
 * 더한다. 나눗셈이 딱 떨어지는 값들이라(전부 16의 배수 칸 · 한 걸음 4칸)
 * 그대로 나눈다. 안 떨어지면 원작은 못 멈추므로 0을 준다
 */
export function legFrames(path: DistortionElevatorPath): number {
  const axes: [number, number][] = [
    [path.finalTileXOffset, path.posDelta[0] ?? 0],
    [path.finalTileYOffset, path.posDelta[1] ?? 0],
    [path.finalTileZOffset, path.posDelta[2] ?? 0],
  ]
  let frames = 0
  for (const [tiles, delta] of axes) {
    if (tiles === 0) continue
    if (delta === 0) return 0
    const total = tiles * TILE_FX
    if (total % delta !== 0 || total / delta < 0) return 0
    frames = Math.max(frames, total / delta)
  }
  return frames
}

/** 층이 바뀌는 것은 몇 프레임째인가 */
export function changeMapFrame(path: DistortionElevatorPath): number {
  const axes: [number, number][] = [
    [path.changeMapsTileXOffset, path.posDelta[0] ?? 0],
    [path.changeMapsTileYOffset, path.posDelta[1] ?? 0],
    [path.changeMapsTileZOffset, path.posDelta[2] ?? 0],
  ]
  let frames = 0
  for (const [tiles, delta] of axes) {
    if (tiles === 0 || delta === 0) continue
    frames = Math.max(frames, Math.round((tiles * TILE_FX) / delta))
  }
  return frames
}

/**
 * 태우고 가는 사람 (`..._BeginMovement`).
 *
 * 두 자리뿐이다 — 1F에서 시로나와 같이 내려가는 것과, B6F에서 바위 수수께끼를
 * 푼 뒤 같이 내려가는 것. 진행도가 딱 그 값일 때만이다
 */
export function passengerLocalID(map: number, progress: number): number | null {
  if (map === MAP.f1 && progress === 2) return DIST_OBJ.f1CynthiaElevator
  if (map === MAP.b6f && progress === 7) return DIST_OBJ.b6fCynthia
  return null
}

/** 층이 바뀌면 그 사람은 번호도 바뀐다 (`..._ChangeMaps`) */
export function passengerAfter(destMap: number): { localID: number; script: number | null } {
  if (destMap === MAP.b1f) return { localID: DIST_OBJ.b1fCynthiaElevator, script: null }
  return { localID: DIST_OBJ.b7fCynthia, script: 6 }
}

/**
 * `DIST_WORLD_MAP_OBJECT_*` — 이 세계에만 있는 사람·바위의 번호.
 *
 * ⚠️ **층마다 128에서 다시 센다** (`DIST_WORLD_MAP_OBJECT_BASE_LOCAL_ID`).
 * 그래서 같은 번호가 층이 다르면 다른 사람이다 — 128이 B1F에서는 시로나고
 * B6F에서는 엠라이트의 바위다
 */
export const DIST_OBJ = {
  f1CynthiaElevator: 129,
  b1fCynthiaElevator: 128,
  b4fCyrus: 134,
  b6fCynthia: 134,
  b7fCynthia: 128,
  b6fMespritBoulderOutside: 128,
  b6fAzelfBoulderOutside: 129,
  b6fUxieBoulderOutside: 130,
  b6fMespritBoulderInPit: 144,
  b6fAzelfBoulderInPit: 145,
  b6fUxieBoulderInPit: 146,
} as const

/**
 * B4F에 닿으면 태홍이 걸어 나간다 (`..._CyrusB4FStartAnimation`).
 *
 * 서 있는 x에 따라 걸음이 다르다 — 88이면 동쪽 둘 · 북쪽 넷, 89면 동쪽 하나 ·
 * 북쪽 넷, 90이면 북쪽 넷. 셋 다 같은 칸에서 만나 사라진다
 */
export function cyrusB4FWalk(tileX: number): { east: number; north: number } | null {
  switch (tileX) {
    case 88: return { east: 2, north: 4 }
    case 89: return { east: 1, north: 4 }
    case 90: return { east: 0, north: 4 }
    default: return null
  }
}

/** 태홍이 걸어 나가는 조건 (`..._EndMovement`의 마지막 `if`) */
export function cyrusLeavesB4F(
  destMap: number, dir: number, platformIndex: number, appearance: number,
): boolean {
  return destMap === MAP.b4f && dir === ELEVATOR_DIR.down && platformIndex === 1
    && appearance === 0
}
