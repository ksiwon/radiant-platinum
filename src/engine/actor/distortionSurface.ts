// 깨어진 세계의 표면 — 서 있는 판이 곧 「위」다 (PARITY §6.10).
//
// 판 갈래 넷이 화면의 오른쪽·앞·위를 저마다 다른 세계 축에 매단다. 그 표는
// 원작 `player_move.c`의 걸음 표 넷이고(`engine/world/distortion`의 `STEP`),
// 여기서는 그것을 벡터로 쓰기만 한다 — **값을 여기 다시 적지 않는다.**
import { Matrix4, Quaternion, Vector3 } from 'three'
import { platformBasis, type DistortionFrame } from '../world/distortion'

const right = new Vector3()
const up = new Vector3()
const forward = new Vector3()
const basis = new Matrix4()
const yaw = new Quaternion()
const Y_AXIS = new Vector3(0, 1, 0)

/**
 * 판 위의 로컬 벡터를 세계 벡터로 옮긴다.
 *
 * 로컬은 늘 바닥 기준이다 — +x가 동, +z가 남, +y가 판에서 솟는 쪽이다
 */
export function surfaceVector(
  frame: DistortionFrame | null, x: number, y: number, z: number, out: Vector3,
): Vector3 {
  if (frame === null) return out.set(x, y, z)
  const b = platformBasis(frame.kind)
  return out.set(
    x * b.right[0] + y * b.up[0] + z * b.forward[0],
    x * b.right[1] + y * b.up[1] + z * b.forward[1],
    x * b.right[2] + y * b.up[2] + z * b.forward[2],
  )
}

/**
 * 세계 속도를 판 위의 로컬 yaw로 되돌린다. 멈추면 마지막 방향을 보존한다.
 *
 * 기저가 정규직교라 **전치가 곧 역**이다 — 세계 벡터를 오른쪽·앞과 내적하면
 * 로컬 x와 z가 나온다
 */
export function surfaceHeading(
  frame: DistortionFrame | null,
  vx: number, vy: number, vz: number,
  fallback: number,
): number {
  let localX = vx
  let localZ = vz
  if (frame !== null) {
    const b = platformBasis(frame.kind)
    localX = vx * b.right[0] + vy * b.right[1] + vz * b.right[2]
    localZ = vx * b.forward[0] + vy * b.forward[1] + vz * b.forward[2]
  }
  if (localX * localX + localZ * localZ < 0.0001) return fallback
  return Math.atan2(localX, localZ)
}

/** 로컬 +Y가 판의 법선이 되도록 주인공의 전체 회전을 만든다. */
export function surfaceQuaternion(
  frame: DistortionFrame | null, heading: number, out: Quaternion,
): Quaternion {
  surfaceVector(frame, 1, 0, 0, right)
  surfaceVector(frame, 0, 1, 0, up)
  surfaceVector(frame, 0, 0, 1, forward)
  basis.makeBasis(right, up, forward)
  out.setFromRotationMatrix(basis)
  yaw.setFromAxisAngle(Y_AXIS, heading)
  return out.multiply(yaw)
}
