// 플레이어 이동 — fixedUpdate에서 적분, 렌더는 prev/current 보간
import { Vector3 } from 'three'
import { worldState } from '../../state/worldState'
import { activeZone, isSurfable } from '../map/zone'
import { MapGrid } from '../map/grid'
import { HOP_RISE, HOP_TIME, ledgeHop } from './ledge'
import { facingFromYaw } from '../input/mouse'
import { pushDirection } from '../input/move'
import { obstacleAt, pushBoulder, STRENGTH_BOULDER } from './obstacles'
import { bikeSpeedAt } from './bike'
import { distortionBridge } from '../world/distortion'

export const WALK_SPEED = 4.5
export const RUN_SPEED = 8
/** 캐릭터 반지름(타일 단위). 벽에 얼굴이 박히지 않게 여유를 둔다 */
const RADIUS = 0.3
/** 존이 없을 때(회색 박스 월드) 쓰는 경계 */
const FALLBACK_ARENA = 19
/** 지면을 따라붙는 속도. 클수록 계단에 딱 붙는다 */
const CLIMB_RATE = 18
/** 이보다 크게 벌어지면 따라붙이지 않고 즉시 맞춘다 — 워프가 그렇다 */
const CLIMB_SNAP = 1.5

/** 바라보는 방향의 단위 벡터. `facing`은 `atan2(vx, vz)`라 0이 +z다 */
const FACING_STEP = [
  { x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 },
] as const
const quarterOf = (facing: number): number =>
  ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4

const desired = new Vector3()

/**
 * 한 축씩 나눠 판정한다 — 벽을 따라 미끄러지게 하려면 축을 합쳐 판정하면 안 된다.
 *
 * ⚠️ 격자만 봐서는 **바다 위를 걸어 다닌다.** 물 25,469칸이 통행 가능으로 찍혀
 * 있어서다. 물은 격자가 아니라 **파도타기 상태**가 가른다 (`map/zone`의
 * `isSurfable`) — 원작 `player_move.c` 248줄이 그 한 줄이다
 */
function blocked(x: number, z: number, y = worldState.player.position.y): boolean {
  const grid = activeZone.grid
  if (!grid) return false
  const surfing = worldState.player.surfing
  const shut = (cx: number, cz: number) => {
    // 파열된 세계는 맵 격자가 아니라 **서 있는 판**이 정한다 (PARITY §6.10).
    // 판 위가 아니면 null을 주고, 그때만 아래 평소 판정으로 내려간다
    const dw = distortionBridge.blockedAt?.(cx, y, cz)
    if (dw !== null && dw !== undefined) return dw
    return grid.isBlockedAtWorld(cx, cz)
    || (!surfing && isSurfable(grid.behaviorAtWorld(cx, cz)))
    // 벨 나무·깰 바위·밀 바위는 지형이 아니라 객체다 (`actor/obstacles`)
    || obstacleAt(Math.floor(cx), Math.floor(cz)) !== null
  }
  // 캐릭터를 점이 아니라 반지름 있는 원으로 본다
  return (
    shut(x - RADIUS, z - RADIUS) ||
    shut(x + RADIUS, z - RADIUS) ||
    shut(x - RADIUS, z + RADIUS) ||
    shut(x + RADIUS, z + RADIUS)
  )
}

export const playerSystem = {
  fixedUpdate(dt: number) {
    const p = worldState.player
    const input = worldState.input

    p.prevPosition.copy(p.position)

    // ⚠️ **신발이 있어야 뛴다** (`PlayerAvatar`가 `PlayerData_HasRunningShoes`를
    // 본다). 엄마가 주기 전에는 달리기 키를 눌러도 걷는 속도 그대로다.
    //
    // 자전거는 그보다 빠르고 **밟을수록 빨라진다** — 원작이 페달마다 한 단씩
    // 올린다 (`actor/bike`의 실측 배수 2 · 2.67 · 4). 멈추면 처음으로 돌아간다
    const moving = worldState.input.move.lengthSq() > 0.0001
    p.pedalling = p.cycling && moving ? p.pedalling + dt : 0
    const speed = p.cycling ? WALK_SPEED * bikeSpeedAt(p.pedalling)
      : input.run && p.runningShoes ? RUN_SPEED : WALK_SPEED
    // 3인칭은 원작대로 방향키가 월드 축이다. 1인칭은 **시선이 기준**이라 누른
    // 방향을 yaw만큼 돌린다 — yaw 0이면 회전이 항등이라 3인칭과 같은 식이 된다
    const dir = pushDirection()
    desired.set(dir.x, 0, dir.z).multiplyScalar(speed)

    // 간단한 가감속 (스파이크 수준)
    p.velocity.lerp(desired, 1 - Math.exp(-12 * dt))

    // 턱을 넘는 중이면 그것만 한다. 원작도 뛰는 동안은 조작이 안 먹는다
    if (p.hop.active) {
      p.hop.t = Math.min(1, p.hop.t + dt / HOP_TIME)
      const k = p.hop.t
      p.position.x = p.hop.fromX + (p.hop.toX - p.hop.fromX) * k
      p.position.z = p.hop.fromZ + (p.hop.toZ - p.hop.fromZ) * k
      p.velocity.set(0, 0, 0)
      const ground = activeZone.grid?.heightAtWorld(p.position.x, p.position.z, p.position.y)
      // 포물선으로 뜬다. 4k(1−k)는 가운데서 1이고 양 끝에서 0이다
      p.position.y = (ground ?? p.position.y) + HOP_RISE * 4 * k * (1 - k)
      if (p.hop.t >= 1) p.hop.active = false
      worldState.time.elapsed += dt
      return
    }

    const grid = activeZone.grid
    if (grid instanceof MapGrid) {
      const land = ledgeHop(grid, p.position.x, p.position.z, p.velocity.x, p.velocity.z)
      if (land) {
        p.hop = {
          active: true, t: 0,
          fromX: p.position.x, fromZ: p.position.z, toX: land.x, toZ: land.z,
        }
        p.facing = Math.atan2(land.x - p.position.x, land.z - p.position.z)
        return
      }
    }

    /**
     * 파열된 세계에서 **벽에 서 있는가** (PARITY §6.10).
     *
     * 벽에서는 x가 판에 붙고 y가 걷는 축이 된다 — 화면의 좌우가 세계의 위아래다.
     * 부호는 판의 갈래가 준다(서쪽 벽과 동쪽 벽이 서로 뒤집혀 있다)
     */
    const frame = distortionBridge.frame?.() ?? null
    const onWall = frame !== null && frame.axis === 'y'
    if (onWall) {
      p.velocity.y = p.velocity.x * frame.sign
      p.velocity.x = 0
      p.position.x = frame.lock + 0.5
    }

    const nx = p.position.x + p.velocity.x * dt
    const nz = p.position.z + p.velocity.z * dt
    const ny = p.position.y + p.velocity.y * dt

    // 괴력 바위를 민다. 미는 것은 기술이 아니라 **걸음**이라 여기서 한다 —
    // 원작도 기술은 허락만 하고 실제로는 `MOVEMENT_ACTION_PUSH_*`가 옮긴다
    if (p.strength && activeZone.grid && blocked(nx, nz)) {
      const step = FACING_STEP[quarterOf(p.facing)]!
      const front = obstacleAt(Math.floor(p.position.x) + step.x, Math.floor(p.position.z) + step.z)
      if (front && front.gfx === STRENGTH_BOULDER) {
        pushBoulder(activeZone.grid, front, step)
      }
    }

    if (activeZone.grid) {
      // 이미 막힌 칸 안에 서 있으면 판정을 건너뛴다.
      //
      // 반지름으로 네 모서리를 보기 때문에, 한 번 벽 안에 들어가면 **어느 쪽으로
      // 조금 움직여도 그 벽을 다시 짚어서** 영영 못 나온다. 문 타일이 통행 불가라
      // 거기 세워지면 그대로 갇혔다(§4.2). 그 자리는 `walkOutOfDoor`가 막았지만
      // 안전망은 남겨 둔다 — 벽 안은 이미 잘못된 상태고, 갇히는 것보다 걸어
      // 나오는 편이 낫다
      const stuck = blocked(p.position.x, p.position.z)
      // 축별로 따로 시도 — 벽에 비스듬히 부딪히면 벽을 따라 미끄러진다
      if (onWall) {
        // 벽에서는 x 대신 y를 민다. x는 이미 판에 붙여 두었다
        if (stuck || !blocked(p.position.x, p.position.z, ny)) p.position.y = ny
        else p.velocity.y = 0
      } else if (stuck || !blocked(nx, p.position.z)) p.position.x = nx
      else p.velocity.x = 0
      if (stuck || !blocked(p.position.x, nz)) p.position.z = nz
      else p.velocity.z = 0
    } else {
      p.position.x = Math.max(-FALLBACK_ARENA, Math.min(FALLBACK_ARENA, nx))
      p.position.z = Math.max(-FALLBACK_ARENA, Math.min(FALLBACK_ARENA, nz))
    }

    // 지면을 따라간다. 판이 겹치는 자리(다리와 그 밑)에서는 **지금 높이**가
    // 어느 층인지 가르는 유일한 단서라, 직전 y를 그대로 넘겨야 한다.
    //
    // ⚠️ **벽에 서 있으면 안 따라간다.** 그 y는 지면 높이가 아니라 걷고 있는
    // 축이라, 지면으로 끌어내리면 벽에 붙는 순간 바닥까지 미끄러진다
    const ground = onWall ? null
      : activeZone.grid?.heightAtWorld(p.position.x, p.position.z, p.position.y)
    if (ground !== null && ground !== undefined) {
      // 계단은 한 칸에 반 타일씩 오른다. 그대로 대입하면 판 경계에서 튀므로
      // 짧게 따라붙인다 — 시뮬레이션이 아니라 표현이라 눈에 맞추면 된다
      const gap = ground - p.position.y
      p.position.y += Math.abs(gap) > CLIMB_SNAP
        ? gap // 워프·낙하처럼 크게 벌어지면 즉시 맞춘다
        : gap * (1 - Math.exp(-CLIMB_RATE * dt))
    }

    // 1인칭은 **보는 쪽이 곧 앞**이다. 서서 고개만 돌려도 몸이 따라 돌아야
    // 말을 걸 때(`tileInFront`) 눈에 보이는 사람에게 걸린다. 3인칭은 원작대로
    // 걸어간 쪽을 본다
    if (worldState.camera.mode === 'first') {
      p.facing = facingFromYaw(worldState.camera.yaw)
    } else if (p.velocity.lengthSq() > 0.01) {
      p.facing = Math.atan2(p.velocity.x, p.velocity.z)
    }

    // 뭍에 올라서면 내린다. 원작도 물 밖으로 나가는 순간 상태가 풀린다 —
    // 타는 것은 A를 눌러야 하지만 내리는 것은 걸어 나오면 된다
    if (p.surfing && activeZone.grid
      && !isSurfable(activeZone.grid.behaviorAtWorld(p.position.x, p.position.z))) {
      p.surfing = false
    }
    worldState.time.elapsed += dt
  },
}
