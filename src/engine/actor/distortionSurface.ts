// 깨어진 세계의 표면 — 서 있는 판이 곧 「위」다 (PARITY §6.10).
//
// 판 갈래 넷이 화면의 오른쪽·앞·위를 저마다 다른 세계 축에 매단다. 그 표는
// 원작 `player_move.c`의 걸음 표 넷이고(`engine/world/distortion`의 `STEP`),
// 여기서는 그것을 벡터로 쓰기만 한다 — **값을 여기 다시 적지 않는다.**
import { Matrix4, Quaternion, Vector3 } from 'three'
import { platformBasis, type DistortionFrame, type PoseTurn } from '../world/distortion'

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

const turnFrom = new Quaternion()
const turnTo = new Quaternion()
const turnRoll = new Quaternion()
const turnEnd = new Quaternion()
const turnResidual = new Quaternion()
const turnPart = new Quaternion()
const Z_AXIS = new Vector3(0, 0, 1)
const RAD = Math.PI / 180

/**
 * 갈아타는 도중의 자세 (`RotateMapObject`).
 *
 * 원작은 몸의 그림을 **세계 Z축 둘레로 `angle`도**(`playerSpriteRotAngle` ±90) 돌리고 보는 쪽도 같이
 * 바꾼다(`newPlayerDirs`) — 두 쪽이 같은 회전이라 따로 안 어긋난다. 그래서 `Rz(−angle · k)`를 시작 자세에
 * 곱하고, 끝 자세와의 **나머지**(보는 쪽을 자료의 `finalFacingDir`로 맞춘 몫, 판 위 축 둘레)를 `k`로 이어
 * 붙인다. `k = 0`은 시작, `k = 1`은 끝 자세와 정확히 같다.
 *
 * ⚠️ **부호가 뒤집힌다.** 자료의 각은 DS의 회전 방향이라 우리 오른손 Z축과 반대다 — 바닥 → 서쪽 벽은 +90인데
 * 우리 위쪽(+y)이 +x(서쪽 벽의 위)로 가려면 −90이어야 한다. 여덟 쌍 전부 같은 쪽으로 어긋나므로 한 번만 뒤집는다
 * (`distortionTurn.test`가 판 기저 표와 맞대어 본다)
 *
 * `withHeading`이 거짓이면 로컬 yaw 0으로 만든다 — 카메라 기울기다
 */
export function turnQuaternion(turn: PoseTurn, withHeading: boolean, out: Quaternion): Quaternion {
  const from: DistortionFrame = { kind: turn.fromKind, lock: 0, lockAxis: 'y' }
  const to: DistortionFrame = { kind: turn.toKind, lock: 0, lockAxis: 'y' }
  surfaceQuaternion(from, withHeading ? turn.fromHeading : 0, turnFrom)
  surfaceQuaternion(to, withHeading ? turn.toHeading : 0, turnTo)
  const k = Math.min(1, Math.max(0, turn.k))
  turnRoll.setFromAxisAngle(Z_AXIS, -turn.angle * RAD * k)
  turnEnd.setFromAxisAngle(Z_AXIS, -turn.angle * RAD).multiply(turnFrom)
  turnResidual.copy(turnEnd).invert().multiply(turnTo)
  turnPart.identity().slerp(turnResidual, k)
  return out.copy(turnRoll).multiply(turnFrom).multiply(turnPart)
}

/**
 * 맵 물체 그림을 눕히는 각 (라디안, 세계 Z축 둘레).
 *
 * 자료의 각(`playerSpriteRotAngle` · `rotationAngle`)은 DS의 회전 방향이라 우리 오른손 Z축과 **부호가
 * 반대다** (`turnQuaternion`). 서쪽 벽(+90) 위에 선 사람의 위쪽은 +x가 된다 — 판 기저 표의 `up`과 같다.
 * 방향(`yaw`)을 돌린 **뒤에** 곱한다 (`Rz · Ry`) — 그림을 먼저 세우고 눕히는 순서다
 */
export function spriteRollRadians(angleDegrees: number): number {
  return -angleDegrees * RAD
}
