// 깨어진 세계 — 카메라가 도는 각 (PARITY §6.10)
//
// 세이브에 적는 것은 **목표**고(`SetPersistedCameraAngles`) 화면이 쓰는 것은
// 도는 도중의 값이다. 도는 규칙은 `engine/world/distortionCamera`가 든다.
import { cameraAt } from '../engine/world/distortion'
import {
  cameraDegrees, cameraTurnAngles, cameraTurnDone, type CameraTurn,
} from '../engine/world/distortionCamera'
import { distortionFloor, setState, state } from './distortionCore'

/**
 * 카메라가 도는 중이다 (`DistWorldCameraTransition`).
 *
 * 세이브에 적는 것은 **목표**고(`SetPersistedCameraAngles`) 화면이 쓰는 것은
 * 도는 도중의 값이다. 층을 다시 들어오면 도중이 없이 목표에서 시작한다
 */
let camTurn: { turn: CameraTurn, frame: number } | null = null

let camAngles: [number, number, number] = [0, 0, 0]

export function applyCamera(wx: number, wy: number, wz: number, dir: number): void {
  const floor = distortionFloor()
  if (floor === null) return
  const found = cameraAt(floor.cameras, wx, wy, wz, dir)
  if (found === null) return
  const s = state()
  const to = [found.angleX, found.angleY, found.angleZ] as const
  if (s.cameraAngleX === to[0] && s.cameraAngleY === to[1] && s.cameraAngleZ === to[2]) return
  camTurn = {
    turn: { from: [s.cameraAngleX, s.cameraAngleY, s.cameraAngleZ], to, steps: found.steps },
    frame: 0,
  }
  setState({ cameraAngleX: to[0], cameraAngleY: to[1], cameraAngleZ: to[2] })
}

/** 지금 카메라가 밑각에서 얼마나 돌아 있는가 (**도**). 카메라가 읽는다 */
export function distortionCameraSwing(): { x: number, y: number, z: number } | null {
  const floor = distortionFloor()
  if (floor === null) return null
  const [x, y, z] = camAngles
  return { x, y, z }
}

/** 층을 들어설 때 도중 없이 목표에 앉힌다 (`CameraInit`의 `IsPersistedDataValid`) */
export function seatCamera(): void {
  const s = state()
  camTurn = null
  camAngles = [
    cameraDegrees(s.cameraAngleX), cameraDegrees(s.cameraAngleY), cameraDegrees(s.cameraAngleZ),
  ]
}

/** 한 프레임 (`CameraTransitionTask`). 60프레임/초로 센다 */
export function distortionCameraTick(dt: number): void {
  if (camTurn === null) return
  camTurn.frame += dt * 60
  camAngles = cameraTurnAngles(camTurn.turn, camTurn.frame)
  if (cameraTurnDone(camTurn.turn, camTurn.frame)) camTurn = null
}

/** 카메라 각을 0으로 (`DistWorld_ResetPersistedCameraAngles`) */
export function distortionResetCamera(): void {
  setState({ cameraAngleX: 0, cameraAngleY: 0, cameraAngleZ: 0 })
}
