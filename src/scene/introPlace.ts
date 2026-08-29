// 오프닝 무대의 자리와 그것이 화면 어디에 찍히는가.
//
// ⚠️ **UI와 3D가 같은 숫자를 봐야 한다.** 마박사가 「몬스터볼 가운데의 버튼을
// 눌러보도록 하거라!」라고 하는데, 누르는 자리는 DOM 단추고 버튼은 3D다.
// 두 자리가 저마다 값을 들고 있으면 어긋난다 — 실제로 어긋나 있었다:
// 누르는 단추가 대사창 **위쪽 빈 곳의 한가운데**에 있었고, 3D 버튼은 카메라가
// 겨누는 자리라 화면 한가운데였다.
//
// three를 안 부른다 — UI 청크에 three가 실리면 초기 예산이 깨진다(PLAN §15).
// 숫자만 다루고 벡터로 만드는 것은 `IntroStage` 몫이다.

type Vec3 = readonly [number, number, number]

/** `IntroStage`가 세우는 카메라. 오프닝 내내 안 움직인다 */
export const INTRO_CAMERA = {
  /** 무대 원점에서의 눈 자리 */
  eye: [0, 2.6, 7.4] as Vec3,
  /**
   * 겨누는 자리.
   *
   * 사람의 가슴(1.05m)이 아니라 0.55m다 — 한 화면이라 발밑이 대사창에 가려서
   * 겨눔과 눈높이를 같이 0.5m 내렸다 (`IntroStage` 머리말)
   */
  target: [0, 0.55, 0] as Vec3,
  /** 세로 전각(도) */
  fov: 38,
} as const

/** 마박사가 들고 있는 몬스터볼 */
export const INTRO_BALL = {
  /** 볼 한가운데 */
  at: [0, 0.72, 0] as Vec3,
  scale: 0.72,
  /** 볼 안에서 가운데 버튼의 자리 — 앞쪽 띠에 붙어 있다 */
  button: [0, 0, 0.95] as Vec3,
  /** 검은 테두리까지의 반지름. 흰 알맹이는 0.2다 */
  buttonRadius: 0.3,
} as const

/**
 * 누르는 자리를 버튼보다 얼마나 넓게 잡는가.
 *
 * 버튼이 화면에서 지름 58px쯤이라 그대로 두면 마우스가 미끄러진다. 넓히되
 * **자리는 안 옮긴다** — 어긋난 것은 크기가 아니라 자리였다
 */
export const HIT_MARGIN = 1.4

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]
function unit(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

interface Viewport { width: number, height: number }

/** 화면에 찍힌 자리와 크기 — 왼쪽 위가 (0, 0)인 픽셀 */
interface OnScreen { x: number, y: number, radius: number }

/**
 * 그 점이 화면 어디에 얼마만 하게 찍히는가.
 *
 * 카메라는 기울지 않으므로(위가 늘 세상의 위) 오른쪽·위를 시선에서 바로 뽑는다.
 * 화각은 **세로**라 가로만 화면 비로 나눈다
 */
export function project(point: Vec3, radius: number, view: Viewport): OnScreen {
  const { eye, target, fov } = INTRO_CAMERA
  const forward = unit(sub(target, eye))
  const right = unit(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)
  const v = sub(point, eye)
  const depth = dot(v, forward)
  const half = Math.tan((fov * Math.PI) / 360)
  const aspect = view.height === 0 ? 1 : view.width / view.height
  // 카메라 뒤에 있으면 화면 밖이다. 오프닝에서는 안 생기지만 0으로 나누지 않는다
  if (depth <= 1e-6) return { x: view.width / 2, y: view.height / 2, radius: 0 }
  const ndcX = dot(v, right) / depth / (half * aspect)
  const ndcY = dot(v, up) / depth / half
  return {
    x: ((ndcX + 1) / 2) * view.width,
    y: ((1 - ndcY) / 2) * view.height,
    radius: (radius / depth / half) * (view.height / 2),
  }
}

/** 몬스터볼 가운데 버튼이 화면 어디에 있는가 */
export function introBallButton(view: Viewport): OnScreen {
  const { at, scale, button, buttonRadius } = INTRO_BALL
  const world: Vec3 = [
    at[0] + button[0] * scale,
    at[1] + button[1] * scale,
    at[2] + button[2] * scale,
  ]
  return project(world, buttonRadius * scale, view)
}
