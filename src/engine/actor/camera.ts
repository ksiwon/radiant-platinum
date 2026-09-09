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
import { mapById, world as mapWorld } from '../map/world'
import { distortionBridge } from '../world/distortion'
import { surfaceQuaternion } from './distortionSurface'
import { cutInFrame } from '../battle/encounterCutIn'

/** 카메라 각을 도는 축 둘. 판 좌표라 기울이기 **전에** 돌린다 */
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)
const DEG = Math.PI / 180

const THIRD = { distance: 8, height: 4, damping: 5 }

/**
 * **원작 필드 카메라의 내림각**(도) — 갈래 열일곱 (`overlay005/field_camera.c`).
 *
 * 맵 표의 `camera` 칸이 이 표를 가리킨다 (`MapHeader.camera`). 원작은 갈래마다
 * 거리·화각·투영까지 다르지만 **우리는 각만 따라간다** — 97칸 정사영이나
 * 8도 망원은 우리 55도 원근과 안 섞이고, 온 신오를 8칸·55도로 보기로 한
 * 결정과도 어긋난다.
 *
 * 각을 따라가는 까닭은 **실내에서 그것이 무엇을 보여 줄지를 정하기** 때문이다.
 * 우리 기본값 26.57도(8칸·4칸)로 방을 보면 천장 없는 벽 위 허공이 화면에
 * 든다 — 원작은 50~68도로 내려다봐서 그 허공을 안 본다.
 */
const FIELD_CAMERA_PITCH: readonly number[] = [
  59.051513671875, // 0  기본
  68.367919921875, // 1  들판 체육관
  54.656982421875, // 2  당겨 본다
  59.051513671875, // 3  강철 체육관
  50.086669921875, // 4  실내 (정사영) — 맵 300개가 이것이다
  59.0460205078125, // 5  창단의 기둥
  73.1085205078125, // 6  천관산 밖 남쪽
  59.0460205078125, // 7  천관산 밖 북쪽
  70.4718017578125, // 8  스타크산 둘째 방
  40.5889892578125, // 9  검은겨울 체육관
  60.8038330078125, // 10 장막 체육관
  57.8155517578125, // 11 조금 물러선다
  63.2647705078125, // 12 굴
  47.7960205078125, // 13 강철섬 굴
  78.37646484375, // 14 시작의 언덕
  54.656982421875, // 15 예지호수
  59.051513671875, // 16 안 쓰는 갈래
]

/**
 * 3인칭이 주인공에게서 떨어진 거리 (타일). 렌즈를 돌려도 이 값은 안 바뀐다.
 *
 * 예전 실내 렌즈(거리 5.5 · 높이 3.2)의 빗변이다 — 각만 갈아 끼우려면
 * 기준 길이가 하나 있어야 하고, 그 값이 이미 화면에서 쓰이던 것이다
 */
const INDOOR_SLANT = 6.3632

/**
 * **방에 쓸 렌즈** — 원작이 그 맵에 쓰는 내림각에 우리 빗변을 건다.
 * 방이 아니면 `null`.
 *
 * ⚠️ **`mapType`만 보면 안 된다.** 구저택(맵 296)은 `mapType` 3(굴)인데
 * `camera` 4(실내)다 — 원작 자신이 방으로 다룬다. 반대로 검은겨울 체육관은
 * `mapType` 4인데 `camera` 9라 40.59도다. **둘 중 하나라도 방이면** 방으로
 * 보고, 각은 언제나 `camera` 칸이 준다.
 *
 * 실측 (`node .audit/probe/roomFit.mjs`): 이 규칙이 닿는 맵이 357개다 —
 * 둘 다인 맵 277 · `mapType`만 57 · `camera`만 23.
 *
 * ⚠️ **1인칭은 안 건드린다.** 눈이 방 안에 있으므로 이 문제가 없다.
 */
const MAP_TYPE_INDOOR = 4
const MAP_TYPE_POKEMON_CENTER = 5
const CAMERA_INTERIOR = 4
function roomLens(): { distance: number, height: number, damping: number } | null {
  const header = mapById(mapWorld.mapId)
  if (header === null) return null
  const room = header.mapType === MAP_TYPE_INDOOR || header.mapType === MAP_TYPE_POKEMON_CENTER
    || header.camera === CAMERA_INTERIOR
  if (!room) return null
  const deg = FIELD_CAMERA_PITCH[header.camera] ?? FIELD_CAMERA_PITCH[CAMERA_INTERIOR]!
  const rad = (deg * Math.PI) / 180
  return { distance: INDOOR_SLANT * Math.cos(rad), height: INDOOR_SLANT * Math.sin(rad), damping: 5 }
}

/** 방의 테두리 (월드 타일). 씬이 그려진 바닥에서 재어 넘겨 준다 */
export interface RoomBox {
  minX: number, minZ: number, maxX: number, maxZ: number
  /** 세로줄마다 바닥이 남쪽으로 끝나는 자리 (`scene/roomWalls`의 `floorRegions`) */
  southEdge: ReadonlyMap<number, number>
}

/**
 * 카메라 밑에서 **바닥이 끝나는 자리**. 옆줄까지 보아 제일 가까운 끝을 쓴다.
 *
 * ⚠️ **상자의 `maxZ` 하나로는 못 잰다.** 포켓몬센터(맵 420)는 문간이 남쪽으로
 * 한 칸 파여 있어 상자가 z 14인데 나머지 줄은 z 13에서 끝난다 — 그 한 칸이
 * 화면 아래 12%를 검게 남겼다.
 *
 * ⚠️ **주인공 줄 하나로도 못 잰다.** 문 앞에 선 주인공이 밟고 선 것이 바로 그
 * 파인 문간이라, 제 줄만 보면 상자와 같은 답이 나온다.
 *
 * 프레임 아랫변에 드는 폭만큼 본다: 그 자리 바닥이 카메라에서 5.53칸이고
 * (높이 4.881 · 앞으로 2.588), 960×640에서 가로 반각이 37.98도이므로
 * **4.31칸**이다 (`atan(1.5 × tan27.5°)`)
 */
const EDGE_SPREAD = 4
function floorEnd(box: RoomBox, x: number): number {
  let near = Infinity
  const at = Math.floor(x)
  for (let c = at - EDGE_SPREAD; c <= at + EDGE_SPREAD; c++) {
    const z = box.southEdge.get(c)
    if (z !== undefined && z < near) near = z
  }
  return near === Infinity ? box.maxZ : near
}

/** 화면 세로 절반(도). `FIELD_FOV`가 세로 화각이다 (three의 `PerspectiveCamera.fov`) */
const HALF_FOV = 27.5

/**
 * 겨눔을 낮춰 **주인공을 화면 아래로 내릴 수 있는 한계**(도).
 *
 * 대사창 윗변이 화면의 **81.25%**다 (960×640에서 y 520). 발밑이 그보다 내려가면
 * 주인공이 대사창에 잘리므로 거기까지만 내린다. 화면 세로 절반이 27.5도이므로
 * (0.8125 − 0.5) × 55 = **17.19도**
 */
const AIM_DROP = 17.19

/**
 * 겨눔을 아무리 낮춰도 이보다 눕히지 않는다(도). 0에 가까우면 겨눔점이
 * 무한히 멀어져 `lerp`가 화면을 홱 돌린다
 */
const MIN_AIM = 6

/**
 * **바닥 끝을 프레임 밖으로 밀어내는 내림각**(도).
 *
 * 실내 3인칭은 주인공 뒤 5.5칸·위 3.2칸에서 본다. 그런데 **건물에 들어서면
 * 주인공은 늘 앞벽에 붙어 선다** — 실측으로 스무 곳 전부 방의 남쪽 끝이고
 * 뒤에 남은 바닥이 1.5칸뿐이다 (`node .audit/probe/roomFit.mjs`). 카메라가 갈 5.5칸
 * 뒤는 그려진 바닥 밖이라 **화면 아래 33%가 통째로 검다.**
 *
 * 예전에는 카메라를 방 상자 안으로 **물렸다**. 그러면 검은 자리는 사라지지만
 * 붐이 0.5칸으로 줄어 **내려보는 각이 81.1도**가 된다 — 스무 곳 전부 정수리만
 * 보였다. 물리는 쪽으로는 답이 없다: 1.5칸 뒤에서 1.5칸 키를 담으려면 화각이
 * 54도를 넘게 든다.
 *
 * 그래서 **자리는 그대로 두고 겨눈 곳을 앞으로 민다.** 화면이 위로 밀려
 * 바닥 끝이 프레임 아래로 빠지고, 주인공은 가운데가 아니라 아래쪽에 선다 —
 * 원작 DS도 맵 가장자리에서는 주인공이 가운데가 아니다.
 *
 * @param height   카메라가 주인공보다 높은 만큼 (타일)
 * @param arm      카메라에서 주인공까지의 가로 거리 (타일)
 * @param overhang 카메라가 그려진 바닥 끝을 넘어선 거리. 0 이하면 바닥 위다
 */
export function aimPitch(height: number, arm: number, overhang: number): number {
  const want = (Math.atan2(height, arm) * 180) / Math.PI
  if (overhang <= 0) return want
  // 프레임 아랫변이 바닥 끝**보다 앞**에 떨어지게 하는 내림각
  const edge = (Math.atan2(height, overhang) * 180) / Math.PI - HALF_FOV
  return Math.min(want, Math.max(edge, want - AIM_DROP, MIN_AIM))
}

/**
 * 카메라가 굴 조각 안에서 물러설 수 있는 여유(타일).
 *
 * 0으로 두면 조각의 맨 끝 칸에 서므로 그 칸 너머 반 칸이 화면 아래에 걸린다
 */
const ROOM_MARGIN = 1

/**
 * 목표 자리를 조각 안으로 **물린다** — **굴에서만 쓴다.**
 *
 * 방(`mapType` 4·5)에서는 이렇게 물리면 붐이 0.5칸으로 줄어 정수리만 보인다
 * (`aimPitch` 머리말). 그런데 굴에서는 이쪽이 낫다: 어긋난 동굴(맵 209)에서
 * 안 물리면 화면의 **89.3%**가 검고 물리면 **41.6%**다. 굴은 방 렌즈를 안 걸어
 * 여덟 칸 뒤에서 보는데, 그 여덟 칸 뒤가 통로 밖 허공이기 때문이다.
 *
 * ⚠️ **주인공이 화면 가운데에서 벗어난다. 그것이 맞다** — 원작도 맵 경계에서는
 * 주인공이 가운데가 아니다 (`field_camera.c`가 같은 일을 한다).
 *
 * ⚠️ **조각이 여유의 두 배보다 좁으면 가운데에 놓는다.** 안 그러면 양쪽에서
 * 물려 카메라가 상자 밖으로 튕겨 나간다
 */
export function clampToRoom(goal: Vector3, box: RoomBox | null, margin: number): Vector3 {
  if (box === null) return goal
  const span = (lo: number, hi: number, v: number): number => {
    const a = lo + margin, b = hi - margin
    return a > b ? (lo + hi) / 2 : Math.min(b, Math.max(a, v))
  }
  goal.x = span(box.minX, box.maxX, goal.x)
  goal.z = span(box.minZ, box.maxZ, goal.z)
  return goal
}

/**
 * 주인공이 선 자리를 조금이라도 벗어나 있으면 물리지 않는다 (타일).
 *
 * 주인공이 그려진 바닥이 없는 칸에 설 수가 있다 — 소품 위·계단, 그리고 굴처럼
 * 바닥이 조각조각인 데다. 그런 자리에서 **멀리 있는 방**을 집으면 카메라가
 * 주인공을 두고 그리로 끌려간다: 실측으로 강철섬(맵 293)에서 주인공이 x 38.5에
 * 섰는데 x 43~53짜리 조각이 뽑혀 카메라가 x 44로 밀렸다. 두 칸까지만 봐준다
 */
const ROOM_REACH = 2

/**
 * 그 자리가 든 방. 어디에도 안 들면 두 칸 안의 제일 가까운 방, 그것도 없으면
 * `null`(안 물린다).
 *
 * ⚠️ **드는 방이 여럿이면 제일 작은 것이다.** 상자끼리 겹친다 — 맵 89에서 방
 * 밖 바닥이 방을 **빙 둘러** 있어서 그 테두리 상자가 방을 통째로 품는다. 먼저
 * 찾은 것을 집으면 25×19가 뽑혀 조인 것이 아무 소용이 없다 (실측: 10×10)
 */
export function roomAt(rooms: readonly RoomBox[], x: number, z: number): RoomBox | null {
  let best: RoomBox | null = null
  let near = ROOM_REACH * ROOM_REACH
  let small = Infinity
  for (const r of rooms) {
    const dx = Math.max(r.minX - x, 0, x - r.maxX)
    const dz = Math.max(r.minZ - z, 0, z - r.maxZ)
    const d = dx * dx + dz * dz
    if (d === 0) {
      const size = (r.maxX - r.minX) * (r.maxZ - r.minZ)
      if (size < small) { small = size; best = r }
      near = 0
      continue
    }
    if (near > 0 && d < near) { near = d; best = r }
  }
  return best
}

/**
 * ⚠️ **굴에는 방 렌즈를 안 건다.** `!isOutdoors`는 동굴(3)과 지하(6)까지
 * 「실외가 아님」에 넣는데 그 둘은 방이 아니라 넓은 굴이다 — 강철섬에 방 렌즈를
 * 물리면 검은 화소가 **71.6% → 93.1%로 늘었다** (`node .audit/probe/voidShots.mjs`).
 * 그래서 `roomLens`는 `mapType` 4·5나 `camera` 4만 방으로 본다.
 *
 * ⚠️ **깨어진 세계도 아니다.** 그쪽은 제 렌즈가 따로 있고(원작 필드의 기본
 * 카메라다) 방이 아니라 허공에 뜬 널판이라 잣대가 다르다
 */

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
/**
 * 자리와 시선도 **맵이 갈릴 때는** 앉힌다.
 *
 * ⚠️ **워프는 걸음이 아니다.** 감쇠 보간은 「걸어가는 동안 카메라가 따라온다」를
 * 위한 것인데, 순간이동한 뒤에도 그대로 걸리면 **앞 맵의 시점에서 새 맵으로
 * 미끄러져 들어온다** — 화면에는 방이 위에서 내려오고 나머지가 검다. 실측
 * (2026-09-08 센터 왕복): 그 한복판에서 찍힌 컷이 지형 칸 0/8이었고 그 반 초
 * 뒤가 8/8이었다. 그 사이는 **사용자도 그 화면을 본다.**
 *
 * `snap()`이 끄고 다음 `update`가 한 번 앉힌 뒤 다시 켠다. 걸음 보간과
 * 스크립트·비전기술 카메라는 `snap`을 안 부르므로 그대로다
 */
let placeReady = false

export const cameraSystem = {
  /**
   * 지금 화면의 **화각(도)**. `EngineDriver`가 렌더 직전에 읽는다.
   *
   * 자리와 같이 **따라간다** — 깨어진 세계에 들어서는 순간 55도에서 8도로
   * 뚝 끊기면 화면이 확 빨려 들어간다. 맵이 갈릴 때는 `snap`이 그냥 앉힌다
   */
  fov: FIELD_FOV,

  /**
   * 카메라가 **가려던 자리에서 아직 얼마나 떨어져 있나** (월드 단위).
   *
   * ⚠️ **맵을 갈아 끼운 직후에는 이 값이 크다.** 자리는 감쇠(5)로 따라가므로
   * 새 맵의 첫 프레임은 앞 맵의 시점에서 출발해 1초 남짓 미끄러진다 — 그동안
   * 화면에는 방이 위에서 내려오고 나머지는 검다. 밖에서 그 구간을 「못 그린
   * 화면」과 구별할 길이 없어서, 검사가 그때 찍은 컷을 결함으로 적었다
   * (실측 2026-09-08: 센터 왕복 세 바퀴째에 지형 칸 0/8, 그 0.5초 뒤 8/8).
   *
   * `scene/terrainMark`가 이 값으로 「찍을 만한가」를 가른다. 읽기만 하는
   * 자리다 — 여기 값을 넣어도 카메라는 안 움직인다
   */
  drift: 0,

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
   * 지금 맵의 방들. 씬이 지형을 세울 때마다 넣어 준다 (`scene/ChunkModels`).
   *
   * ⚠️ **하나가 아니라 여럿이다.** 그려진 바닥을 통째로 감싸면 방에서 떨어진
   * 바닥 한 칸이 상자를 부풀린다 — 연고시티 체육관 문 방이 x 1~15인데 상자가
   * x −2~24였다 (REPAIR §13). **이어진 것끼리** 갈라 두고 주인공이 선 덩어리를
   * 그때그때 고른다 (`roomAt`).
   *
   * ⚠️ **실내에서만 찬다.** 실외에서 바닥이 끝나는 자리는 맵 가장자리이고,
   * 거기서 카메라를 물리면 신오 끝에서 화면이 갇힌다 — `roomWalls`를 실외에
   * 안 거는 것과 같은 이유다
   */
  rooms: [] as readonly RoomBox[],

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
    placeReady = false
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
      const room = inDistortion ? null : roomLens()
      const lens = inDistortion ? DISTORTION_THIRD : room ?? THIRD
      const swing = distortionBridge.cameraSwing?.() ?? null
      if (swing === null || (swing.x === 0 && swing.y === 0)) {
        tilted(0, lens.height, lens.distance, offset)
      } else {
        offset.set(0, lens.height, lens.distance)
          .applyAxisAngle(X_AXIS, swing.x * DEG)
          .applyAxisAngle(Y_AXIS, swing.y * DEG)
          .applyQuaternion(tilt)
      }
      // 조우 컷인이 팔을 당긴다 (`Camera_SetDistance`, `battle/encounterCutIn`).
      // 각은 그대로 두고 **길이만** 곱한다 — 원작이 거리 하나만 만진다
      const dolly = cutInFrame.now?.dolly ?? 1
      if (dolly !== 1) offset.multiplyScalar(dolly)
      goal.copy(p).add(offset)
      look.copy(p)
      // **카메라는 안 물린다 — 겨눔점을 앞으로 민다** (`aimPitch`).
      //
      // ⚠️ **방은 카메라가 아니라 주인공으로 고른다.** 카메라로 고르면 방
      // 밖으로 나간 순간 아무 방에도 안 들어 잴 것이 사라진다.
      //
      // ⚠️ **기울어진 세계에서는 안 한다.** 바닥 끝을 z 한 축으로 재는데
      // 깨어진 세계는 벽과 천장이 바닥이라 그 축이 없다
      // ⚠️ **방과 굴은 다루는 법이 다르다.** `cameraSystem.rooms`는 실외가
      // 아닌 맵이면 다 채워지는데(`scene/ChunkModels`의 `indoor`) 굴에서 뽑히는
      // 조각은 방이 아니라 **통로 토막**이라 바닥 끝이 엉터리로 잡힌다 —
      // 어긋난 동굴(맵 209)에서 6×4 조각이 뽑혀 겨눔이 16칸이나 밀렸고 화면의
      // 89.2%가 검었다. 굴에서는 예전처럼 **자리를 물리는** 편이 낫다(41.6%)
      const box = inDistortion ? null : roomAt(cameraSystem.rooms, p.x, p.z)
      if (box !== null && swing === null && room !== null) {
        const height = goal.y - p.y
        const arm = Math.hypot(goal.x - p.x, goal.z - p.z)
        const pitch = aimPitch(height, arm, goal.z - floorEnd(box, p.x))
        look.z = goal.z - height / Math.tan((pitch * Math.PI) / 180)
        look.x = goal.x
      } else if (!inDistortion && room === null) {
        clampToRoom(goal, box, ROOM_MARGIN)
      }
    }
    tilted(0, 1, 0, cam.up)

    // ⚠️ **컷인이 도는 동안은 안 늦춘다.** 원작이 `Camera_SetDistance`로 프레임마다
    // 곧바로 세우는데, 여기 감쇠(5)를 그대로 태우면 서른여덟 프레임짜리 돌진이
    // 8%밖에 안 먹혀 화면에서 아무 일도 안 일어난 것처럼 보인다
    const t = cutInFrame.now !== null || !placeReady
      ? 1
      : 1 - Math.exp(-(first ? FIRST_DAMPING : THIRD.damping) * delta)
    placeReady = true
    cam.position.lerp(goal, t)
    cam.target.lerp(look, t)
    /**
     * ⚠️ **자리만 재면 안 된다.** 시선(`target`)도 같이 보간된다 — 눈이 제자리에
     * 있어도 **어디를 보는지**가 아직 미끄러지면 화면은 그만큼 다른 그림이다.
     * 둘 중 **먼 쪽**을 남긴다
     */
    cameraSystem.drift = Math.max(cam.position.distanceTo(goal), cam.target.distanceTo(look))

    const wantFov = inDistortion ? DISTORTION_FOV : FIELD_FOV
    if (!fovReady) { cameraSystem.fov = wantFov; fovReady = true }
    cameraSystem.fov += (wantFov - cameraSystem.fov) * t
  },
}
