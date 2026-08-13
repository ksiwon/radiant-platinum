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
import { loadDistortion } from '../data/gameData'
import type { DistortionData, DistortionMap } from '../data/schema'
import {
  ATTRS_INVALID, EVENT_CMD, MAP, PLATFORM_CEILING, PLATFORM_EAST_WALL, PLATFORM_FLOOR,
  PLATFORM_NONE, PLATFORM_WEST_WALL, TELEPORT, blocked, cameraAt, connectionOf, findPlatform,
  flagHolds, initialHiddenGroups, MAX_PERSISTED_PLATFORMS, distortionBridge, hasPlatformAt,
  jumpAt, mapOf,
  tileAttributes, type DistortionFrame, type DistortionState,
} from '../engine/world/distortion'
import {
  ELEVATOR_DIR, changeMapFrame, cyrusB4FWalk, cyrusLeavesB4F, DIST_OBJ, downEndFlags, elevatorAt,
  elevatorLegs, initialPlatformFlags, legFrames, passengerAfter, passengerLocalID, upStartFlags,
  withFlag, type ElevatorLeg,
} from '../engine/world/distortionElevator'
import {
  FALL_DEST, fallDestination, fallLocationAt, fellIntoPit, fellIntoWrongPit, fellToB6F,
  initialPuzzleFlags, puzzleSolved,
} from '../engine/world/distortionBoulder'
import { addNpcFrom, npcActors, removeNpc } from '../engine/actor/npcs'
import { world } from '../engine/map/world'
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
  switch (p.kind) {
    case PLATFORM_FLOOR:
      return { axis: 'x', sign: 1, lock: ly, lockAxis: 'y' }
    case PLATFORM_CEILING:
      return { axis: 'x', sign: -1, lock: ly, lockAxis: 'y' }
    case PLATFORM_WEST_WALL:
      return { axis: 'y', sign: -1, lock: lx, lockAxis: 'x' }
    case PLATFORM_EAST_WALL:
      return { axis: 'y', sign: 1, lock: lx, lockAxis: 'x' }
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
 * 그 칸의 **바닥 판 높이** (맵 안 좌표).
 *
 * ⚠️ **여기 없으면 주인공이 땅에 묻힌다.** 이 세계의 걷는 면은 맵 격자가 아니라
 * 떠 있는 판이라, 보통 맵처럼 `heightAtWorld`를 물으면 0이 온다 — 판이 y=2에
 * 있는데 0에 세우니 발목까지 파묻힌 채로 시작했다.
 *
 * 바닥 판(`PLATFORM_FLOOR`)만 본다. 벽·천장은 서 있는 면이 세로라 「높이」가
 * 없고, 그런 자리로 들어서는 것은 승강 발판이 자기 높이를 직접 준다
 */
export function distortionGroundY(mapId: number, x: number, z: number): number | null {
  // ⚠️ 지금 걸린 층(`floor`)을 보면 안 된다. 워프는 자리를 **먼저** 잡고 층을
  // 나중에 거는데, 그때 `floor`는 아직 떠나온 층이다
  const map = data === null ? null : mapOf(data, mapId)
  if (map === null) return null
  const wx = x + map.offsetX
  const wz = z + map.offsetZ
  let best: number | null = null
  for (const p of map.platforms) {
    if (p.kind !== PLATFORM_FLOOR) continue
    const b = p.bounds
    if (wx < b.x || wx > b.x + b.sx) continue
    if (wz < b.z || wz > b.z + b.sz) continue
    // 겹치면 제일 높은 바닥이 서는 자리다 — 아래 판은 그 밑을 지난다
    const y = b.y + b.sy - map.offsetY
    if (best === null || y > best) best = y
  }
  if (best !== null) return best

  // ⚠️ **판이 없는 층은 배치표에 물어본다.** 열 층 중 여섯이 판 없이 보통
  // 격자로 걷는데, 그 격자에는 BDHC 판이 없어서 `heightAtWorld`가 0을 준다 —
  // 그런데 실제 지면은 한 칸 위다. 그 높이를 아는 유일한 원작 자료가 이 층에
  // 선 사람들의 y다 (`distortionAddObject`가 고정소수점에서 푸는 그 값).
  // 지어낸 값이 아니라 롬이 「여기가 발 높이다」라고 적어 둔 것이다
  const objects = data?.mapObjects.find((m) => m.map === mapId)?.objects
  if (objects === undefined || objects.length === 0) return null
  const heights = objects.map((o) => Math.round((o.y as number) / FX32_PER_TILE) - map.offsetY)
  heights.sort((a, b2) => a - b2)
  return heights[Math.floor(heights.length / 2)] ?? null
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
    const y = distortionGroundY(mapId, Math.floor(x), Math.floor(z))
    if (y !== null) return y
  }
  return grid.heightAtWorld(x, z, layer) ?? 0
}

export function distortionEnter(mapId: number, x: number, y: number, z: number): void {
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
    return
  }
  // 판 개수 이상이면 「어느 판도 아니다」다 — 보통 격자로 걷는다
  platform = s.platformIndex < floor.platforms.length ? s.platformIndex : -1
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
}

/** 지금 깨어진 세계 안인가 */
export function distortionActive(): boolean {
  return floor !== null
}

/** 이번 층의 모든 판. 그림을 그리는 쪽이 본다 */
export function distortionFloor(): DistortionMap | null {
  return floor
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
} = {
  runScript: null, progress: null, setProgress: null,
  giratinaAnim: null, cyrusAppearance: null, setCyrusAppearance: null,
  puzzleFinished: null, setPuzzleFinished: null, addObject: null,
}

/** 이미 돈 사건은 다시 안 돈다. 맵을 나가면 지운다 */
const ranEvents = new Set<string>()

/**
 * 한 칸 옮겼다 (`DistWorld_HandlePlayerMoved` + `HandlePlayerPositionChanged`).
 *
 * 차례가 원작 그대로다 — 유령 소품 → 카메라 → 뛰는 자리 → **승강 발판** →
 * 사건 → 스크립트 칸. 뛰는 자리가 걸리면 거기서 끝나고, 승강 발판이 걸려도
 * 끝난다 (`HandlePlayerPositionChanged`가 발판을 제일 먼저 본다)
 */
export function distortionStepped(x: number, y: number, z: number, dir: number): void {
  if (floor === null || ride !== null) return
  const [wx, wy, wz] = toWorldTiles(x, y, z)

  applyTriggers(wx, wy, wz, dir)
  applyCamera(wx, wy, wz, dir)
  if (applyJump(wx, wy, wz, dir)) return
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

function applyCamera(wx: number, wy: number, wz: number, dir: number): void {
  if (floor === null) return
  const found = cameraAt(floor.cameras, wx, wy, wz, dir)
  if (found === null) return
  setState({ cameraAngleX: found.angleX, cameraAngleY: found.angleY, cameraAngleZ: found.angleZ })
}

/**
 * 뛰는 자리 (`HandleFloatingPlatformJumpPointAt`).
 *
 * 판을 갈아타면서 자리를 옮긴다. 원작은 여기서 화면 연출까지 하지만 옮기는
 * 값은 표에 그대로 있다 — `dx·dy·dz`가 세계 좌표의 차이다
 */
function applyJump(wx: number, wy: number, wz: number, dir: number): boolean {
  if (floor === null) return false
  const jump = jumpAt(floor.jumps, wx, wy, wz, dir)
  if (jump === null) return false

  const [lx, ly, lz] = toLocalTiles(wx + jump.dx, wy + jump.dy, wz + jump.dz)
  const p = worldState.player
  p.position.set(lx + 0.5, ly, lz + 0.5)
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  bindPlatform(jump.platformIndex)
  return true
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

/**
 * 사건 프로그램 (`RunEventCommands`).
 *
 * ⚠️ **여기서 하는 것은 「상태를 바꾸는 명령」뿐이다.** 원작은 이 표로 발판을
 * 움직이고 폭포를 타고 카메라를 돌리는 연출까지 하는데, 그 연출들은 프레임마다
 * 도는 것이라 걸음 한 번에 끝나지 않는다. 진행도·바위 자리·스크립트 시작처럼
 * **다음에 무엇이 열리는가**를 정하는 것만 여기서 처리하고, 나머지는 아직 없다
 */
function runEvent(cmds: readonly { kind: number; params: Record<string, unknown> | null }[]): void {
  for (const cmd of cmds) {
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
        movePlatform(p)
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

/**
 * 발판이 움직인다 (`EVENT_CMD_MOVE_PLATFORM`).
 *
 * 태우고 가는 발판이면 주인공도 같이 옮긴다. 원작은 프레임마다 조금씩 밀지만
 * 닿는 자리는 `finalTile*Offset`이 정해 둔 그 칸이다
 */
function movePlatform(p: Record<string, unknown>): void {
  if (p.movePlayer !== 1) return
  const pos = worldState.player.position
  pos.x += (p.finalTileXOffset as number) || 0
  pos.y += (p.finalTileYOffset as number) || 0
  pos.z += (p.finalTileZOffset as number) || 0
  worldState.player.prevPosition.copy(pos)
  // 닿은 자리에서 발밑의 판을 다시 잡는다 (`FindAndPrepareNewCurrentFloatingPlatform`).
  // 이걸 빼면 옮겨진 자리가 앞 판의 격자 밖이라 그 자리에서 못 움직인다
  if (floor === null) return
  const [wx, wy, wz] = toWorldTiles(pos.x, pos.y, pos.z)
  bindPlatform(findPlatform(floor.platforms, wx, wy, wz))
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

  // 층을 다 받았으면 같이 타는 사람을 닿는 층의 번호로 다시 세운다
  if (ride.addPassenger && ride.passenger !== null) {
    ride.addPassenger = false
    distortionHooks.addObject?.(ride.passenger)
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
  // ⚠️ **번호가 층마다 다시 128에서 센다.** 같이 타는 사람은 층이 바뀌는
  // 순간 다른 번호가 되므로, 앞 층의 것을 지우고 닿는 층의 것을 세운다 —
  // 원작은 같은 객체의 `localID`를 갈아 끼운다 (`MapObject_SetLocalID`)
  const after = ride.passenger === null ? null : passengerAfter(dest)
  if (ride.passenger !== null) removeNpc(ride.passenger)

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
export function distortionAddObject(localID: number, vars: VarStore): void {
  if (floor === null || data === null) return
  const table = data.mapObjects.find((m) => m.map === floor?.map)
  const row = table?.objects.find((o) => o.localID === localID)
  if (row === undefined) return
  const worldY = Math.round((row.y as number) / FX32_PER_TILE)
  const [lx, ly, lz] = toLocalTiles(row.x as number, worldY, row.z as number)
  const hidden = row.hiddenFlag as number
  addNpcFrom({
    x: lx, z: lz, height: ly,
    localID,
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

export function distortionRemoveObject(localID: number): void {
  removeNpc(localID)
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
distortionBridge.frame = distortionFrame
distortionBridge.groundY = (x, z) =>
  (floor === null ? null : distortionGroundY(floor.map, Math.floor(x), Math.floor(z)))
distortionBridge.dropBoulder = dropBoulder

/** 시험용 — 층을 나가면 사건 기억을 지운다 */
export function distortionForgetEvents(): void {
  ranEvents.clear()
}
