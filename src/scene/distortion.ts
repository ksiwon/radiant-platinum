// 파열된 세계를 세계에 이어 붙인다 (PARITY §6.10)
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
  PLATFORM_NONE, PLATFORM_WEST_WALL, TELEPORT, blocked, cameraAt, findPlatform, flagHolds,
  MAX_PERSISTED_PLATFORMS, distortionBridge, hasPlatformAt, jumpAt, mapOf, tileAttributes,
  type DistortionFrame, type DistortionState,
} from '../engine/world/distortion'
import { addNpcFrom, removeNpc } from '../engine/actor/npcs'
import type { VarStore } from '../engine/script/vars'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'

let data: DistortionData | null = null
let loading: Promise<void> | null = null

/** 지금 서 있는 층. 파열된 세계 밖이면 null */
let floor: DistortionMap | null = null
/** `floor.platforms`의 몇 번째. 판 위가 아니면 −1 */
let platform = -1

/** 자료를 받는다. 파열된 세계에 처음 들어설 때 한 번이면 된다 */
export function distortionPreload(): Promise<void> {
  loading ??= loadDistortion().then((d) => { data = d })
  return loading
}

export function distortionLoaded(): boolean {
  return data !== null
}

/** 그 맵이 파열된 세계인가. 자료가 없으면 **맵 번호만** 보고 답한다 */
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
 * 파열된 세계의 한 층에 들어섰다 (`InitMapElements`).
 *
 * ⚠️ 원작은 처음 들어올 때만 발밑을 보고 판을 잡고, 그 뒤로는 **세이브에 적힌
 * 판 번호**를 그대로 쓴다 (`IsPersistedDataValid`). 층을 넘나들 때 판이 도로
 * 바닥으로 잡히면 벽에 붙어 있다가 층을 옮긴 순간 떨어지기 때문이다
 */
export function distortionEnter(mapId: number, x: number, y: number, z: number): void {
  if (data === null) { floor = null; platform = -1; return }
  floor = mapOf(data, mapId)
  if (floor === null) { platform = -1; return }
  const s = state()
  if (!s.valid) {
    const [wx, wy, wz] = toWorldTiles(x, y, z)
    platform = findPlatform(floor.platforms, wx, wy, wz)
    setState({ valid: true, platformIndex: Math.max(0, platform) })
    return
  }
  // 판 개수 이상이면 「어느 판도 아니다」다 — 보통 격자로 걷는다
  platform = s.platformIndex < floor.platforms.length ? s.platformIndex : -1
}

/** 파열된 세계를 나갔다 */
export function distortionLeave(): void {
  floor = null
  platform = -1
}

/** 지금 파열된 세계 안인가 */
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
} = {
  runScript: null, progress: null, setProgress: null,
  giratinaAnim: null, cyrusAppearance: null,
}

/** 이미 돈 사건은 다시 안 돈다. 맵을 나가면 지운다 */
const ranEvents = new Set<string>()

/**
 * 한 칸 옮겼다 (`DistWorld_HandlePlayerMoved` + `HandlePlayerPositionChanged`).
 *
 * 차례가 원작 그대로다 — 유령 소품 → 카메라 → 뛰는 자리 → 사건. 뛰는 자리가
 * 걸리면 **거기서 끝난다**(사건을 안 본다)
 */
export function distortionStepped(x: number, y: number, z: number, dir: number): void {
  if (floor === null) return
  const [wx, wy, wz] = toWorldTiles(x, y, z)

  applyTriggers(wx, wy, wz, dir)
  applyCamera(wx, wy, wz, dir)
  if (applyJump(wx, wy, wz, dir)) return
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

/** 시험용 — 층을 나가면 사건 기억을 지운다 */
export function distortionForgetEvents(): void {
  ranEvents.clear()
}
