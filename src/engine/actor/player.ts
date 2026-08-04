// 플레이어 이동 — fixedUpdate에서 적분, 렌더는 prev/current 보간
import { Vector3 } from 'three'
import { worldState } from '../../state/worldState'
import { activeZone } from '../map/zone'

const WALK_SPEED = 4.5
const RUN_SPEED = 8
/** 캐릭터 반지름(타일 단위). 벽에 얼굴이 박히지 않게 여유를 둔다 */
const RADIUS = 0.3
/** 존이 없을 때(회색 박스 월드) 쓰는 경계 */
const FALLBACK_ARENA = 19

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
    desired.set(input.move.x, 0, input.move.y).multiplyScalar(speed)

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

    if (p.velocity.lengthSq() > 0.01) {
      p.facing = Math.atan2(p.velocity.x, p.velocity.z)
    }
    worldState.time.elapsed += dt
  },
}
