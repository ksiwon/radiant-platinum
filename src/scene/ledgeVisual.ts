import { ledgeJump } from '../engine/actor/ledge'

interface LedgeFacing { dx: number; dz: number; yaw: number }

/** 턱 행동값을 3D 앞면의 방향으로 바꾼다. */
export function ledgeFacing(behavior: number): LedgeFacing | null {
  const jump = ledgeJump(behavior)
  if (!jump) return null
  const [dx, dz] = jump
  return { dx, dz, yaw: Math.atan2(dx, dz) }
}
