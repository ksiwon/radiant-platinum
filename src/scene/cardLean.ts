// 세운 판을 **보는 각에 맞춰 도로 눕힌다** — 방 렌즈의 45° 판 (REPAIR §16)
//
// 원작은 판때기를 45°로 눕혀 그려 두고 고정 카메라(방은 내림각 59.05°)로 본다. 그 각에서
// 판이 카메라와 비끼는 각이 14.05°라 2타일짜리 판이 화면에서 **1.94타일**로 선다.
// 우리는 1인칭 때문에 판을 세운다(`plates.standCutouts`) — 그러면 1인칭은 맞는데 3인칭
// 방에서는 비끼는 각이 59.05°가 되어 **1.03타일(53%)**로 납작해진다. 연고시티 체육관
// 문 방의 해골몽 판이 그렇게 찍혔다.
//
// 그래서 **한 가지 각에 못 박지 않는다.** 판마다 경첩(가장 낮은 모서리)과 원작이 눕혀
// 둔 쪽을 적어 두고, 화면이 지금 내려다보는 각으로 기울기를 정한다:
//
//   눕힘 = 원작 각 × clamp(내려다보는 각 ÷ 원작 렌즈 각, 0, 1)
//
//   · 3인칭 방 — 원작 렌즈 각으로 내려다보니 **원작 45° 그대로**다
//   · 1인칭 — 눈높이에서 수평으로 보니 **0°, 곧 세운 판**이다
//   · 그 사이(시점을 바꾸는 동안 · 1인칭에서 고개를 숙일 때)는 이어서 간다
//
// 판은 경첩을 축으로 **통째로** 돈다 — 두께 옆면(`cards.cardShells`)도 같은 경첩을 들고
// 있어서 판과 함께 눕는다. 법선은 안 돌린다: 원작 판의 법선은 원래부터 45° 것이다
import type { BufferAttribute, BufferGeometry } from 'three'

/**
 * 판 경첩 (정점마다 4칸) — `x, y, z`는 경첩 위의 한 점, `w`는 **원작이 눕혀 둔 각(라디안)**.
 * `w`가 0이면 눕힐 판이 아니다
 */
export const LEAN_HINGE = 'leanHinge'
/** 원작이 눕혀 둔 쪽 (정점마다 2칸, 수평 단위 벡터 `x, z`) */
export const LEAN_BACK = 'leanBack'

/**
 * 지금 눕힐 각(라디안).
 *
 * @param viewDeg 화면이 내려다보는 각(도). 수평이 0이고 아래로 볼수록 크다
 * @param lensDeg 그 방의 원작 렌즈 내림각(도) — `camera.roomPitchDeg`
 * @param rest 원작이 눕혀 둔 각(라디안)
 */
export function leanAngle(viewDeg: number, lensDeg: number, rest: number): number {
  if (lensDeg <= 0) return 0
  return rest * Math.min(1, Math.max(0, viewDeg / lensDeg))
}

interface LeanRest {
  /** 세운 자리. 매번 여기서 새로 돌린다 — 돌린 자리에 또 돌리면 오차가 쌓인다 */
  position: Float32Array
  /** 눕힐 정점들 */
  verts: Uint32Array
  /** 마지막으로 건 비율. 안 바뀌었으면 버퍼를 다시 안 올린다 */
  ratio: number
}

const rests = new WeakMap<BufferGeometry, LeanRest | null>()

function restOf(geometry: BufferGeometry): LeanRest | null {
  const hit = rests.get(geometry)
  if (hit !== undefined) return hit
  const hinge = geometry.getAttribute(LEAN_HINGE) as BufferAttribute | undefined
  const position = geometry.getAttribute('position') as BufferAttribute | undefined
  let made: LeanRest | null = null
  if (hinge !== undefined && position !== undefined) {
    const verts: number[] = []
    for (let i = 0; i < hinge.count; i++) if (hinge.getW(i) > 0) verts.push(i)
    if (verts.length > 0) {
      made = {
        position: (position.array as Float32Array).slice(),
        verts: Uint32Array.from(verts),
        ratio: 0,
      }
    }
  }
  rests.set(geometry, made)
  return made
}

/** 비율이 이만큼 안 바뀌면 안 건드린다. 0.1°(45°의 1/450)면 화면에서 안 보인다 */
const RATIO_STEP = 1 / 450

/**
 * 기하의 판들을 그 비율로 눕힌다 (0 = 세운 판 · 1 = 원작 각).
 *
 * 세운 자리(`rest.position`)에서 경첩을 축으로 돌린다. 판 위의 점을 경첩 기준으로
 * 가로(축) · 위 · 뒤 세 성분으로 쪼개면, 위와 뒤만 θ만큼 돌리면 된다:
 *
 *     위' = 위·cos θ − 뒤·sin θ      뒤' = 위·sin θ + 뒤·cos θ
 *
 * 세운 판의 점은 뒤 성분이 0이라 θ가 원작 각이면 **원작 정점 그대로** 돌아온다.
 * 두께 옆면의 점은 뒤 성분이 두께만큼 있어서 판과 한 몸으로 돈다
 *
 * @returns 버퍼를 고쳤는가
 */
export function applyLean(geometry: BufferGeometry, ratio: number): boolean {
  const rest = restOf(geometry)
  if (rest === null) return false
  const r = Math.min(1, Math.max(0, ratio))
  if (Math.abs(r - rest.ratio) < RATIO_STEP && !(r === 0 && rest.ratio !== 0)) return false
  rest.ratio = r
  const hinge = geometry.getAttribute(LEAN_HINGE) as BufferAttribute
  const back = geometry.getAttribute(LEAN_BACK) as BufferAttribute
  const attr = geometry.getAttribute('position') as BufferAttribute
  const out = attr.array as Float32Array
  const src = rest.position
  for (const i of rest.verts) {
    const theta = hinge.getW(i) * r
    const c = Math.cos(theta), s = Math.sin(theta)
    const ox = hinge.getX(i), oy = hinge.getY(i), oz = hinge.getZ(i)
    const bx = back.getX(i), bz = back.getY(i)
    const dx = src[i * 3]! - ox, dy = src[i * 3 + 1]! - oy, dz = src[i * 3 + 2]! - oz
    const behind = dx * bx + dz * bz
    // 축 성분 = 수평 성분에서 뒤 성분을 뺀 것
    const ax = dx - behind * bx, az = dz - behind * bz
    const up2 = dy * c - behind * s
    const behind2 = dy * s + behind * c
    out[i * 3] = ox + ax + behind2 * bx
    out[i * 3 + 1] = oy + up2
    out[i * 3 + 2] = oz + az + behind2 * bz
  }
  attr.needsUpdate = true
  return true
}

/** 이 기하에 눕힐 판이 있는가 */
export function hasLean(geometry: BufferGeometry | null | undefined): boolean {
  return geometry != null && restOf(geometry) !== null
}

/** 쪼갠 기하가 든 경첩 — 두께 옆면에 물려준다 (`cards.cardShells`) */
export function leanRigOf(
  geometry: BufferGeometry,
): { hinge: ArrayLike<number>, back: ArrayLike<number> } | null {
  const hinge = geometry.getAttribute(LEAN_HINGE) as BufferAttribute | undefined
  const back = geometry.getAttribute(LEAN_BACK) as BufferAttribute | undefined
  if (hinge === undefined || back === undefined) return null
  return { hinge: hinge.array as Float32Array, back: back.array as Float32Array }
}
