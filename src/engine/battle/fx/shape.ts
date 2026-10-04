// 모양 모듈 — 입자가 태어나는 자리와 처음 방향 (유니티 `ShapeModule`).
//
// 재 보니 BDSP 배틀 이펙트의 99.7%가 구 · 원 · 원뿔 · 모서리 · 상자 · 사각형이다.
// 메시 모양은 남은 몫에서 쓰여 점·삼각형 뽑기만 둔다.
//
// 모양 자체는 **원점 · +Z 기준**으로 뽑고(원뿔·상자·사각형이 +Z로 쏜다), 마지막에
// 모양 트랜스폼(`m_Position`·`m_Rotation`·`m_Scale`)을 한 번 씌운다. 방향도 같은
// 행렬을 지나 다시 정규화한다 — 납작하게 줄인 구는 방향도 납작한 쪽으로 쏠린다.
import type { FxRandom } from './curve'
import type { FxMesh, ShapeModule, ShapeValue } from './schema'
import { affine, trsEuler, type Affine } from './xform'

const DEG = Math.PI / 180

/** 모양 하나를 뽑을 때마다 다시 셈하지 않을 것들 */
export interface ShapePrep {
  kind: number
  m: Affine
  mesh: FxMesh | null
  /** 메시 삼각형 넓이 누적 (삼각형 뽑기) */
  areas: Float64Array | null
}

/** 모양 이름 → 번호 (굽는 쪽이 `typeName`만 줄 때) */
const KIND: Readonly<Record<string, number>> = {
  Sphere: 0, SphereShell: 1, Hemisphere: 2, HemisphereShell: 3, Cone: 4, Box: 5, Mesh: 6,
  ConeShell: 7, ConeVolume: 8, ConeVolumeShell: 9, Circle: 10, CircleEdge: 11,
  SingleSidedEdge: 12, MeshRenderer: 13, SkinnedMeshRenderer: 14, BoxShell: 15, BoxEdge: 16,
  Donut: 17, Rectangle: 18,
}

export function prepShape(s: ShapeModule): ShapePrep {
  const kind = s.type ?? (s.typeName !== undefined ? KIND[s.typeName] ?? 0 : 0)
  const m = trsEuler(s.m_Position, s.m_Rotation, s.m_Scale, affine())
  const mesh = s.mesh && s.mesh.positions.length >= 3 ? s.mesh : null
  let areas: Float64Array | null = null
  if (mesh && mesh.indices.length >= 3) {
    const p = mesh.positions
    const ix = mesh.indices
    areas = new Float64Array(Math.floor(ix.length / 3))
    let acc = 0
    for (let t = 0; t < areas.length; t++) {
      const a = ix[t * 3]! * 3, b = ix[t * 3 + 1]! * 3, c = ix[t * 3 + 2]! * 3
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
      acc += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
      areas[t] = acc
    }
  }
  return { kind, m, mesh, areas }
}

/** 한 번 뽑을 때의 사정 — 「버스트에 고르게」와 「돌기」 모드가 본다 */
export interface ShapeContext {
  /** 이 버스트에서 몇 번째인가 */
  index: number
  /** 이 버스트가 모두 몇인가 (버스트가 아니면 1) */
  count: number
  /** 시스템 시간(초) */
  time: number
}

/**
 * `arc`·`radius`의 0~1 자리를 고른다.
 *
 * - 0 무작위 · 1 돌기(초당 `speed` 바퀴) · 2 왕복 · 3 버스트에 고르게
 * - `spread`가 있으면 그 간격으로 끊는다 (0.25면 네 자리에서만)
 */
export function pickParam(v: ShapeValue | undefined, rng: FxRandom, ctx: ShapeContext): number {
  const mode = v?.mode ?? 0
  let p: number
  if (mode === 3) p = ctx.count > 0 ? ctx.index / ctx.count : 0
  else if (mode === 1 || mode === 2) {
    const sp = v?.speed?.const ?? 1
    const raw = ctx.time * sp
    if (mode === 1) p = raw - Math.floor(raw)
    else {
      const k = raw - 2 * Math.floor(raw / 2)
      p = k <= 1 ? k : 2 - k
    }
  } else p = rng.next()
  const spread = v?.spread ?? 0
  if (spread > 0) p = Math.floor(p / spread) * spread
  return p
}

/**
 * 한 입자의 자리와 방향을 뽑는다 (모양 공간 → 시스템 공간).
 *
 * @param pos 자리 (길이 3)
 * @param dir 정규화된 방향 (길이 3)
 */
export function sampleShape(
  s: ShapeModule, prep: ShapePrep, rng: FxRandom, ctx: ShapeContext,
  pos: Float64Array, dir: Float64Array,
): void {
  const r = s.radius?.value ?? 1
  const thick = s.radiusThickness ?? 1
  const arc = (s.arc?.value ?? 360) * DEG
  let px = 0, py = 0, pz = 0, dx = 0, dy = 0, dz = 1
  switch (prep.kind) {
    case 0: case 1: case 2: case 3: {
      // 구 · 반구. 두께 0이면 겉면만, 1이면 속까지 고르게 (부피 고르게 = 세제곱근)
      const shell = prep.kind === 1 || prep.kind === 3
      unitVector(rng, dir)
      if (prep.kind >= 2 && dir[2]! < 0) dir[2] = -dir[2]!
      const t = shell ? 0 : thick
      const inner = 1 - t
      const f = Math.cbrt(inner * inner * inner + (1 - inner * inner * inner) * rng.next())
      dx = dir[0]!; dy = dir[1]!; dz = dir[2]!
      px = dx * r * f; py = dy * r * f; pz = dz * r * f
      break
    }
    case 4: case 7: case 8: case 9: {
      // 원뿔. 바닥 원 위에서 뽑고, 바깥쪽일수록 `angle`만큼 벌어진다
      const shell = prep.kind === 7 || prep.kind === 9
      const phi = pickParam(s.arc, rng, ctx) * arc
      const f = shell ? 1 : discRadius(rng, thick)
      const a = (s.angle ?? 25) * DEG * f
      dx = Math.sin(a) * Math.cos(phi); dy = Math.sin(a) * Math.sin(phi); dz = Math.cos(a)
      px = r * f * Math.cos(phi); py = r * f * Math.sin(phi); pz = 0
      if (prep.kind === 8 || prep.kind === 9) {
        const l = (s.length ?? 5) * rng.next()
        px += dx * l; py += dy * l; pz += dz * l
      }
      break
    }
    case 5: case 15: case 16: {
      // 상자 (한 변 1, 크기는 `m_Scale`이 준다). 방향은 +Z
      if (prep.kind === 5) {
        px = rng.next() - 0.5; py = rng.next() - 0.5; pz = rng.next() - 0.5
      } else if (prep.kind === 15) {
        // 겉면: 면 하나를 골라 그 면 위에서
        const face = Math.floor(rng.next() * 6)
        const u = rng.next() - 0.5, v = rng.next() - 0.5, w = face % 2 === 0 ? -0.5 : 0.5
        const axis = face >> 1
        if (axis === 0) { px = w; py = u; pz = v } else if (axis === 1) { px = u; py = w; pz = v } else { px = u; py = v; pz = w }
      } else {
        // 모서리: 열둘 중 하나
        const e = Math.floor(rng.next() * 12)
        const u = rng.next() - 0.5
        const a = e & 1 ? 0.5 : -0.5, b = e & 2 ? 0.5 : -0.5
        const axis = e >> 2
        if (axis === 0) { px = u; py = a; pz = b } else if (axis === 1) { px = a; py = u; pz = b } else { px = a; py = b; pz = u }
      }
      dx = 0; dy = 0; dz = 1
      break
    }
    case 10: case 11: case 17: {
      // 원 (XY 평면). 방향은 바깥쪽
      const phi = pickParam(s.arc, rng, ctx) * arc
      const f = prep.kind === 10 ? discRadius(rng, thick) : 1
      dx = Math.cos(phi); dy = Math.sin(phi); dz = 0
      px = dx * r * f; py = dy * r * f; pz = 0
      if (prep.kind === 17) {
        // 도넛: 원 둘레에 관(반지름 `donutRadius`)을 두른다
        const tr = (s.donutRadius ?? 0.2) * discRadius(rng, thick)
        const th = rng.next() * Math.PI * 2
        px += dx * tr * Math.cos(th); py += dy * tr * Math.cos(th); pz = tr * Math.sin(th)
      }
      break
    }
    case 12: {
      // 한쪽 모서리: X축 위 [−r, r]. 방향은 +Y
      const p = pickParam(s.radius, rng, ctx)
      px = -r + 2 * r * p; py = 0; pz = 0
      dx = 0; dy = 1; dz = 0
      break
    }
    case 18: {
      // 사각형 (XY 평면, 한 변 1). 방향은 +Z
      px = rng.next() - 0.5; py = rng.next() - 0.5; pz = 0
      dx = 0; dy = 0; dz = 1
      break
    }
    case 6: case 13: case 14: {
      const got = sampleMesh(s, prep, rng)
      px = got[0]; py = got[1]; pz = got[2]; dx = got[3]; dy = got[4]; dz = got[5]
      break
    }
    default:
      break
  }

  // 자리 흔들기 · 방향 섞기 — 모양 공간에서 한다
  const rp = s.randomPositionAmount ?? 0
  if (rp > 0) {
    px += (rng.next() * 2 - 1) * rp; py += (rng.next() * 2 - 1) * rp; pz += (rng.next() * 2 - 1) * rp
  }
  const sph = s.sphericalDirectionAmount ?? 0
  if (sph > 0) {
    const n = Math.hypot(px, py, pz)
    if (n > 1e-9) {
      dx += (px / n - dx) * sph; dy += (py / n - dy) * sph; dz += (pz / n - dz) * sph
    }
  }
  const rd = s.randomDirectionAmount ?? 0
  if (rd > 0) {
    unitVector(rng, dir)
    dx += (dir[0]! - dx) * rd; dy += (dir[1]! - dy) * rd; dz += (dir[2]! - dz) * rd
  }

  const m = prep.m
  pos[0] = m.r[0]! * px + m.r[1]! * py + m.r[2]! * pz + m.t[0]!
  pos[1] = m.r[3]! * px + m.r[4]! * py + m.r[5]! * pz + m.t[1]!
  pos[2] = m.r[6]! * px + m.r[7]! * py + m.r[8]! * pz + m.t[2]!
  const ox = m.r[0]! * dx + m.r[1]! * dy + m.r[2]! * dz
  const oy = m.r[3]! * dx + m.r[4]! * dy + m.r[5]! * dz
  const oz = m.r[6]! * dx + m.r[7]! * dy + m.r[8]! * dz
  const n = Math.hypot(ox, oy, oz)
  if (n > 1e-12) {
    dir[0] = ox / n; dir[1] = oy / n; dir[2] = oz / n
  } else {
    dir[0] = 0; dir[1] = 0; dir[2] = 1
  }
}

/** 원판 위 반지름 비율. 두께 0 = 테두리, 1 = 넓이 고르게(제곱근) */
function discRadius(rng: FxRandom, thick: number): number {
  const inner = 1 - thick
  return Math.sqrt(inner * inner + (1 - inner * inner) * rng.next())
}

/** 단위 구 위 고르게 */
function unitVector(rng: FxRandom, out: Float64Array): void {
  const z = rng.next() * 2 - 1
  const a = rng.next() * Math.PI * 2
  const s = Math.sqrt(1 - z * z)
  out[0] = s * Math.cos(a); out[1] = s * Math.sin(a); out[2] = z
}

const meshOut: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 1]

/** 메시 모양: 0 점 · 1 모서리(점으로 대신) · 2 삼각형(넓이 가중) */
function sampleMesh(s: ShapeModule, prep: ShapePrep, rng: FxRandom): typeof meshOut {
  const mesh = prep.mesh
  if (!mesh) { meshOut.fill(0); meshOut[5] = 1; return meshOut }
  const p = mesh.positions
  const nrm = mesh.normals
  const ix = mesh.indices
  if ((s.placementMode ?? 0) === 2 && prep.areas && prep.areas.length > 0) {
    const total = prep.areas[prep.areas.length - 1]!
    const want = rng.next() * total
    let lo = 0, hi = prep.areas.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (prep.areas[mid]! < want) lo = mid + 1
      else hi = mid
    }
    let u = rng.next(), v = rng.next()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    const w = 1 - u - v
    const a = ix[lo * 3]!, b = ix[lo * 3 + 1]!, c = ix[lo * 3 + 2]!
    for (let k = 0; k < 3; k++) {
      meshOut[k] = p[a * 3 + k]! * w + p[b * 3 + k]! * u + p[c * 3 + k]! * v
      meshOut[3 + k] = nrm ? nrm[a * 3 + k]! * w + nrm[b * 3 + k]! * u + nrm[c * 3 + k]! * v : 0
    }
  } else {
    const i = Math.floor(rng.next() * (p.length / 3))
    for (let k = 0; k < 3; k++) {
      meshOut[k] = p[i * 3 + k]!
      meshOut[3 + k] = nrm ? nrm[i * 3 + k]! : 0
    }
  }
  if (Math.hypot(meshOut[3], meshOut[4], meshOut[5]) < 1e-9) {
    const n = Math.hypot(meshOut[0], meshOut[1], meshOut[2]) || 1
    meshOut[3] = meshOut[0] / n; meshOut[4] = meshOut[1] / n; meshOut[5] = meshOut[2] / n || 1
  }
  return meshOut
}
