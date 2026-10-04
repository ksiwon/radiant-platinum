// 시퀀스 카메라를 우리 무대에 맞춘다 — 바닥 · 무대 밖 · 몸 속 · 무대 지오메트리 (BATTLE_FX §4).
//
// BDSP 시퀀스 카메라는 BDSP 무대와 BDSP 몸 크기에 맞춰 적혀 있다. 우리 몸은 실측 크기 glb라
// 같은 오프셋이 큰 몸(토대부기 2.2m) 속이나 뒤에 떨어지고, 실내 무대는 BDSP보다 좁다. 그래서
// 시퀀스가 낸 카메라를 그리기 전에 한 번 거른다:
//
//   1. 보는 곳은 바닥 위(0.1m)로 — 껍질에 숨기(`ew110`)는 BDSP 껍질 모델(안 옮겼다) 밑을 본다
//   2. 몸 상자 속이면 보는 곳 → 카메라 쪽으로 상자 밖까지 민다
//   3. 자리 잡기(`settle`) — 바닥 위 0.15m · 무대 반지름 − 0.5m 안(밖이면 **시선을 따라** 당긴다) ·
//      천장 아래(`ArenaCollider.ceilingAt`) · BDSP 샷보다 `MAX_STEEPER`도 넘게 내려다보지 않게 ·
//      보는 곳 → 카메라 선분이 무대 지오메트리에 맞으면 맞은 자리 바로 앞(`NEAR_MARGIN`)까지 당긴다
//   4. 화면 검사 — 주인공이 아닌 몸은 화면의 15% 이하, 주인공 몸은 화면 안에 다, 다른 몸이 시선을 안 막게
//      (`frameSubject`). 후보도 하나하나 3을 거친 뒤에 잰다

import type { ArenaCollider } from './arenaCollider'

export type V3 = [number, number, number]

interface ShotLike {
  pos: V3
  target: V3
  fov: number
  roll: number
}

export interface Box {
  min: readonly [number, number, number]
  max: readonly [number, number, number]
}

/** 몸 상자에 두르는 여유(m) — 카메라 근평면(0.3)이 몸을 자르지 않게 */
const MARGIN = 0.25

/**
 * 지오메트리에 맞은 자리에서 보는 곳 쪽으로 이만큼(m) 앞에 선다.
 *
 * 배틀 근평면은 0.1m(`FIELD_NEAR`)이고, 화각 30° · 16:9에서 근평면 모서리는 시선에서 0.055m 벗어난다.
 * 선분은 화면 한가운데 한 줄만 재므로 모서리가 벽을 긁지 않게 그 셋 배쯤 둔다
 */
const NEAR_MARGIN = 0.3

/**
 * BDSP 샷보다 이 각(도)보다 더 내려다보지 않는다.
 *
 * BDSP 시퀀스 샷은 거의 수평이다(옮긴 기술들에서 0~14°) — 우리 기본 카메라도 14°다. 25°를 더하면 가장
 * 가파른 것이 39°다. 그 너머부터 화면이 「위에서 내려다본 판」으로 읽힌다: 화각 30°에서 화면 위 끝이 수평선
 * 아래 24°로 내려가 무대 벽 · 하늘이 화면에서 다 빠지고 바닥만 남는다(E1-e 리요 방 31프레임 · 몸이 땅에 붙은
 * 점). 몸 키도 cos 39° = 0.78배로 줄어 보여 아직 서 있는 몸으로 읽힌다(45°면 0.71). 우리 값이다
 */
const MAX_STEEPER = 25

/** 올리기는 물리기 · 비키기보다 이만큼 비싸다 — 올리면 내려다보는 판이 되고 천장 구조물에 가까워진다 */
const RAISE_COST = 2

/**
 * @param aspect 화면 가로/세로. 0이면 화면 넓이 검사를 건너뛴다(시선 막힘은 잰다)
 * @param room 무대 지오메트리. 없으면(받는 중 · 깨어진 세계) 반지름 8m 이하 무대만 천장을 반지름의 반으로 친다
 */
export function clampShot<T extends ShotLike>(
  c: T, radius: number, boxes: readonly Box[], aspect = 0, room: ArenaCollider | null = null,
): T {
  const target: V3 = [c.target[0], Math.max(0.1, c.target[1]), c.target[2]]
  let pos: V3 = [c.pos[0], Math.max(0.15, c.pos[1]), c.pos[2]]
  const grown = boxes.map(grownBox)
  for (let pass = 0; pass < 2; pass++) {
    for (const b of grown) {
      if (!inside(pos, b)) continue
      // 보는 곳 → 카메라 쪽으로 상자 밖까지
      let d = sub(pos, target)
      if (len(d) < 1e-6) d = [0, 1, 0]
      const n = norm(d)
      const t = exitDistance(pos, n, b)
      pos = add(pos, scale(n, t + 0.05))
    }
  }
  const stage: Stage = { target, radius, room, steepest: Math.min(85, pitchOf(c.pos, c.target) + MAX_STEEPER) }
  pos = settle(pos, stage)
  const fov = Math.min(80, Math.max(10, c.fov))
  if (boxes.length > 0) pos = frameSubject(pos, stage, fov, c.roll, aspect, boxes)
  return { ...c, pos, target, fov }
}

interface Stage {
  target: V3
  radius: number
  room: ArenaCollider | null
  /** 가장 가파르게 내려다보는 각(도) */
  steepest: number
}

/** 내려다보는 각(도). 올려다보면 음수 */
function pitchOf(pos: readonly number[], target: readonly number[]): number {
  const dy = pos[1]! - target[1]!
  const h = Math.hypot(pos[0]! - target[0]!, pos[2]! - target[2]!)
  return (Math.atan2(dy, h) * 180) / Math.PI
}

/** 무대 안 · 천장 아래 · 가파름 상한 · 지오메트리 앞 — 후보마다 이 순서로 거친다 */
function settle(p: V3, s: Stage): V3 {
  const { target, room } = s
  let pos = keepInArena(p, target, s.radius)
  const ceil = room ? room.ceilingAt(pos[0], pos[2]) : s.radius <= 8 ? s.radius * 0.5 : Infinity
  pos[1] = Math.max(0.15, Math.min(pos[1], ceil))
  const h = Math.hypot(pos[0] - target[0], pos[2] - target[2])
  const top = target[1] + h * Math.tan((s.steepest * Math.PI) / 180)
  if (pos[1] > top) pos[1] = Math.max(0.15, top)
  if (room) {
    const t = room.hit(target, pos)
    const d = sub(pos, target)
    // 보는 곳 바로 곁(근평면 여유 안)에서 맞으면 보는 곳이 지오메트리에 붙어 있다 — 당겨도 나아지지 않는다
    if (t !== null && t * len(d) > NEAR_MARGIN) {
      const keep = Math.max(0, t * len(d) - NEAR_MARGIN)
      pos = add(target, scale(norm(d), keep))
      pos[1] = Math.max(0.15, pos[1])
    }
  }
  return pos
}

/** 주인공이 아닌 몸이 화면을 이만큼보다 더 덮으면 안 된다 (화면 넓이 비율) */
export const MAX_COVER = 0.15

/** 다른 몸이 시선을 막으면 이만큼 어긴 것으로 친다 — 넓이 15%를 한 벌 넘긴 것과 견준다 */
const BLOCKED = 0.5

/**
 * 시선 막힘은 몸 상자의 **가운데 반**(축마다 가운데 50%)으로 잰다. 상자 모서리는 대개 빈 곳이다 — 토대부기
 * 상자는 등의 나무 끝과 꼬리 끝까지라, 통 상자로 재면 씨뿌리기의 어깨 너머 샷(나무 옆으로 상대를 본다)이
 * 다 막힌 것이 되어 화면 검사를 지키는 후보가 하나도 안 남았다(13프레임 · 넓이 0.31)
 */
function core(b: Box): Box {
  const w = [0, 1, 2].map((i) => (b.max[i]! - b.min[i]!) * 0.25)
  return {
    min: [b.min[0] + w[0]!, b.min[1] + w[1]!, b.min[2] + w[2]!],
    max: [b.max[0] - w[0]!, b.max[1] - w[1]!, b.max[2] - w[2]!],
  }
}

/**
 * 화면 검사 — 주인공 몸은 화면 안에 다 들고, 다른 몸은 화면의 `MAX_COVER` 이하만 덮고, 시선을 안 막는다.
 *
 * 주인공은 **보는 곳에 가장 가까운 몸**이다. 맞는 쪽을 겨눈 샷이면 맞는 쪽이고, BDSP가 쓴 쪽 얼굴을
 * 잡는 샷(리프스톰 앞부분)이면 쓴 쪽이다 — 「기술 대상」으로 못 박으면 그런 샷이 통째로 틀어진다.
 *
 * 못 지키면 보는 곳은 그대로 두고 카메라를 **제 시선 뒤로 물리고 · 옆으로 비키고 · 올려** 본다. 올리기는
 * `RAISE_COST`배 비싸다. 후보를 값싼 차례로 재서 지키는 첫 후보를 고른다. 지키는 것이 없으면 어긴 정도가
 * 가장 작은 것이다. 후보마다 `settle`을 거치므로 무대 지오메트리 · 천장 · 가파름 상한을 넘는 후보는 없다
 */
function frameSubject(
  pos: V3, s: Stage, fov: number, roll: number, aspect: number, boxes: readonly Box[],
): V3 {
  const { target } = s
  const subject = nearestBox(target, boxes)
  const others = boxes.filter((_, i) => i !== subject)
  const score = (p: V3): number => {
    let over = 0
    for (const b of others) {
      if (aspect > 0) over += Math.max(0, screenCover(p, target, fov, roll, aspect, b) - MAX_COVER)
      if (!inside(target, b) && segmentHits(p, target, core(b))) over += BLOCKED
    }
    if (aspect > 0 && subject >= 0 && !inFrame(p, target, fov, roll, aspect, boxes[subject]!)) over += 1
    return over
  }
  let bestOver = score(pos)
  if (bestOver === 0) return pos
  const back = norm(sub(pos, target))
  const right = norm(cross(back, [0, 1, 0]))
  let best = pos
  for (const [b, h, l] of MOVES) {
    const cand = settle(add(add(add(pos, scale(back, b)), [0, h, 0]), scale(right, l)), s)
    if (boxes.some((x) => inside(cand, grownBox(x)))) continue
    const over = score(cand)
    // 값싼 차례로 돈다 — 지키는 첫 후보가 답이고, 어긴 정도가 같으면 먼저 온 것(더 싼 것)이 남는다
    if (over < bestOver - 1e-9) { best = cand; bestOver = over }
    if (bestOver === 0) break
  }
  return best
}

/** 물리는 거리 · 올리는 높이 · 비키는 거리 (m) */
const BACK = [0, 0.5, 1, 1.5, 2, 3, 4, 5.5, 7]
const RAISE = [0, 0.4, 0.8, 1.2, 1.8, 2.5, 3.5]
const SIDE = [0, -0.8, 0.8, -1.6, 1.6, -2.6, 2.6]

/** 후보 셋(물림 · 올림 · 비킴) — 값(물림 + 비킴 + `RAISE_COST`×올림)이 싼 차례 */
const MOVES: readonly (readonly [number, number, number])[] = BACK
  .flatMap((b) => RAISE.flatMap((h) => SIDE.map((l) => [b, h, l] as const)))
  .filter(([b, h, l]) => b !== 0 || h !== 0 || l !== 0)
  .map((m) => ({ m, cost: m[0] + Math.abs(m[2]) + RAISE_COST * m[1] }))
  .sort((p, q) => p.cost - q.cost)
  .map(({ m }) => m)

function grownBox(b: Box): { min: V3; max: V3 } {
  return {
    min: [b.min[0] - MARGIN, b.min[1] - MARGIN, b.min[2] - MARGIN],
    max: [b.max[0] + MARGIN, b.max[1] + MARGIN, b.max[2] + MARGIN],
  }
}

/** 보는 곳에 가장 가까운 상자 (상자 속이면 거리 0) */
function nearestBox(p: V3, boxes: readonly Box[]): number {
  let best = -1
  let bestD = Infinity
  boxes.forEach((b, i) => {
    const d = Math.hypot(
      Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]),
      Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]),
      Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]),
    )
    if (d < bestD) { bestD = d; best = i }
  })
  return best
}

/** 카메라 축 — three `lookAt`(위 +Y) 뒤에 시선 축으로 `roll`만큼 돈 것과 같다 */
function basis(pos: V3, target: V3, roll: number): { f: V3; r: V3; u: V3 } {
  const f = norm(sub(target, pos))
  let r = cross(f, [0, 1, 0])
  if (len(r) < 1e-6) r = [1, 0, 0]
  r = norm(r)
  let u = cross(r, f)
  if (roll !== 0) {
    const c = Math.cos(roll), s = Math.sin(roll)
    const r2: V3 = add(scale(r, c), scale(u, s))
    u = add(scale(u, c), scale(r, -s))
    r = r2
  }
  return { f, r, u }
}

/** 상자 꼭짓점 여덟을 정규화 화면 좌표로. 카메라 뒤에 걸치면 `null` */
function project(pos: V3, target: V3, fov: number, roll: number, aspect: number, b: Box): [number, number][] | null {
  const { f, r, u } = basis(pos, target, roll)
  const ty = Math.tan((fov * Math.PI) / 360)
  const out: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    const p: V3 = [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]
    const v = sub(p, pos)
    const z = dot(v, f)
    if (z <= 0.05) return null
    out.push([dot(v, r) / (z * ty * aspect), dot(v, u) / (z * ty)])
  }
  return out
}

/**
 * 상자가 덮는 화면 넓이 비율 — 화면에 비친 꼭짓점 여덟의 바깥 사각형을 화면으로 잘라 잰다.
 * 카메라 뒤에 걸치면(카메라가 상자 바로 옆에 붙었다) 화면 앞에 있는 한 다 덮는 것으로 친다
 */
export function screenCover(pos: V3, target: V3, fov: number, roll: number, aspect: number, b: Box): number {
  const pts = project(pos, target, fov, roll, aspect, b)
  if (pts === null) {
    // 상자가 통째로 카메라 뒤면 0, 걸치면 1
    const { f } = basis(pos, target, roll)
    let front = 0
    for (let i = 0; i < 8; i++) {
      const p: V3 = [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]
      if (dot(sub(p, pos), f) > 0.05) front++
    }
    return front === 0 ? 0 : 1
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
  const x0 = Math.max(-1, Math.min(...xs)), x1 = Math.min(1, Math.max(...xs))
  const y0 = Math.max(-1, Math.min(...ys)), y1 = Math.min(1, Math.max(...ys))
  if (x1 <= x0 || y1 <= y0) return 0
  return ((x1 - x0) * (y1 - y0)) / 4
}

/** 상자가 화면 안에 다 드는가 */
export function inFrame(pos: V3, target: V3, fov: number, roll: number, aspect: number, b: Box): boolean {
  const pts = project(pos, target, fov, roll, aspect, b)
  return pts !== null && pts.every(([x, y]) => Math.abs(x) <= 1 && Math.abs(y) <= 1)
}

function keepInArena(p: V3, target: V3, radius: number): V3 {
  const pos: V3 = [p[0], Math.max(0.15, p[1]), p[2]]
  const lim = Math.max(2, radius - 0.5)
  const [tx, , tz] = target
  if (Math.hypot(pos[0], pos[2]) > lim) {
    const dx = pos[0] - tx, dz = pos[2] - tz
    // |t + s·d| = lim 을 0 ≤ s ≤ 1에서 푼다 — 시선을 따라 당긴다
    const a = dx * dx + dz * dz
    const b = 2 * (tx * dx + tz * dz)
    const k = tx * tx + tz * tz - lim * lim
    const disc = b * b - 4 * a * k
    if (a > 1e-9 && disc >= 0) {
      const s = Math.max(0, Math.min(1, (-b + Math.sqrt(disc)) / (2 * a)))
      pos[0] = tx + dx * s
      pos[1] = target[1] + (pos[1] - target[1]) * s
      pos[2] = tz + dz * s
    }
  }
  pos[1] = Math.max(0.15, pos[1])
  return pos
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1))

function inside(p: V3, b: { readonly min: readonly number[]; readonly max: readonly number[] }): boolean {
  return p[0] > b.min[0] && p[0] < b.max[0] && p[1] > b.min[1] && p[1] < b.max[1] && p[2] > b.min[2] && p[2] < b.max[2]
}

/** 상자 안의 점에서 방향 `n`으로 나가는 거리 */
function exitDistance(p: V3, n: V3, b: { min: V3; max: V3 }): number {
  let t = Infinity
  for (let i = 0; i < 3; i++) {
    if (Math.abs(n[i]!) < 1e-9) continue
    const edge = n[i]! > 0 ? b.max[i]! : b.min[i]!
    t = Math.min(t, (edge - p[i]!) / n[i]!)
  }
  return Number.isFinite(t) ? Math.max(0, t) : 0
}

/** 선분 a → b가 상자를 지나는가 (슬랩) */
function segmentHits(a: V3, b: V3, box: { readonly min: readonly number[]; readonly max: readonly number[] }): boolean {
  let t0 = 0, t1 = 1
  for (let i = 0; i < 3; i++) {
    const d = b[i]! - a[i]!
    if (Math.abs(d) < 1e-9) {
      if (a[i]! < box.min[i]! || a[i]! > box.max[i]!) return false
      continue
    }
    let ta = (box.min[i]! - a[i]!) / d
    let tb = (box.max[i]! - a[i]!) / d
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 > t1) return false
  }
  return true
}
