// 깨어진 세계 — 카메라가 도는 각 (PARITY §6.10)
//
// 세이브에 적는 것은 **목표**고(`SetPersistedCameraAngles`) 화면이 쓰는 것은
// 도는 도중의 값이다. 도는 규칙은 `engine/world/distortionCamera`가 든다.
import { cameraAt } from '../engine/world/distortion'
import {
  CAMERA_UNIT, cameraDegrees, cameraTurnAngles, cameraTurnDone, type CameraTurn,
} from '../engine/world/distortionCamera'
import { distortionFloor, setState, state } from './distortionCore'

/**
 * 카메라가 도는 중이다 (`DistWorldCameraTransition`).
 *
 * 세이브에 적는 것은 **목표**고(`SetPersistedCameraAngles`) 화면이 쓰는 것은
 * 도는 도중의 값이다. 세계가 다시 서면(워프·이어하기) 도중이 없이 목표에서 시작한다.
 * ⚠️ **층 갈이에서는 이어 돈다** — 원작의 카메라 관리자는 층을 갈아 실어도 그대로라서
 * (`CameraTransitionTask`는 `SysTask`다) 폭포를 타고 내려가며 켠 각이 새 층에서 마저 돈다
 */
let camTurn: { turn: CameraTurn, frame: number } | null = null

let camAngles: [number, number, number] = [0, 0, 0]

export function applyCamera(wx: number, wy: number, wz: number, dir: number): void {
  const floor = distortionFloor()
  if (floor === null) return
  const found = cameraAt(floor.cameras, wx, wy, wz, dir)
  if (found === null) return
  turnCamera([found.angleX, found.angleY, found.angleZ], found.steps)
}

/**
 * 카메라를 그 각으로 돌린다 (`DoCameraTransition`, `ov9_02249960.c:2150-2183`).
 *
 * 세이브에는 목표를 적고(`SetPersistedCameraAngles`), 도는 것은 **지금 보이는 각에서** 시작한다 —
 * 원작이 `transition->currentAngle = cameraMan->currentAngle`로 잡는다. 목표로 시작하면 도는 도중에
 * 다른 각이 걸릴 때 화면이 한 번 튄다. 지금 각이 이미 목표면 안 돈다.
 *
 * 구역 카메라(`applyCamera`)·폭포(`distortionCascade`)·기라티나 방 발판(`distortionGiratina`)이 부른다
 *
 * @param to 목표 각 (눈금 — `CAMERA_UNIT`도 한 눈금)
 */
export function turnCamera(to: readonly [number, number, number], steps: number): void {
  setState({ cameraAngleX: to[0], cameraAngleY: to[1], cameraAngleZ: to[2] })
  const target = [cameraDegrees(to[0]), cameraDegrees(to[1]), cameraDegrees(to[2])]
  if (target.every((v, i) => Math.abs(v - (camAngles[i] ?? 0)) < 1e-6)) {
    camTurn = null
    return
  }
  const from = camAngles.map((deg) => deg / CAMERA_UNIT) as [number, number, number]
  camTurn = { turn: { from, to, steps }, frame: 0 }
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
