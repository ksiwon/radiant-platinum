// 깨어진 세계 — 이 세계에만 있는 사람과 순간이동 (PARITY §6.10)
//
// 배치표가 세계 좌표와 고정소수점 높이를 들고 있어서, 세우는 자리에서
// 우리 맵 좌표로 되돌린다.
import { FLAG_COND, TELEPORT, flagHolds } from '../engine/world/distortion'
import { addNpcFrom, npcActors, removeNpc } from '../engine/actor/npcs'
import type { VarStore } from '../engine/script/vars'
import { distortionData, distortionHooks, distortionFloor, state, toLocalTiles } from './distortionCore'

/** 밟으면 스크립트가 서는 두 자리 (`DistWorld_HandlePlayerMovementEnd`) */
export function applyTeleport(wx: number, wy: number, wz: number, dir: number): void {
  const floor = distortionFloor()
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

/** 층을 들고 날 때 비켜섰던 기억을 버린다 */
export function resetDistortionObjects(): void {
  stoodAside.clear()
}

export function distortionAddObject(localID: number, vars: VarStore): void {
  const floor = distortionFloor()
  const data = distortionData()
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
export function spawnFloorObjects(mapId: number): void {
  const data = distortionData()
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
  const floor = distortionFloor()
  const data = distortionData()
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
