// 깨어진 세계 — 승강 발판을 타고 층을 옮긴다 (PARITY §6.10)
//
// 경로와 프레임 수는 `engine/world/distortionElevator`가 들고, 여기서는
// **사람을 얹고 층을 갈아 끼우는 일**을 한다.
import { connectionOf, findPlatform, mapOf } from '../engine/world/distortion'
import {
  ELEVATOR_DIR, changeMapFrame, cyrusB4FWalk, cyrusLeavesB4F, DIST_OBJ, downEndFlags,
  elevatorAt, elevatorLegs, legFrames, passengerAfter, passengerLocalID, upStartFlags, withFlag,
  type ElevatorLeg,
} from '../engine/world/distortionElevator'
import { addNpcFrom, npcActors, removeNpc } from '../engine/actor/npcs'
import { world, type Npc } from '../engine/map/world'
import { worldState } from '../state/worldState'
import {
  bindPlatform, distortionData, distortionHooks, distortionFloor, setState, state, toLocalTiles, toWorldTiles,
} from './distortionCore'

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

/** 층을 나갈 때 타던 것을 버린다 (`distortionLeave`) */
export function resetDistortionRide(): void {
  ride = null
}

/**
 * 씬이 프레임을 물려 주고 있는가.
 *
 * ⚠️ **안 물려 주면 아예 안 태운다.** 태워 놓고 아무도 안 움직이면 그 자리에서
 * 통째로 갇힌다 — 발판 위는 조작이 안 먹는 자리라서 되돌릴 길이 없다.
 * 첫 프레임에 켜지므로 실제로 막는 것은 「배선이 빠졌을 때」뿐이다
 */
let ticking = false

/** 승강 발판이 한 프레임이라도 돈 뒤인가. 바위가 이걸 보고 떨어진다 */
export function elevatorTicking(): boolean {
  return ticking
}

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
export function startRide(wx: number, wy: number, wz: number): boolean {
  const floor = distortionFloor()
  const data = distortionData()
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
  const floor = distortionFloor()
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
  const floor = distortionFloor()
  const data = distortionData()
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
  const floor = distortionFloor()
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
  const floor = distortionFloor()
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
