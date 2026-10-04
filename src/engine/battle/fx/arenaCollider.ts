// 무대 지오메트리 충돌 — 시퀀스 카메라가 벽 · 천장 구조물 속에 서거나 그 너머를 보지 않게 (BATTLE_FX §4).
//
// 사천왕 리요(`g038`)의 방은 무대 위 5.2~8.4m에 고리 구조물(`M_B_023_Facility_01`)이 매달려 있다. 몸 상자만
// 보던 거르기가 카메라를 그 높이까지 올려 화면이 검은 들보 · 원판으로 덮였다. 그래서 무대가 설 때 **한 번**
// 무대 삼각형으로 BVH를 짓고, 카메라마다 「보는 곳 → 카메라」 선분이 처음 맞는 자리를 잰다.
//
// 좌표는 무대 좌표(`STAGE_ORIGIN` 기준)다. three를 안 쓴다 — 삼각형은 부르는 쪽(`BattleStage`의 `Arena`)이
// 월드 행렬을 곱해 넘긴다.

import type { V3 } from './vec3'

export type { V3 }

export interface ArenaCollider {
  /**
   * 선분 a → b가 처음 맞는 삼각형까지의 비율(0~1). 안 맞으면 `null`. 양면으로 잰다 —
   * 감김이 뒤집힌 판도 카메라를 막는다
   */
  hit(a: readonly number[], b: readonly number[]): number | null
  /**
   * (x, z)에서 카메라가 설 수 있는 가장 높은 곳(m) — 머리 위 구조물 **아랫면**에서 `CEILING_MARGIN`을 뺐다.
   * 둘 중 낮은 것이다:
   *
   * - **무대 안쪽(반지름의 반) 전체의 가장 낮은 아랫면** — 리요 방의 매달린 원판(5.5m)이 무대 어디서든 천장이다.
   *   고리 사이 틈으로 올라가 들보 너머를 내려다보면 안 된다
   * - **그 자리 둘레 `LOCAL_REACH` 안의 가장 낮은 아랫면** — 숲 무대 가장자리의 나뭇가지(2.6m)처럼 바깥에만 있는
   *   것은 그 자리에서만 누른다. 무대 전체를 2m로 누르면 숲 기술 샷이 다 땅에 붙는다
   *
   * 머리 위에 아무것도 없으면(야외 한가운데) `Infinity`
   */
  ceilingAt(x: number, z: number): number
}

/** 이 높이(m)보다 낮은 아랫면은 천장으로 안 친다 — 난간 · 문틀이 천장이 되면 카메라가 땅에 붙는다 */
const OVERHEAD_FROM = 2.5
/** 천장 아랫면에서 이만큼 아래까지만 선다 (m) */
const CEILING_MARGIN = 0.5
/** 천장을 찾는 연직 광선의 간격 (m) */
const CEILING_STEP = 0.5
/** 자리마다의 천장은 이 거리(m) 안의 칸을 다 본다 — 들보 하나 옆에 붙어 서도 그 들보가 화면 위를 가린다 */
const LOCAL_REACH = 1
/** 잎 하나에 담는 삼각형 수 */
const LEAF = 8

interface Node {
  min: V3
  max: V3
  /** 잎이면 삼각형 범위 [start, start+count), 아니면 자식 둘 */
  start: number
  count: number
  left: Node | null
  right: Node | null
}

/**
 * @param tris 삼각형마다 꼭짓점 셋(9개 수) — 무대 좌표
 * @param radius 무대 반지름. 카메라는 그 안(반지름 − 0.5)에만 서므로 그 밖 삼각형은 버린다
 */
export function buildArenaCollider(tris: Float32Array | readonly number[], radius: number): ArenaCollider {
  const keepR = radius + 1
  const kept: number[] = []
  const n0 = Math.floor(tris.length / 9)
  for (let i = 0; i < n0; i++) {
    const o = i * 9
    // 수평 바운드가 반지름 원판과 겹치는 것만
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let k = 0; k < 3; k++) {
      const x = tris[o + k * 3]!, z = tris[o + k * 3 + 2]!
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z)
    }
    const cx = Math.max(x0, Math.min(0, x1)), cz = Math.max(z0, Math.min(0, z1))
    if (Math.hypot(cx, cz) > keepR) continue
    for (let k = 0; k < 9; k++) kept.push(tris[o + k]!)
  }
  const tri = Float64Array.from(kept)
  const count = tri.length / 9
  const order = new Int32Array(count)
  for (let i = 0; i < count; i++) order[i] = i
  const cent = new Float64Array(count * 3)
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) cent[i * 3 + a] = (tri[i * 9 + a]! + tri[i * 9 + 3 + a]! + tri[i * 9 + 6 + a]!) / 3
  }
  const root = count > 0 ? build(tri, order, cent, 0, count) : null

  const hit = (a: readonly number[], b: readonly number[], downOnly = false): number | null => {
    if (!root) return null
    const d: V3 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
    let best = Infinity
    const stack: Node[] = [root]
    while (stack.length) {
      const node = stack.pop()!
      if (!rayBox(a, d, node.min, node.max, best)) continue
      if (node.left && node.right) { stack.push(node.left, node.right); continue }
      for (let k = node.start; k < node.start + node.count; k++) {
        const t = rayTri(a, d, tri, order[k]! * 9, downOnly)
        if (t !== null && t < best) best = t
      }
    }
    return best <= 1 ? best : null
  }

  // 천장 — 원판 위를 격자로 훑어 위로 쏜다. **아랫면만**(법선이 아래) 센다: 기둥 · 난간 속에서 쏜 광선이
  // 그 윗면에 맞아 천장이 되면 안 된다
  const lim = Math.max(2, radius - 0.5)
  const side = Math.ceil(lim / CEILING_STEP)
  const cells = 2 * side + 1
  const field = new Float64Array(cells * cells).fill(Infinity)
  let inner = Infinity
  const TOP = 200
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x = (i - side) * CEILING_STEP, z = (j - side) * CEILING_STEP
      if (Math.hypot(x, z) > lim + CEILING_STEP) continue
      const t = hit([x, OVERHEAD_FROM, z], [x, TOP, z], true)
      if (t === null) continue
      const y = OVERHEAD_FROM + t * (TOP - OVERHEAD_FROM)
      field[i * cells + j] = y
      if (Math.hypot(x, z) <= radius * 0.5) inner = Math.min(inner, y)
    }
  }
  const reach = Math.round(LOCAL_REACH / CEILING_STEP)
  const ceilingAt = (x: number, z: number): number => {
    let low = inner
    const ci = Math.round(x / CEILING_STEP) + side, cj = Math.round(z / CEILING_STEP) + side
    for (let i = Math.max(0, ci - reach); i <= Math.min(cells - 1, ci + reach); i++) {
      for (let j = Math.max(0, cj - reach); j <= Math.min(cells - 1, cj + reach); j++) low = Math.min(low, field[i * cells + j]!)
    }
    return low - CEILING_MARGIN
  }
  return { hit: (a, b) => hit(a, b), ceilingAt }
}

function build(tri: Float64Array, order: Int32Array, cent: Float64Array, start: number, count: number): Node {
  const min: V3 = [Infinity, Infinity, Infinity]
  const max: V3 = [-Infinity, -Infinity, -Infinity]
  for (let k = start; k < start + count; k++) {
    const o = order[k]! * 9
    for (let v = 0; v < 9; v++) {
      const a = v % 3
      min[a] = Math.min(min[a]!, tri[o + v]!)
      max[a] = Math.max(max[a]!, tri[o + v]!)
    }
  }
  if (count <= LEAF) return { min, max, start, count, left: null, right: null }
  // 가장 긴 축의 중앙값으로 가른다
  let axis = 0
  for (let a = 1; a < 3; a++) if (max[a]! - min[a]! > max[axis]! - min[axis]!) axis = a
  const part = Array.from(order.subarray(start, start + count)).sort((p, q) => cent[p * 3 + axis]! - cent[q * 3 + axis]!)
  order.set(part, start)
  const half = count >> 1
  return {
    min, max, start, count,
    left: build(tri, order, cent, start, half),
    right: build(tri, order, cent, start + half, count - half),
  }
}

/** 반직선 a + t·d (0 ≤ t ≤ tMax)가 상자에 닿는가 */
function rayBox(a: readonly number[], d: V3, min: V3, max: V3, tMax: number): boolean {
  let t0 = 0, t1 = Math.min(1, tMax)
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-12) {
      if (a[i]! < min[i]! || a[i]! > max[i]!) return false
      continue
    }
    let ta = (min[i]! - a[i]!) / d[i]!
    let tb = (max[i]! - a[i]!) / d[i]!
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 > t1) return false
  }
  return true
}

/** 묄러–트럼보어. `downOnly`면 광선과 같은 쪽을 보는 면(아랫면을 밑에서 친 것)만 */
function rayTri(a: readonly number[], d: V3, tri: Float64Array, o: number, downOnly: boolean): number | null {
  const e1: V3 = [tri[o + 3]! - tri[o]!, tri[o + 4]! - tri[o + 1]!, tri[o + 5]! - tri[o + 2]!]
  const e2: V3 = [tri[o + 6]! - tri[o]!, tri[o + 7]! - tri[o + 1]!, tri[o + 8]! - tri[o + 2]!]
  if (downOnly) {
    // 면 법선(감김 기준)의 y가 음수 = 아랫면
    const ny = e1[2] * e2[0] - e1[0] * e2[2]
    if (ny >= 0) return null
  }
  const p: V3 = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  const s: V3 = [a[0]! - tri[o]!, a[1]! - tri[o + 1]!, a[2]! - tri[o + 2]!]
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv
  if (u < 0 || u > 1) return null
  const q: V3 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]]
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv
  if (v < 0 || u + v > 1) return null
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv
  return t >= 0 && t <= 1 ? t : null
}
