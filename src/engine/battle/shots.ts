// 배틀 카메라 샷 (PLAN §7.4)
//
// 배틀이 "3D답게" 느껴지는 것은 대부분 카메라 덕이다. 지금까지는 한 자리에
// 고정이라 무대만 3D고 연출은 없었다.
//
// ⚠️ **자리와 렌즈는 BDSP가 적어 둔 것이다.** 우리가 눈으로 맞춘 값이 아니라
// `Battle/battle_masterdatas`의 `BattleDefaultPlacementData`에서 읽었다
// (PLAN §4.3.1):
//
//   포켓몬   (0, 0, ±2.0~2.5)   크기 1·2·3에 따라 2.0 / 2.2 / 2.5
//   트레이너 (±0.5, 0, ±5.8)
//   카메라   (−2.7, 0.7, 5.0) · 회전 Y 150° · **화각 30** · near 0.3
//
// 그전에는 카메라가 9.95m 밖에 화각 55로 서 있었다. 그때는 무대에 서는 것이
// 3D 모델이 아니라 **도트 한 장**이라 그림이 그려진 각도를 지켜야 했고, 크기도
// 우리가 정하는 값(2.8m)이었다. 지금은 BDSP 모델이 **실측 크기**로 선다 —
// 모부기가 0.397m다. 그 몸을 예전 렌즈로 보면 화면 높이의 4%짜리 점이 된다.
//
// 샷 사이는 **컷**이고 샷 안에서는 **이징**이다(§7.4). 컷이 있어야 "장면이
// 바뀌었다"가 읽히고, 샷 안에서 천천히 밀고 들어가야 정지 화면이 안 된다.

export type Side = 'p1' | 'p2'

/** 좌표 셋. three를 안 쓰는 계층이라 배열로 주고받는다 */
export type Vec3 = readonly [number, number, number]

/**
 * 양쪽이 서는 자리 (`BattleDefaultPlacementData.PokePos`).
 *
 * **z축 대칭**이다 — 내 쪽이 카메라에 가까운 +z, 상대가 −z. 카메라가 옆으로
 * 비껴 서 있어서 화면에서는 원작 DS와 같은 문법이 된다: 내 것이 앞쪽 왼쪽에
 * 크게, 상대가 뒤쪽 오른쪽에 작게.
 *
 * 2.2는 **중간 크기**(`Size 2`)의 값이다. BDSP는 종의 덩치에 따라 2.0·2.2·2.5로
 * 벌리는데, 우리는 아직 한 값을 쓴다
 */
export const SLOT: Readonly<Record<Side, { x: number; z: number }>> = {
  p1: { x: 0, z: 2.2 },
  p2: { x: 0, z: -2.2 },
}

/**
 * 눈높이. 발판 위 이 높이를 본다.
 *
 * 포켓몬이 실측 크기(화면에 서는 키 0.2~7.3m, 중앙값 1.17m)라 예전 값 1.0으로
 * 보면 작은 종의 머리 위 빈 공간을 겨눈다. 0.5는 그 중앙값의 절반쯤 —
 * 웬만한 종의 몸통이다
 */
const EYE = 0.5

/**
 * 배틀 화각(세로 전각, 도).
 *
 * BDSP의 `MainCamFov` 그대로다. 필드는 55°인데 배틀만 30°로 좁힌다 — 망원으로
 * 당겨야 5.7m 밖에서 0.4m짜리 몸이 화면을 채운다. 파트너 고르는 장면(44°)과
 * 같은 방식으로 `EngineDriver`가 가져간다
 */
export const BATTLE_FOV = 30

/**
 * 기본 샷. 여기서 시작하고 여기로 돌아온다.
 *
 * **거리와 렌즈는 BDSP다** — `MainCamPos` (−2.7, 0.7, 5.0)를 X 뒤집어 옮긴
 * 자리라 무대 한가운데에서 5.68m, 화각 30°다 (모델을 X 뒤집어 굽는다,
 * `bdspGlb` 머리말).
 *
 * ⚠️ **높이만 우리가 올렸다** (0.7 → 1.5, 겨누는 곳 0.4). BDSP는 눈높이에서
 * 수평으로 보는데, 그러면 **뒤에 선 상대가 화면 한가운데(960×640에서 y 398)에
 * 떨어져 내 체력판에 가린다** — 우리 체력판은 원작 DS 배치(상대 왼쪽 위 · 나
 * 오른쪽 아래)라 BDSP의 배치와 다르기 때문이다. 조금 내려다보면 먼 쪽이 위로
 * 올라가서 원작 DS의 구도가 그대로 선다: **내 것 (158, 433) · 상대 (643, 293)**
 * 으로 둘 다 판을 안 물린다. 2.2까지 올려 보니 이번에는 하늘과 나무가 화면
 * 밖으로 밀려서 무대가 안 보였다. 높은 카메라 자체는 BDSP도 쓴다 —
 * 더블배틀이 (−4.0, 3.3, 7.2)다
 */
const ESTABLISH: Shot = {
  from: [2.7, 1.5, 5.0],
  to: [2.6, 1.47, 4.78],
  look: [0, 0.4, 0],
  hold: 0,
  shake: 0,
}

/**
 * 기준 각도에서 벗어날 수 있는 한계(라디안).
 *
 * 60°다. 도트 한 장을 세우던 시절에는 40°였다 — 앞모습 그림을 옆에서 보면
 * 종잇장이 드러나서였다. 3D 모델은 어느 각에서 봐도 몸이라 그 제약이 사라졌고,
 * 그래도 한계를 두는 것은 **축을 넘어가면 누가 내 편인지가 뒤집히기** 때문이다
 */
export const MAX_SWING = (60 * Math.PI) / 180

export type ShotName =
  | 'establish'
  | 'oncoming'
  | 'impact'
  | 'reaction'
  | 'faint'
  | 'switchIn'

/**
 * 샷 하나.
 *
 * `from`에서 `to`로 천천히 민다 — 카메라가 완전히 멈추면 3D 무대가 배경 그림이
 * 된다. `hold`는 이 샷이 살아 있는 시간(초)이고, 지나면 기본 샷으로 돌아간다
 */
export interface Shot {
  from: Vec3
  to: Vec3
  look: Vec3
  hold: number
  /** 흔들림의 세기(월드 단위). 시간이 갈수록 준다 */
  shake: number
}

/**
 * 기준 샷이 보는 방향에서 뽑은 무대 좌표계.
 *
 * ⚠️ **샷을 두 자리를 잇는 축으로 세우면 안 된다.** 처음에 그렇게 만들었더니
 * 상대가 때릴 때 카메라가 무대 **반대편**으로 넘어가서, 재어 보니 기준에서
 * 148~180° 돌아 있었다. 접는 코드가 전부 40°로 되감아서 다섯 샷이 다 같은
 * 자리가 됐다 — 시험은 통과하는데 연출은 없는 상태였다.
 *
 * 그래서 모든 샷을 **기준 시선 기준의 깊이·좌우**로 적는다. 깊이가 클수록
 * 카메라 쪽(앞)이다
 */
const VIEW = (() => {
  const x = ESTABLISH.from[0] - ESTABLISH.look[0]
  const z = ESTABLISH.from[2] - ESTABLISH.look[2]
  const n = Math.hypot(x, z)
  return { x: x / n, z: z / n }
})()
/** 시선의 오른쪽 */
const LAT = { x: -VIEW.z, z: VIEW.x }

/**
 * 더블에서 두 마리가 벌어지는 방향 (PARITY §2.2).
 *
 * ⚠️ **x축이 아니라 시선의 좌우다.** 카메라가 옆으로 비껴 서 있어서(−2.7, 5.0)
 * x로만 벌리면 한쪽은 앞으로 오고 한쪽은 뒤로 물러난다 — 실제로 찍어 보니
 * 상대 둘이 화면 가운데와 오른쪽 끝으로 갈라졌다. 시선의 좌우로 벌리면 둘이
 * 같은 깊이에 나란히 선다
 */
export const PAIR_DIR: Vec3 = [LAT.x, 0, LAT.z]

/**
 * 짝이 깊이로도 어긋나는 방향 (카메라 쪽이 +).
 *
 * 좌우로만 벌리면 넷이 한 줄로 서서 화면 좌우 끝까지 찬다 — 그 자리에
 * 체력판이 있다. 앞뒤로도 엇갈려야 원작 DS의 **대각선 배치**가 된다
 */
export const PAIR_DEPTH: Vec3 = [VIEW.x, 0, VIEW.z]

const ORIGIN = ESTABLISH.look

/**
 * 기준 샷이 서 있는 방위각(라디안). 모든 샷이 여기서 얼마나 벗어났는지로 잰다.
 *
 * ⚠️ **여기 한 벌만 둔다.** 시험이 기준 샷 좌표를 따로 적어 두고 있었는데,
 * 샷을 BDSP 값으로 옮기고 나서도 시험만 옛 자리를 기준으로 재는 바람에
 * 멀쩡한 샷이 79°나 돈 것으로 나왔다
 */
export const BASE_AZIMUTH = Math.atan2(
  ESTABLISH.from[0] - ESTABLISH.look[0],
  ESTABLISH.from[2] - ESTABLISH.look[2],
)

/** 기준 시선에서 얼마나 앞인가. 클수록 카메라에 가깝다 */
function depthOf(side: Side): number {
  return (SLOT[side].x - ORIGIN[0]) * VIEW.x + (SLOT[side].z - ORIGIN[2]) * VIEW.z
}

/** 기준 시선에서 얼마나 오른쪽인가 */
function latOf(side: Side): number {
  return (SLOT[side].x - ORIGIN[0]) * LAT.x + (SLOT[side].z - ORIGIN[2]) * LAT.z
}

/** 깊이·좌우·높이를 월드 좌표로 */
function place(depth: number, lateral: number, y: number): Vec3 {
  return [
    ORIGIN[0] + VIEW.x * depth + LAT.x * lateral,
    y,
    ORIGIN[2] + VIEW.z * depth + LAT.z * lateral,
  ]
}

const eyeOf = (side: Side): Vec3 => [SLOT[side].x, EYE, SLOT[side].z]
const other = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1')

/**
 * 때리는 샷에서 카메라가 **때리는 쪽으로** 치우치는 정도. 어깨 너머를 만든다.
 *
 * ⚠️ 0.5는 안 된다 — 정확히 두 자리의 한가운데라 어느 쪽이 때리든 카메라가
 * 같은 자리에 선다. 어깨 너머가 아니라 그냥 가까운 기본 샷이 된다
 */
const SHOULDER = 0.62

/**
 * 샷의 거리·높이는 전부 이 리그 크기에서 잰 값이다 (기본 샷이 무대 한가운데에서
 * 떨어진 거리, m). 예전 값 9.95에서 BDSP의 5.68로 줄면서 오프셋을 같은 비율로
 * 줄였다 — 안 줄이면 어깨 너머 샷이 무대 밖으로 나간다.
 * `battle/arena`의 `cameraFit`도 이 값을 본다
 */
export const SHOT_REACH = 5.68

/**
 * 카메라 자리를 기준 각도 안으로 접는다.
 *
 * 무대 한가운데를 축으로 재고, `MAX_SWING`을 넘으면 그 각도로 되돌린다.
 * 거리와 높이는 그대로 둔다 — 각도만 문제이기 때문이다
 */
export function clampSwing(position: Vec3, look: Vec3): Vec3 {
  const base = BASE_AZIMUTH
  const dx = position[0] - look[0], dz = position[2] - look[2]
  const here = Math.atan2(dx, dz)
  let off = here - base
  while (off > Math.PI) off -= Math.PI * 2
  while (off < -Math.PI) off += Math.PI * 2
  if (Math.abs(off) <= MAX_SWING) return position
  const want = base + Math.sign(off) * MAX_SWING
  const flat = Math.hypot(dx, dz)
  return [look[0] + Math.sin(want) * flat, position[1], look[2] + Math.cos(want) * flat]
}

/**
 * 샷 하나를 만든다.
 *
 * `side`는 **그 샷의 주인공**이다 — `oncoming`은 때리는 쪽, `impact`·`reaction`·
 * `faint`는 맞는 쪽, `switchIn`은 나오는 쪽
 */
export function shotFor(name: ShotName, side: Side): Shot {
  if (name === 'establish') return ESTABLISH

  // 때리는 샷만 상대를 본다. 나머지는 `side`가 곧 주인공이다
  if (name === 'oncoming') {
    const foe = other(side)
    // ⚠️ **둘 중 카메라에 가까운 쪽보다 더 뒤에 선다.** 때리는 쪽만 보고
    // 물러나면, 상대가 때릴 때 카메라가 맞는 쪽 **앞**에 서서 뒤를 돌아본다
    const behind = Math.max(depthOf(side), depthOf(foe))
    const lateral = latOf(foe) + SHOULDER * (latOf(side) - latOf(foe))
    return {
      from: place(behind + 1.94, lateral, 1.43),
      to: place(behind + 1.6, lateral, 1.25),
      look: eyeOf(foe),
      hold: 0.9,
      shake: 0,
    }
  }

  const depth = depthOf(side)
  const lateral = latOf(side)
  const look = eyeOf(side)

  switch (name) {
    // 맞는 순간. 바짝 붙고 흔든다
    case 'impact':
      return {
        from: place(depth + 1.82, lateral + 0.51, 1.08),
        to: place(depth + 1.65, lateral + 0.46, 1.03),
        look: [look[0], EYE + 0.09, look[2]],
        hold: 0.5,
        shake: 0.13,
      }
    // 맞고 난 뒤. 반대쪽으로 한 걸음 물러나 반응을 본다
    case 'reaction':
      return {
        from: place(depth + 2.51, lateral - 0.57, 1.37),
        to: place(depth + 2.85, lateral - 0.68, 1.48),
        look,
        hold: 0.8,
        shake: 0,
      }
    // 쓰러진다. **아래에서 올려다본다** — 원작에 없는 각도지만 3D의 문법이다
    case 'faint':
      return {
        from: place(depth + 2.05, lateral, 0.51),
        to: place(depth + 2.34, lateral + 0.11, 0.68),
        look: [look[0], EYE + 0.23, look[2]],
        hold: 1.2,
        shake: 0,
      }
    // 등판. 옆 위에서 내려오며 들어온다
    case 'switchIn':
      return {
        from: place(depth + 2.39, lateral + 1.03, 1.6),
        to: place(depth + 2.39, lateral + 0.17, 0.91),
        look,
        hold: 0.9,
        shake: 0,
      }
  }
}

/** 부드럽게 시작해 부드럽게 끝난다 */
export function ease(t: number): number {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

export interface CameraFrame {
  position: Vec3
  look: Vec3
  /** 이 프레임에 실을 흔들림. 무대가 자기 난수로 방향을 정한다 */
  shake: number
}

/**
 * 샷 하나를 시각 `t`(초)에서 뜬다.
 *
 * 자리는 `from`에서 `to`로 이징하고, 흔들림은 처음 40%가 지나면 사라진다 —
 * 계속 흔들면 맞는 순간이 아니라 지진이 된다
 */
export function sampleShot(shot: Shot, t: number): CameraFrame {
  const span = shot.hold > 0 ? shot.hold : 1
  const k = ease(t / span)
  const position = clampSwing([
    shot.from[0] + (shot.to[0] - shot.from[0]) * k,
    shot.from[1] + (shot.to[1] - shot.from[1]) * k,
    shot.from[2] + (shot.to[2] - shot.from[2]) * k,
  ], shot.look)
  const decay = Math.max(0, 1 - t / (span * 0.4))
  return { position, look: shot.look, shake: shot.shake * decay * decay }
}

/**
 * 샷을 이어 붙이는 연출가.
 *
 * 상태는 "지금 어느 샷이고 몇 초 지났나" 둘뿐이다. 샷의 시간이 다 되면 기본
 * 샷으로 **컷**한다 — 되돌아가는 것을 이징으로 하면 카메라가 미끄러지는 것처럼
 * 보이고, 그건 장면이 끝났다는 신호가 안 된다
 */
export class ShotDirector {
  private name: ShotName = 'establish'
  private side: Side = 'p1'
  private t = 0

  /** 지금 무슨 샷인가 */
  get current(): ShotName { return this.name }

  /** 새 샷으로 컷한다. 같은 샷을 다시 걸면 처음부터 다시 돈다 */
  cut(name: ShotName, side: Side): void {
    this.name = name
    this.side = side
    this.t = 0
  }

  /** 기본 샷으로 돌아간다 */
  reset(): void {
    this.cut('establish', 'p1')
  }

  /** 시간을 흘리고 이 프레임의 카메라를 준다 */
  advance(delta: number): CameraFrame {
    this.t += delta
    const shot = shotFor(this.name, this.side)
    if (shot.hold > 0 && this.t >= shot.hold) this.reset()
    return sampleShot(shotFor(this.name, this.side), this.t)
  }
}
