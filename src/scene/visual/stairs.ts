// 내려가는 계단 우물을 입체 계단으로 (파일럿 보고 ⑦ · REPAIR §67)
//
// 원작의 내려가는 계단(`stair01` · 소품 105·156)은 **난간 + 우물**인데, 우물 안이
//
//   · 계단 그림을 그린 **비탈 한 장** (삼각형 넷 · 51° · 노란 디딤 넷이 그려져 있다)
//   · 비탈 양옆의 **세모 벽 둘** · 비탈 끝의 **네모 벽 하나** — 셋 다 어두운 한 텍셀
//
// 이 전부다. 원작 카메라는 위에서 내려다보는 고정 각이라 이것이 「그늘로 내려가는 계단」
// 으로 읽힌다. 우리 3인칭 카메라는 낮아서 비탈은 판 한 장으로, 끝의 네모 벽은 **계단 위에
// 선 어두운 판때기**로 보인다 — 파일럿이 본 것이 그것이다.
//
// 그래서 비탈과 벽 셋을 **디딤·챌면이 있는 계단**과 **계단꼴 옆벽**으로 바꾸고, 안으로
// 갈수록 어둡게 한다. 끝은 거의 검다 — 원작이 그 벽을 어둡게 칠한 뜻(그 아래는 안 보인다)
// 을 판 한 장 대신 깊이로 옮긴 것이다.
//
// ⚠️ **새 색이 없다.** 디딤·챌면·벽은 원작 그림의 그 텍셀을 그대로 찍는다(UV로 가리킨다).
// 어둡게 하는 것은 정점 색뿐이다.
//
// ⚠️ **바닥·충돌·높이를 안 건드린다.** 우물은 원작 모델 안에 이미 있고, 계단은 그
// 우물 상자 안에만 선다. 주인공은 계단 앞 워프 칸에서 1층으로 넘어가므로 계단을 밟지
// 않는다.
import { BufferAttribute, BufferGeometry } from 'three'
import type { ChunkMesh, TexSheet } from '../chunkMesh'
import { stairRampClaims } from './propPlan'
import type { RecipeMode } from './resolve'
import type { VisualRecipe } from './types'

/**
 * 비탈 윗변이 이보다 높으면 **올라가는** 계단이다 — 안 건드린다.
 *
 * 내려가는 계단은 윗변이 바닥(y ≈ −0.06)에 있고, 올라가는 계단(소품 104·155)은 비탈이
 * 바닥에서 2.4까지 오른다. 파일럿도 올라가는 쪽은 멀쩡하다고 했다
 */
const FLOOR_TOP = 0.05

/** 좌표 비교 여유 (타일) */
const EPS = 0.02

/**
 * 우물 끝의 밝기 — 정점 색에 곱한다. 윗변이 1이고 끝으로 갈수록 이리로 곧게 줄어든다.
 *
 * 원작 값이 아니다(초기값). 원작 끝 벽의 텍셀 `#6b6b84`에 정점 색 0.71을 곱하면 이미
 * 밝기 0.3 언저리이고, 여기서 더 내려 **우물 밖의 빈 곳(#000001)과 이어지게** 한다
 */
const DEEPEST = 0.08

interface PropStairs {
  /** 몸통에서 접어 뺄 원본 삼각형 (비탈 + 우물 벽) → 레시피 번호 */
  claims: Map<number, string>
  /** 새 계단. 모델 좌표 · 원본 비탈과 같은 재질 칸 */
  geometry: BufferGeometry
  /** 디딤 수 — 원본 그림에 그려진 디딤을 센 것이다 */
  steps: number
}

type V3 = [number, number, number]

/**
 * 그림 칸 한 줄에서 **디딤 색이 몇 번 끊겨 나오나**. 원작 비탈이 그리는 계단 수가 그것이다.
 *
 * 디딤 색은 그 줄에서 가장 많이 찍힌 색이다 (`#ffd663` × 4텍셀 × 4). 챌면 색은 첫 디딤
 * 바로 앞 텍셀이다 (`#b59c63`)
 */
function countTreads(
  sheet: TexSheet, item: { x: number, y: number, w: number, h: number },
  c0: number, c1: number, row: number,
): { steps: number, tread: number, riser: number | null } | null {
  const at = (c: number) => {
    const o = ((item.y + row) * sheet.width + item.x + c) * 4
    return (sheet.pixels[o]! << 16) | (sheet.pixels[o + 1]! << 8) | sheet.pixels[o + 2]!
  }
  const tally = new Map<number, number>()
  for (let c = c0; c < c1; c++) tally.set(at(c), (tally.get(at(c)) ?? 0) + 1)
  const top = [...tally].sort((a, b) => b[1] - a[1])[0]
  if (top === undefined) return null
  const treadColor = top[0]
  let steps = 0, first = -1
  for (let c = c0; c < c1; c++) {
    if (at(c) !== treadColor) continue
    if (c === c0 || at(c - 1) !== treadColor) {
      steps++
      if (first < 0) first = c
    }
  }
  // 한 디딤의 가운데 텍셀
  let end = first
  while (end + 1 < c1 && at(end + 1) === treadColor) end++
  return { steps, tread: Math.floor((first + end) / 2), riser: first > c0 ? first - 1 : null }
}

/**
 * 내려가는 계단 소품의 비탈·우물 벽을 입체 계단으로. 맞는 레시피가 없거나 올라가는
 * 계단이면 null
 */
export function propStairs(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): PropStairs | null {
  if (sheet === null) return null
  const ramp = stairRampClaims(mesh, sheet, assetId, recipes, mode)
  if (ramp.size === 0) return null
  const geometry = mesh.geometry
  const idx = geometry.getIndex()!.array
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const col = geometry.getAttribute('color') as BufferAttribute | undefined
  const p = (v: number): V3 => [pos.getX(v), pos.getY(v), pos.getZ(v)]
  const groupOf = (t: number) => mesh.groups.findIndex(([, s, c]) => t >= s && t < s + c)

  const rampTris = [...ramp.keys()]
  const group = groupOf(rampTris[0]!)
  if (group < 0 || rampTris.some((t) => groupOf(t) !== group)) return null
  const id = ramp.get(rampTris[0]!)!

  const verts = [...new Set(rampTris.flatMap((t) => [idx[t]!, idx[t + 1]!, idx[t + 2]!]))]
  const ys = verts.map((v) => pos.getY(v))
  const top = Math.max(...ys), bottom = Math.min(...ys)
  if (top > FLOOR_TOP || !(top - bottom > 0.1)) return null

  // 틀 — 윗변 가운데에서 아랫변 쪽이 d, 그에 직각인 가로가 w
  const mid = (list: number[]): V3 => {
    const s: V3 = [0, 0, 0]
    for (const v of list) { const q = p(v); s[0] += q[0] / list.length; s[1] += q[1] / list.length; s[2] += q[2] / list.length }
    return s
  }
  const upper = mid(verts.filter((v) => pos.getY(v) > top - 1e-3))
  const lower = mid(verts.filter((v) => pos.getY(v) < bottom + 1e-3))
  let dx = lower[0] - upper[0], dz = lower[2] - upper[2]
  const run = Math.hypot(dx, dz)
  if (!(run > 0.1)) return null
  dx /= run; dz /= run
  const wx = -dz, wz = dx
  const sOf = (q: V3) => (q[0] - upper[0]) * dx + (q[2] - upper[2]) * dz
  const wOf = (q: V3) => (q[0] - upper[0]) * wx + (q[2] - upper[2]) * wz
  const ws = verts.map((v) => wOf(p(v)))
  const w0 = Math.min(...ws), w1 = Math.max(...ws)

  /**
   * ⚠️ **우물 벽은 선택자로 못 잡는다.** 세 벽이 모두 **한 텍셀 줄**(v 고정)을 찍어서
   * UV 칸의 높이가 0이고, `footprintWithin`은 넓이 0인 칸을 안 센다. 그래서 모양으로
   * 고른다 — 비탈과 같은 서브메시에서, **선 삼각형**이면서 꼭짓점이 전부 비탈의 발자국
   * 안(s 0~run · w w0~w1)에 있고 비탈 윗변보다 높지 않은 것. 소품 156에서 삼각형 여덟
   * (#36~#41 · #44 · #45)이 걸리고, 난간 치마(y 0.25까지)와 윗참(#42·#43, 발자국 밖)은
   * 안 걸린다
   */
  const walls: number[] = []
  const [, gStart, gCount] = mesh.groups[group]!
  for (let t = gStart; t < gStart + gCount; t += 3) {
    if (ramp.has(t)) continue
    const q = [p(idx[t]!), p(idx[t + 1]!), p(idx[t + 2]!)]
    const a = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]]
    const b = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]]
    const n = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
    const len = Math.hypot(n[0]!, n[1]!, n[2]!)
    if (!(len > 1e-9) || Math.abs(n[1]! / len) > 0.02) continue
    const inside = q.every((c) => {
      const s = sOf(c), w = wOf(c)
      return s > -EPS && s < run + EPS && w > w0 - EPS && w < w1 + EPS
        && c[1] < top + 1e-3 && c[1] > bottom - EPS
    })
    if (inside) walls.push(t)
  }
  if (walls.length === 0) return null

  // 찍을 텍셀 — 디딤·챌면은 비탈이 쓰던 칸에서, 벽은 원래 벽이 찍던 자리 그대로
  const m = mesh.materials[group]!
  const item = sheet.items.find((s) => s.tex === m.tex && s.pal === (m.pal ?? '')) ?? null
  if (item === null) return null
  const us = verts.map((v) => uv.getX(v)), vs = verts.map((v) => uv.getY(v))
  const u0 = Math.min(...us), u1 = Math.max(...us)
  const vMid = (Math.min(...vs) + Math.max(...vs)) / 2
  const c0 = Math.max(0, Math.floor(u0 * item.w + 1e-6)), c1 = Math.min(item.w, Math.ceil(u1 * item.w - 1e-6))
  const row = Math.min(item.h - 1, Math.max(0, Math.floor(vMid * item.h)))
  const read = countTreads(sheet, item, c0, c1, row)
  if (read === null || read.steps < 2) return null
  const steps = read.steps
  const treadUv: [number, number] = [(read.tread + 0.5) / item.w, vMid]
  const riserUv: [number, number] = read.riser === null ? treadUv : [(read.riser + 0.5) / item.w, vMid]
  const wallVerts = [...new Set(walls.flatMap((t) => [idx[t]!, idx[t + 1]!, idx[t + 2]!]))]
  const wallUv: [number, number] = [
    wallVerts.reduce((s, v) => s + uv.getX(v), 0) / wallVerts.length,
    wallVerts.reduce((s, v) => s + uv.getY(v), 0) / wallVerts.length,
  ]
  // 원본 비탈의 정점 색 (롬이 구운 음영 — 소품 156은 0.71 한 값이다)
  const base = col === undefined ? 1 : verts.reduce((s, v) => s + col.getX(v), 0) / verts.length

  const position: number[] = [], normal: number[] = [], texcoord: number[] = [], color: number[] = []
  const at = (s: number, w: number, y: number): V3 =>
    [upper[0] + dx * s + wx * w, y, upper[2] + dz * s + wz * w]
  const shade = (s: number) => base * (1 - (1 - DEEPEST) * Math.min(1, Math.max(0, s / run)))
  /** 네 모서리 (s, w, y) — 그 면이 `n` 쪽을 보게 감는다 */
  const quad = (corners: [number, number, number][], n: V3, tex: [number, number]) => {
    const q = corners.map(([s, w, y]) => at(s, w, y))
    const e1 = [q[1]![0] - q[0]![0], q[1]![1] - q[0]![1], q[1]![2] - q[0]![2]]
    const e2 = [q[2]![0] - q[0]![0], q[2]![1] - q[0]![1], q[2]![2] - q[0]![2]]
    const c = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]
    const order = c[0]! * n[0] + c[1]! * n[1] + c[2]! * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
    for (const k of order) {
      position.push(...q[k]!)
      normal.push(...n)
      texcoord.push(...tex)
      const g = shade(corners[k]![0])
      color.push(g, g, g)
    }
  }
  const rise = (top - bottom) / steps, tread = run / steps
  const back: V3 = [-dx, 0, -dz]
  const up: V3 = [0, 1, 0]
  const inW0: V3 = [wx, 0, wz], inW1: V3 = [-wx, 0, -wz]
  for (let i = 0; i < steps; i++) {
    const s0 = i * tread, s1 = (i + 1) * tread
    const yUp = top - i * rise, yDown = top - (i + 1) * rise
    // 챌면 — 올라오는 쪽을 본다
    quad([[s0, w0, yUp], [s0, w1, yUp], [s0, w1, yDown], [s0, w0, yDown]], back, riserUv)
    // 디딤
    quad([[s0, w0, yDown], [s1, w0, yDown], [s1, w1, yDown], [s0, w1, yDown]], up, treadUv)
    // 옆벽 — 이 디딤에서 바닥 높이까지. 계단꼴이라 원작 세모 벽이 남기던 틈이 없다
    quad([[s0, w0, yDown], [s1, w0, yDown], [s1, w0, top], [s0, w0, top]], inW0, wallUv)
    quad([[s0, w1, yDown], [s1, w1, yDown], [s1, w1, top], [s0, w1, top]], inW1, wallUv)
  }
  // 끝 벽 — 가장 깊은 자리라 거의 검다
  quad([[run, w0, top], [run, w1, top], [run, w1, bottom], [run, w0, bottom]], back, wallUv)

  const made = new BufferGeometry()
  made.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  made.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
  made.setAttribute('uv', new BufferAttribute(new Float32Array(texcoord), 2))
  made.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  made.addGroup(0, position.length / 3, group)
  made.computeBoundingSphere()

  const claims = new Map(ramp)
  for (const t of walls) claims.set(t, id)
  return { claims, geometry: made, steps }
}
