import { Matrix4, Quaternion, Vector3 } from 'three'
import type { DistortionFrame } from '../world/distortion'

const right = new Vector3()
const up = new Vector3()
const forward = new Vector3()
const basis = new Matrix4()
const yaw = new Quaternion()
const Y_AXIS = new Vector3(0, 1, 0)

/** 왜곡세계 표면의 로컬 벡터를 실제 월드 벡터로 바꾼다. */
export function surfaceVector(
  frame: DistortionFrame | null, x: number, y: number, z: number, out: Vector3,
): Vector3 {
  if (frame === null) return out.set(x, y, z)
  if (frame.axis === 'x') return out.set(x * frame.sign, y * frame.sign, z)
  return out.set(-y * frame.sign, x * frame.sign, z)
}

/** 월드 속도를 표면의 로컬 yaw로 되돌린다. 멈추면 마지막 방향을 보존한다. */
export function surfaceHeading(
  frame: DistortionFrame | null,
  vx: number, vy: number, vz: number,
  fallback: number,
): number {
  const localX = frame === null
    ? vx
    : frame.axis === 'x' ? vx * frame.sign : vy * frame.sign
  if (localX * localX + vz * vz < 0.0001) return fallback
  return Math.atan2(localX, vz)
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
