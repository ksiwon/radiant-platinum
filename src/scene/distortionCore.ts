// 깨어진 세계 — 공유하는 것 (PARITY §6.10)
//
// 층 자료와 **지금 서 있는 판**, 그리고 그 둘에서 나오는 물음이 여기 있다.
// 연출은 갈래마다 제 파일을 갖고(`distortionCascade`·`distortionEvents`…)
// 전부 이 파일만 본다 — 그래서 이 파일은 **아무 갈래도 모른다.**
//
// ⚠️ **자료의 좌표는 세계 좌표다.** 맵마다 (offsetX, offsetY, offsetZ)를 더해
// 여덟 층을 하나의 세로 통로로 쌓아 놓았다 — 1F가 y=289, B7F가 y=65다.
// 우리 맵 격자는 층마다 0에서 시작하므로 오갈 때마다 이 값을 더하고 뺀다.
import { Vector3 } from 'three'
import { surfaceVector } from '../engine/actor/distortionSurface'
import { loadDistortion } from '../data/gameData'
import type { DistortionData, DistortionMap } from '../data/schema'
import {
  ATTRS_INVALID, CYNTHIA_BLOCK, MAP, PLATFORM_CEILING, PLATFORM_EAST_WALL, PLATFORM_FLOOR,
  PLATFORM_NONE, PLATFORM_WEST_WALL, PROGRESS, TELEPORT, blocked, findPlatform, flagHolds,
  MAX_PERSISTED_PLATFORMS, hasPlatformAt, mapOf, tileAttributes, tileBehavior,
  type DistortionFrame, type DistortionState,
} from '../engine/world/distortion'
import { DIR } from '../engine/script/movement'
import { platformFlagShown } from '../engine/world/distortionElevator'
import type { VarStore } from '../engine/script/vars'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'

let data: DistortionData | null = null

let loading: Promise<void> | null = null

/** 지금 서 있는 층. 깨어진 세계 밖이면 null */
let floor: DistortionMap | null = null

/** `floor.platforms`의 몇 번째. 판 위가 아니면 −1 */
let platform = -1

// ⚠️ **셋을 밖으로 내보내지 않는다.** ESM의 살아 있는 묶음은 읽기만 되고
// 대입은 임자 모듈에서만 된다. 갈래들이 직접 들고 있으면 「어디서 바뀌었나」가
// 다시 열 파일로 퍼지므로, 읽는 길과 쓰는 길을 여기 함수로만 낸다

/** 받아 둔 층 자료. 아직 안 왔으면 null */
export function distortionData(): DistortionData | null {
  return data
}

/** 서 있는 판의 자리 번호. 판 위가 아니면 −1 */
export function platformIndex(): number {
  return platform
}

/** 층을 갈아 끼운다. `distortion`의 들고 나기만 부른다 */
export function setDistortionFloor(next: DistortionMap | null): void {
  floor = next
}

/** 판 번호를 그대로 박는다. 세이브에 적는 것까지 하려면 `bindPlatform`이다 */
export function setPlatformIndex(next: number): void {
  platform = next
}

/** 자료가 안 왔다. 판이 없는 세계는 지날 수가 없다 */
let unavailable = false

/**
 * 자료를 받는다. 깨어진 세계에 처음 들어설 때 한 번이면 된다.
 *
 * ⚠️ **거부된 약속을 캐시에 남기지 않는다.** `loading`을 그대로 두면 한 번
 * 실패한 세션은 다시 켤 때까지 영영 못 받는다. 그리고 실패를 **삼키지 않는다** —
 * 조용히 넘기면 판이 하나도 없는 세계를 평범한 격자로 걷게 되고, 그것은
 * 「지나갈 수 있는 것처럼」 보이는 쪽이라 못 지나는 것보다 나쁘다
 */
export function distortionPreload(): Promise<void> {
  loading ??= loadDistortion()
    .then((d) => { data = d; unavailable = false })
    .catch((e: unknown) => {
      loading = null
      unavailable = true
      throw e
    })
  return loading
}

export function distortionLoaded(): boolean {
  return data !== null
}

/**
 * 지금 깨어진 세계에 서 있는데 **자료가 없다.**
 *
 * 이러면 걸음을 막는다 (`MapStreamer`가 `player.riding`에 얹는다). 설치본에서는
 * 여기까지 안 온다 — `distortion`이 필수 그룹이라 그 그룹이 없으면 설치가
 * `ready`가 안 되고 부팅이 설치 화면으로 가서 **빠진 그룹 이름을 적어 준다**
 * (`install/required.ts` · `import/ui`). 개발 서버에서 자료를 안 구웠을 때가
 * 남는 갈래이고, 그때는 콘솔에 적힌다 (`MapStreamer`)
 */
export function distortionUnavailable(): boolean {
  return unavailable && floor === null && data === null
}

/** 그 맵이 깨어진 세계인가. 자료가 없으면 **맵 번호만** 보고 답한다 */
export function isDistortionFloor(mapId: number): boolean {
  if (data !== null) return mapOf(data, mapId) !== null
  return Object.values(MAP).includes(mapId as never)
}

export function state(): DistortionState {
  return useSaveStore.getState().distortion
}

export function setState(next: Partial<DistortionState>): void {
  useSaveStore.setState({ distortion: { ...state(), ...next } })
}

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
export function bindPlatform(index: number): void {
  const count = floor?.platforms.length ?? 0
  const outside = index < 0 || index >= count
  platform = outside ? -1 : index
  setState({ platformIndex: outside ? Math.min(count, MAX_PERSISTED_PLATFORMS - 1) : index })
}

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

/** 방향 번호 → 우리 yaw. `facing`은 `atan2(vx, vz)`라 0이 남쪽이다 */
export const FACING_YAW: Readonly<Record<number, number>> = {
  [DIR.south]: 0,
  [DIR.east]: Math.PI / 2,
  [DIR.north]: Math.PI,
  [DIR.west]: -Math.PI / 2,
}

/** 주인공의 세계 좌표. `GetPlayer3DPos`가 이걸 읽는다 */
export function distortionPlayerPos(): { x: number; y: number; z: number } {
  const p = worldState.player.position
  const [x, y, z] = toWorldTiles(p.x, p.y, p.z)
  return { x, y, z }
}
