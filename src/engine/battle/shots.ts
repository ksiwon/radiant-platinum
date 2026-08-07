// 배틀 카메라 샷 (PLAN §7.4)
//
// 배틀이 "3D답게" 느껴지는 것은 대부분 카메라 덕이다. 지금까지는 한 자리에
// 고정이라 무대만 3D고 연출은 없었다.
//
// ⚠️ **여기가 마음대로 돌 수 없는 이유가 있다.** 무대에 서는 것은 3D 모델이
// 아니라 원작 도트 **한 장**이다(DATA.md §2.17). 그림이 그려진 각도가 정해져
// 있어서, 카메라가 옆으로 크게 돌면 종잇장이 서 있는 것이 보인다. 그래서 둘을
// 같이 지킨다:
//
//   ① 무대 쪽에서 그림판을 **Y축으로만 카메라를 향해 돌린다**(빌보드). 종잇장이
//      되는 일은 이걸로 사라진다.
//   ② 그래도 **기준 각도에서 크게 벗어나지 않는다.** 앞모습 그림을 뒤에서 보면
//      뒤통수가 아니라 얼굴이 따라오는 이상한 그림이 된다. `MAX_SWING`이 그 한계다.
//
// 샷 사이는 **컷**이고 샷 안에서는 **이징**이다(§7.4). 컷이 있어야 "장면이
// 바뀌었다"가 읽히고, 샷 안에서 천천히 밀고 들어가야 정지 화면이 안 된다.

export type Side = 'p1' | 'p2'

/** 좌표 셋. three를 안 쓰는 계층이라 배열로 주고받는다 */
export type Vec3 = readonly [number, number, number]

/**
 * 양쪽이 서는 자리.
 *
 * 원작 문법 그대로 **내 포켓몬은 앞쪽 왼쪽, 상대는 뒤쪽 오른쪽**이다. 무대와
 * 카메라가 같은 값을 봐야 하므로 여기 한 벌만 둔다
 */
export const SLOT: Readonly<Record<Side, { x: number; z: number }>> = {
  p1: { x: -2.4, z: 1.6 },
  p2: { x: 2.6, z: -3.2 },
}

/** 눈높이. 발판 위 이 높이를 본다 */
const EYE = 1.0

/** 기본 샷. 여기서 시작하고 여기로 돌아온다 */
const ESTABLISH: Shot = {
  from: [-2.6, 5.0, 9.6],
  to: [-2.2, 4.6, 8.7],
  look: [0.9, 1.0, -1.6],
  hold: 0,
  shake: 0,
}

/**
 * 기준 각도에서 벗어날 수 있는 한계(라디안).
 *
 * 40°다. 이보다 크게 돌면 앞모습 도트를 옆·뒤에서 보게 되는데, 빌보드로 돌려
 * 놔도 "그려진 각도"와 무대의 각도가 어긋나는 것이 눈에 띈다
 */
export const MAX_SWING = (40 * Math.PI) / 180

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

const ORIGIN = ESTABLISH.look

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
 * 카메라 자리를 기준 각도 안으로 접는다.
 *
 * 무대 한가운데를 축으로 재고, `MAX_SWING`을 넘으면 그 각도로 되돌린다.
 * 거리와 높이는 그대로 둔다 — 각도만 문제이기 때문이다
 */
export function clampSwing(position: Vec3, look: Vec3): Vec3 {
  const base = Math.atan2(ESTABLISH.from[0] - ESTABLISH.look[0], ESTABLISH.from[2] - ESTABLISH.look[2])
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
      from: place(behind + 3.4, lateral, 2.5),
      to: place(behind + 2.8, lateral, 2.2),
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
        from: place(depth + 3.2, lateral + 0.9, 1.9),
        to: place(depth + 2.9, lateral + 0.8, 1.8),
        look: [look[0], EYE + 0.15, look[2]],
        hold: 0.5,
        shake: 0.13,
      }
    // 맞고 난 뒤. 반대쪽으로 한 걸음 물러나 반응을 본다
    case 'reaction':
      return {
        from: place(depth + 4.4, lateral - 1.0, 2.4),
        to: place(depth + 5.0, lateral - 1.2, 2.6),
        look,
        hold: 0.8,
        shake: 0,
      }
    // 쓰러진다. **아래에서 올려다본다** — 원작에 없는 각도지만 3D의 문법이다
    case 'faint':
      return {
        from: place(depth + 3.6, lateral, 0.9),
        to: place(depth + 4.1, lateral + 0.2, 1.2),
        look: [look[0], EYE + 0.4, look[2]],
        hold: 1.2,
        shake: 0,
      }
    // 등판. 옆 위에서 내려오며 들어온다
    case 'switchIn':
      return {
        from: place(depth + 4.2, lateral + 1.8, 2.8),
        to: place(depth + 4.2, lateral + 0.3, 1.6),
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
