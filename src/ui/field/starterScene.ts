// 파트너 고르는 장면의 3D 배치 (`choose_starter/choose_starter_app.c`).
//
// **자리도 각도도 우리가 안 정한다.** 원작 소스가 숫자로 다 적어 놓았다:
// `MakeSelectionMatrices`가 볼 셋의 자리를, `Make3DGraphics`가 바닥판을,
// `SetupCamera`와 `StartCameraMovement`가 카메라를 준다.
//
// ⚠️ **fovY 22°는 반각이다.** NitroSDK `G3_Perspective`가 `cot = cos/sin`을
// 세로 배율로 그대로 쓰므로 22°가 화면 절반에 해당한다 — three의
// `PerspectiveCamera.fov`는 전각이라 44를 넣어야 한다. 짐작이 아니라 잰 것이다:
// 원작이 커서를 놓는 화면 좌표 `otherSelectionMatrix`의 x가 78 · 130 · 172인데,
// 반각으로 풀면 77.2 · 128.0 · 171.1이 나오고 전각으로 풀면 22 · 128 · 218이다
// (`starterScene.test`가 이 셋을 다시 잰다).
//
// ⚠️ three를 안 부른다 — UI 청크에 three가 실리면 초기 예산이 깨진다(PLAN §15).
// 숫자만 돌려주고 벡터로 만드는 것은 무대(`scene/field/StarterStage`) 몫이다

/** NARC 칸 번호 그대로 (`Make3DGraphics`) */
export const STARTER_MODEL = {
  /** 덮인 서류가방. 애니 `psel_all`이 이걸 연다 */
  caseClosed: 1,
  /** 열린 서류가방 */
  caseOpen: 8,
  /** 몬스터볼 셋. 왼쪽·가운데·오른쪽 순서다 */
  balls: [3, 5, 7],
  /** 바닥에 깔리는 판 */
  ground: 9,
} as const

/** `MakeSelectionMatrices` — 볼 셋의 자리 */
export const BALL_POSITION: readonly (readonly [number, number, number])[] = [
  [-44, -4, 32], [0, -4, 62], [38, -4, 26],
]

/** `Make3DGraphics` 끝의 세 줄. 바닥판만 자리·크기·각도를 따로 받는다 */
export const GROUND_PLACE = {
  position: [0, -28, 40] as const,
  scale: [3.5, 1, 3.5] as const,
  /** `(180 * 0xffff) / 360` — y축으로 반 바퀴 */
  rotationY: Math.PI,
}

export interface CameraShot {
  /** 내려다보는 각(도). 원작 `angle.x`가 음수라 여기서 부호를 뒤집어 둔다 */
  pitch: number
  distance: number
  target: readonly [number, number, number]
}

/** `SetupCamera` — 가방이 열릴 때까지 */
export const CAMERA_OPEN: CameraShot = { pitch: 30, distance: 300, target: [0, 0, 0] }

/** `StartCameraMovement`가 6프레임에 걸쳐 옮겨 가는 자리 — 고르는 동안 */
export const CAMERA_CHOOSE: CameraShot = { pitch: 50, distance: 200, target: [0, 0, 36] }

/** 카메라가 옮겨 가는 데 걸리는 프레임 (`SetupStarterMovement(..., 6)`) */
export const CAMERA_FRAMES = 6

/** 세로 화각의 **반각**(도). `Camera_InitWithTarget(..., (22 * 0xffff) / 360, ...)` */
export const FOV_HALF = 22

/** 원작 화면 크기. 화각을 확인할 때 쓴다 */
export const SCREEN = { width: 256, height: 192 } as const

/**
 * `otherSelectionMatrix` — 커서 스프라이트를 놓는 화면 좌표.
 *
 * 그리는 데는 안 쓴다(우리는 커서도 3D 자리에 붙인다). **화각과 카메라가 맞는지
 * 재는 잣대**다 — 이 셋을 맞히는 조합은 하나뿐이라 자유 변수가 없다
 */
export const CURSOR_SCREEN: readonly (readonly [number, number])[] = [
  [78, 55], [130, 82], [172, 50],
]

/**
 * 가방이 열리는 데 걸리는 프레임 (`psel_all`).
 *
 * ⚠️ 곡선은 아직 안 굽는다 — 지금은 이 시간만큼 덮인 모델을 두었다가 열린
 * 모델로 갈아 끼운다. 길이는 JNT0 헤더에서 읽어 `starter/index.json`에 적어 둔다
 */
export const OPEN_FRAMES = 41

/** 원작 프레임(초당 60) */
export const FRAME_MS = 1000 / 60

/** `CHOICE_STEP_BLEND_BGS`가 잡아 두는 대기 (`delayFrameCount = 36`) */
export const BAG_NOISE_DELAY = 36

/** 카메라가 멈춘 뒤 커서를 놓기까지 (`delayFrameCount = 6`) */
export const CURSOR_DELAY = 6

/**
 * 그 각도·거리에서 카메라가 서는 자리.
 *
 * `camera.c`가 그대로 이렇게 푼다 (yaw는 늘 0이다):
 *
 *   x = sin(yaw)·D·cos(pitch) · z = cos(yaw)·D·cos(pitch) · y = sin(−angle.x)·D
 */
export function cameraPosition(shot: CameraShot): [number, number, number] {
  const p = (shot.pitch * Math.PI) / 180
  return [
    shot.target[0],
    shot.target[1] + Math.sin(p) * shot.distance,
    shot.target[2] + Math.cos(p) * shot.distance,
  ]
}

/**
 * 그 점이 원작 화면 어디에 찍히는가. **확인용이다** — 렌더는 three가 한다.
 *
 * 카메라는 yaw 0이라 오른쪽이 +X고 위가 `(0, cos, −sin)`이다
 */
export function projectToScreen(
  point: readonly [number, number, number], shot: CameraShot, halfFov = FOV_HALF,
): [number, number] {
  const [ex, ey, ez] = cameraPosition(shot)
  const p = (shot.pitch * Math.PI) / 180
  // 시선은 −pitch만큼 내려다본다
  const fx = 0, fy = -Math.sin(p), fz = -Math.cos(p)
  const ux = 0, uy = Math.cos(p), uz = -Math.sin(p)
  const vx = point[0] - ex, vy = point[1] - ey, vz = point[2] - ez
  const depth = vx * fx + vy * fy + vz * fz
  const right = vx
  const up = vx * ux + vy * uy + vz * uz
  const half = Math.tan((halfFov * Math.PI) / 180)
  const scale = SCREEN.height / 2 / half
  return [
    SCREEN.width / 2 + (right / depth) * scale,
    SCREEN.height / 2 - (up / depth) * scale,
  ]
}
