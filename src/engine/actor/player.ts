// 플레이어 이동 — fixedUpdate에서 적분, 렌더는 prev/current 보간
import { Vector3 } from 'three'
import { worldState } from '../../state/worldState'
import { activeZone } from '../map/zone'
import { facingFromYaw, moveByYaw } from '../input/mouse'

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

const desired = new Vector3()

/** 한 축씩 나눠 판정한다 — 벽을 따라 미끄러지게 하려면 축을 합쳐 판정하면 안 된다 */
function blocked(x: number, z: number): boolean {
  const grid = activeZone.grid
  if (!grid) return false
  // 캐릭터를 점이 아니라 반지름 있는 원으로 본다
  return (
    grid.isBlockedAtWorld(x - RADIUS, z - RADIUS) ||
    grid.isBlockedAtWorld(x + RADIUS, z - RADIUS) ||
    grid.isBlockedAtWorld(x - RADIUS, z + RADIUS) ||
    grid.isBlockedAtWorld(x + RADIUS, z + RADIUS)
  )
}

export const playerSystem = {
  fixedUpdate(dt: number) {
    const p = worldState.player
    const input = worldState.input

    p.prevPosition.copy(p.position)

    const speed = input.run ? RUN_SPEED : WALK_SPEED
    // 3인칭은 원작대로 방향키가 월드 축이다. 1인칭은 **시선이 기준**이라 누른
    // 방향을 yaw만큼 돌린다 — yaw 0이면 회전이 항등이라 3인칭과 같은 식이 된다
    const dir = worldState.camera.mode === 'first'
      ? moveByYaw(input.move.x, input.move.y, worldState.camera.yaw)
      : { x: input.move.x, z: input.move.y }
    desired.set(dir.x, 0, dir.z).multiplyScalar(speed)

    // 간단한 가감속 (스파이크 수준)
    p.velocity.lerp(desired, 1 - Math.exp(-12 * dt))

    const nx = p.position.x + p.velocity.x * dt
    const nz = p.position.z + p.velocity.z * dt

    if (activeZone.grid) {
      // 축별로 따로 시도 — 벽에 비스듬히 부딪히면 벽을 따라 미끄러진다
      if (!blocked(nx, p.position.z)) p.position.x = nx
      else p.velocity.x = 0
      if (!blocked(p.position.x, nz)) p.position.z = nz
      else p.velocity.z = 0
    } else {
      p.position.x = Math.max(-FALLBACK_ARENA, Math.min(FALLBACK_ARENA, nx))
      p.position.z = Math.max(-FALLBACK_ARENA, Math.min(FALLBACK_ARENA, nz))
    }

    // 지면을 따라간다. 판이 겹치는 자리(다리와 그 밑)에서는 **지금 높이**가
    // 어느 층인지 가르는 유일한 단서라, 직전 y를 그대로 넘겨야 한다
    const ground = activeZone.grid?.heightAtWorld(p.position.x, p.position.z, p.position.y)
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
    worldState.time.elapsed += dt
  },
}
