// 플레이어 이동 — fixedUpdate에서 적분, 렌더는 prev/current 보간
import { Vector3 } from 'three'
import { worldState } from '../../state/worldState'

const WALK_SPEED = 4.5
const RUN_SPEED = 8
const ARENA = 19 // 회색 박스 월드 경계

const desired = new Vector3()

export const playerSystem = {
  fixedUpdate(dt: number) {
    const p = worldState.player
    const input = worldState.input

    p.prevPosition.copy(p.position)

    const speed = input.run ? RUN_SPEED : WALK_SPEED
    desired.set(input.move.x, 0, input.move.y).multiplyScalar(speed)

    // 간단한 가감속 (스파이크 수준)
    p.velocity.lerp(desired, 1 - Math.exp(-12 * dt))
    p.position.addScaledVector(p.velocity, dt)

    // 경계 클램프
    p.position.x = Math.max(-ARENA, Math.min(ARENA, p.position.x))
    p.position.z = Math.max(-ARENA, Math.min(ARENA, p.position.z))

    if (p.velocity.lengthSq() > 0.01) {
      p.facing = Math.atan2(p.velocity.x, p.velocity.z)
    }
    worldState.time.elapsed += dt
  },
}
