// 추적 카메라 (PLAN §6.2 필드 프리셋) — 3인칭과 1인칭.
//
// **조작이 갈린다.** 3인칭은 원작 그대로다: 카메라가 북쪽에 고정이고 방향키가
// 월드 축을 가리킨다. 1인칭은 마우스가 시선을 돌리고 그 시선이 이동의 기준이 된다
// (`input/mouse`, `actor/player`).
//
// 처음에는 1인칭도 월드 축으로 뒀었다. 격자와 어긋나 문을 못 들어갈까 봐였는데,
// 이동이 격자 고정이 아니라 연속이고 충돌을 축별로 보기 때문에 근거 없는 걱정이었다.
// 서쪽을 보면서 W를 눌렀는데 옆으로 걷는 쪽이 훨씬 나쁘다.
//
// 두 시점 다 크리티컬 댐프드로 따라간다. 즉시 붙이면 계단에서 화면이 튄다.
import { Quaternion, Vector3 } from 'three'
import { worldState } from '../../state/worldState'
import { distortionBridge } from '../world/distortion'
import { surfaceQuaternion } from './distortionSurface'

/** 카메라 각을 도는 축 둘. 판 좌표라 기울이기 **전에** 돌린다 */
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)
const DEG = Math.PI / 180

const THIRD = { distance: 8, height: 4, damping: 5 }

/** 필드 화각(도). `Stage`의 카메라도 이 값으로 선다 */
export const FIELD_FOV = 55

/**
 * **깨어진 세계의 렌즈** (`ov9_02249960`의 `DISTORTION_WORLD_CAMERA_BASE_*`).
 *
 * `BASE_DISTANCE 0x29AEC1` = 666.92units ÷ 16 = **41.683칸**,
 * `baseAngle.x -10750` = **−59.0515도**, `BASE_FOVY 1473` = **8.0914도**.
 * 피치와 거리를 풀면 뒤로 21.436칸 · 위로 35.748칸이다.
 *
 * ⚠️ 이 값은 깨어진 세계 전용이 아니라 **원작 필드의 기본 카메라**다
 * (`field_camera.c`의 `CAMERA_TYPE_DEFAULT`가 같은 셋을 쓴다). 우리는 온 신오를
 * 8칸·55도로 보기로 했고 그건 그대로 둔다 — 여기만 원작 렌즈로 돌리는 이유는
 * **이 세계가 허공에 뜬 널판으로 지어졌기** 때문이다. 8칸·55도로 보면 널판이
 * 부채처럼 벌어져 무엇이 어디 붙었는지가 안 읽힌다. 화면으로도 그렇게 나왔다:
 * B4F 천장에서 검은 칸이 **76.8% → 34.9%**로 떨어진다.
 *
 * 세로로 보이는 칸은 5.90(원작) 대 8.33(우리)이라 오히려 인물이 커진다 —
 * 멀어지는 것이 아니라 **좁고 멀리서** 보는 것이다
 */
const DISTORTION_THIRD = { distance: 21.436, height: 35.748, damping: 5 }
const DISTORTION_FOV = 8.0914

/**
 * 1인칭 눈높이(미터).
 *
 * 모델을 1.5m로 정규화해 두었고(`PlayerModel.PLAYER_HEIGHT`) 눈은 정수리에서
 * 한 뼘쯤 아래다. 머리 위에서 내려다보면 문틀이 눈에 안 들어온다
 */
const EYE_HEIGHT = 1.38
/** 눈이 앞으로 나온 만큼. 0이면 제 뒤통수 안쪽에서 보게 된다 */
const EYE_FORWARD = 0.12
/** 1인칭이 더 빨리 붙는다 — 시선이 곧 머리라 늦게 따라오면 멀미가 난다 */
const FIRST_DAMPING = 12
/** 시선이 닿는 거리. 목표점을 너무 가까이 두면 고개가 파르르 떨린다 */
const LOOK_AHEAD = 6

const goal = new Vector3()
const look = new Vector3()
const free = new Vector3()
const offset = new Vector3()
const view = new Vector3()

/**
 * 중력이 도는 데 걸리는 시간(초). 원작의 `movementAnimSteps` 16프레임이다 —
 * 벽으로 건너뛰는 동안 주인공이 그만큼에 걸쳐 돌고(`RotateMapObject`),
 * 판은 다 건너간 뒤에 갈린다 (`JumpOnFloatingPlatform`)
 */
const FLIP_TIME = 16 / 60

/**
 * 지금 화면이 쓰는 **기울기**.
 *
 * ⚠️ **판이 갈리는 프레임에 그대로 옮기면 화면이 뚝 끊긴다.** 벽으로 건너뛰면
 * 위쪽 방향이 한 프레임에 90도(천장이면 180도) 돌아 버린다. 그래서 목표
 * 자세를 쿼터니언으로 만들고 **돌려서** 따라간다 — 벡터를 그냥 섞으면
 * 180도에서 길이가 0이 되어 화면이 뒤집히는 순간 방향을 잃는다
 */
const tilt = new Quaternion()
const tiltGoal = new Quaternion()
let tiltReady = false
/** 화각도 첫 프레임에는 앉힌다 — 안 그러면 맵을 열 때마다 렌즈가 빨려 들어간다 */
let fovReady = false

export const cameraSystem = {
  /**
   * 지금 화면의 **화각(도)**. `EngineDriver`가 렌더 직전에 읽는다.
   *
   * 자리와 같이 **따라간다** — 깨어진 세계에 들어서는 순간 55도에서 8도로
   * 뚝 끊기면 화면이 확 빨려 들어간다. 맵이 갈릴 때는 `snap`이 그냥 앉힌다
   */
  fov: FIELD_FOV,

  /**
   * 스크립트가 카메라를 주인공에게서 떼어 놓은 자리 (`AddFreeCamera`).
   *
   * 원작은 안 보이는 객체를 하나 세우고 `Camera_TrackTarget`을 그쪽으로 옮긴다.
   * 우리는 따라갈 점만 갈아 끼운다 — 세울 객체가 없으니 그편이 짧다.
   * `RestoreCamera`가 null로 되돌린다.
   *
   * ⚠️ **1인칭에는 안 먹인다.** 1인칭 눈은 주인공 머리에 붙어 있고 시선을
   * 마우스가 정하는데, 그 눈을 딴 데로 옮기면 컷신 동안 제 몸이 안 보이는
   * 자리에서 마우스만 도는 상태가 된다. 컷신은 3인칭 것이다
   */
  free: null as { x: number, z: number } | null,

  /**
   * 다음 프레임의 기울기를 **돌리지 말고 그대로** 잡는다.
   *
   * 맵이 바뀔 때 부른다 — 벽에 붙어 있다가 밖으로 나가면 새 맵 첫 화면이
   * 90도를 굴러서 자리를 잡는다. 같은 세계 안에서 층만 갈리는 것은 기울기가
   * 안 바뀌므로 이것을 불러도 아무 일도 안 일어난다
   */
  snap() {
    tiltReady = false
    fovReady = false
  },

  update(delta: number) {
    const cam = worldState.camera
    const at = cameraSystem.free
    const p = at === null || cam.mode === 'first'
      ? worldState.player.position
      : free.set(at.x, worldState.player.position.y, at.z)
    const first = cam.mode === 'first'
    const frame = distortionBridge.frame?.() ?? null
    // 1인칭은 눈이 사람 머리에 붙어 있다 — 8도로 보면 코앞만 보인다
    const inDistortion = !first && distortionBridge.inWorld?.() === true

    // 목표 기울기로 **돌려서** 간다. 90도에 16프레임이라 천장(180도)은 그 두 배다
    surfaceQuaternion(frame, 0, tiltGoal)
    if (!tiltReady) { tilt.copy(tiltGoal); tiltReady = true }
    tilt.rotateTowards(tiltGoal, (Math.PI / 2) * (delta / FLIP_TIME))
    const tilted = (x: number, y: number, z: number, out: Vector3): Vector3 =>
      out.set(x, y, z).applyQuaternion(tilt)

    if (first) {
      // 시선은 마우스가 정한다. yaw 0이 북쪽(−Z)이고 오른쪽으로 돌면 커진다
      const flat = Math.cos(cam.pitch)
      const fx = Math.sin(cam.yaw) * flat
      const fz = -Math.cos(cam.yaw) * flat
      const fy = Math.sin(cam.pitch)
      // 눈은 수평으로만 앞으로 내민다. 위아래까지 따라가면 고개를 들 때 눈이
      // 뒤통수 밖으로 나가 제 모자가 화면에 걸린다
      tilted(
        Math.sin(cam.yaw) * EYE_FORWARD, EYE_HEIGHT,
        -Math.cos(cam.yaw) * EYE_FORWARD, offset,
      )
      goal.copy(p).add(offset)
      tilted(fx, fy, fz, view).multiplyScalar(LOOK_AHEAD)
      look.copy(goal).add(view)
    } else {
      // 깨어진 세계는 **렌즈부터 갈아 낀다** (`DISTORTION_THIRD`). 그 위에
      // 카메라가 홱 도는 자리 스물여섯 곳이 각을 더한다 (PARITY §6.10) —
      // 원작도 `baseAngle`에 구역 각을 더하는 꼴이라 밑각이 맞아야 이것도 맞는다
      const lens = inDistortion ? DISTORTION_THIRD : THIRD
      const swing = distortionBridge.cameraSwing?.() ?? null
      if (swing === null || (swing.x === 0 && swing.y === 0)) {
        tilted(0, lens.height, lens.distance, offset)
      } else {
        offset.set(0, lens.height, lens.distance)
          .applyAxisAngle(X_AXIS, swing.x * DEG)
          .applyAxisAngle(Y_AXIS, swing.y * DEG)
          .applyQuaternion(tilt)
      }
      goal.copy(p).add(offset)
      look.copy(p)
    }
    tilted(0, 1, 0, cam.up)

    const t = 1 - Math.exp(-(first ? FIRST_DAMPING : THIRD.damping) * delta)
    cam.position.lerp(goal, t)
    cam.target.lerp(look, t)

    const wantFov = inDistortion ? DISTORTION_FOV : FIELD_FOV
    if (!fovReady) { cameraSystem.fov = wantFov; fovReady = true }
    cameraSystem.fov += (wantFov - cameraSystem.fov) * t
  },
}
