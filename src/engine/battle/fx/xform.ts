// 이펙트 쪽 작은 선형대수 — 3×3 행렬과 아핀 변환.
//
// three를 안 쓰는 이유는 둘이다. 시뮬레이션이 **유니티 좌표**에서 돌아 three의
// 오일러 차례(XYZ)를 그대로 쓰면 틀리고, 입자마다 부르는 자리라 객체를 안 만든다.
// 행렬은 **행 우선** 9칸이다: `m[r * 3 + c]`.
import type { V3 } from './schema'

export type M3 = Float64Array
/** 아핀 변환: `p' = r · p + t` (r에 회전·크기가 함께 든다) */
export interface Affine {
  r: M3
  t: Float64Array
}

export function m3(): M3 {
  const m = new Float64Array(9)
  m[0] = 1; m[4] = 1; m[8] = 1
  return m
}

export function affine(): Affine {
  return { r: m3(), t: new Float64Array(3) }
}

/** `out = a · b`. out이 a·b와 같아도 된다 */
function mul3(a: M3, b: M3, out: M3): M3 {
  const a0 = a[0]!, a1 = a[1]!, a2 = a[2]!, a3 = a[3]!, a4 = a[4]!, a5 = a[5]!, a6 = a[6]!, a7 = a[7]!, a8 = a[8]!
  const b0 = b[0]!, b1 = b[1]!, b2 = b[2]!, b3 = b[3]!, b4 = b[4]!, b5 = b[5]!, b6 = b[6]!, b7 = b[7]!, b8 = b[8]!
  out[0] = a0 * b0 + a1 * b3 + a2 * b6
  out[1] = a0 * b1 + a1 * b4 + a2 * b7
  out[2] = a0 * b2 + a1 * b5 + a2 * b8
  out[3] = a3 * b0 + a4 * b3 + a5 * b6
  out[4] = a3 * b1 + a4 * b4 + a5 * b7
  out[5] = a3 * b2 + a4 * b5 + a5 * b8
  out[6] = a6 * b0 + a7 * b3 + a8 * b6
  out[7] = a6 * b1 + a7 * b4 + a8 * b7
  out[8] = a6 * b2 + a7 * b5 + a8 * b8
  return out
}

/** `out = m · (x, y, z)`. out은 길이 3 이상, `o`번째 칸부터 적는다 */
export function apply3(m: M3, x: number, y: number, z: number, out: Float64Array | Float32Array | number[], o = 0): void {
  out[o] = m[0]! * x + m[1]! * y + m[2]! * z
  out[o + 1] = m[3]! * x + m[4]! * y + m[5]! * z
  out[o + 2] = m[6]! * x + m[7]! * y + m[8]! * z
}

/** 회전 사원수(xyzw) → 행렬 */
function quatM3(q: readonly number[], out: M3): M3 {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!
  const n = Math.hypot(x, y, z, w) || 1
  const X = x / n, Y = y / n, Z = z / n, W = w / n
  out[0] = 1 - 2 * (Y * Y + Z * Z); out[1] = 2 * (X * Y - Z * W); out[2] = 2 * (X * Z + Y * W)
  out[3] = 2 * (X * Y + Z * W); out[4] = 1 - 2 * (X * X + Z * Z); out[5] = 2 * (Y * Z - X * W)
  out[6] = 2 * (X * Z - Y * W); out[7] = 2 * (Y * Z + X * W); out[8] = 1 - 2 * (X * X + Y * Y)
  return out
}

/**
 * 유니티 오일러(라디안) → 행렬. **Z → X → Y 차례로 돈다**: `R = Ry · Rx · Rz`.
 *
 * 유니티가 `Quaternion.Euler`·입자 3D 회전에 쓰는 차례다. 공식 자체는 오른손과
 * 같은 꼴이다 — 손잡이는 좌표의 뜻이지 행렬 숫자를 바꾸지 않는다
 */
export function eulerM3(x: number, y: number, z: number, out: M3): M3 {
  const cx = Math.cos(x), sx = Math.sin(x)
  const cy = Math.cos(y), sy = Math.sin(y)
  const cz = Math.cos(z), sz = Math.sin(z)
  // Ry · Rx
  const a0 = cy, a1 = sy * sx, a2 = sy * cx
  const a3 = 0, a4 = cx, a5 = -sx
  const a6 = -sy, a7 = cy * sx, a8 = cy * cx
  // (Ry · Rx) · Rz
  out[0] = a0 * cz + a1 * sz; out[1] = -a0 * sz + a1 * cz; out[2] = a2
  out[3] = a3 * cz + a4 * sz; out[4] = -a3 * sz + a4 * cz; out[5] = a5
  out[6] = a6 * cz + a7 * sz; out[7] = -a6 * sz + a7 * cz; out[8] = a8
  return out
}

const DEG = Math.PI / 180

/** 위치 · 오일러(도) · 크기로 아핀을 만든다 (모양 모듈의 `m_Position`·`m_Rotation`·`m_Scale`) */
export function trsEuler(p: V3 | undefined, eulerDeg: V3 | undefined, s: V3 | undefined, out: Affine): Affine {
  eulerM3((eulerDeg?.[0] ?? 0) * DEG, (eulerDeg?.[1] ?? 0) * DEG, (eulerDeg?.[2] ?? 0) * DEG, out.r)
  scaleCols(out.r, s)
  out.t[0] = p?.[0] ?? 0; out.t[1] = p?.[1] ?? 0; out.t[2] = p?.[2] ?? 0
  return out
}

/** 위치 · 사원수 · 크기로 아핀을 만든다 (노드 트랜스폼) */
export function trsQuat(p: V3 | undefined, q: readonly number[] | undefined, s: V3 | undefined, out: Affine): Affine {
  quatM3(q ?? [0, 0, 0, 1], out.r)
  scaleCols(out.r, s)
  out.t[0] = p?.[0] ?? 0; out.t[1] = p?.[1] ?? 0; out.t[2] = p?.[2] ?? 0
  return out
}

function scaleCols(m: M3, s: V3 | undefined): void {
  const sx = s?.[0] ?? 1, sy = s?.[1] ?? 1, sz = s?.[2] ?? 1
  m[0]! *= sx; m[3]! *= sx; m[6]! *= sx
  m[1]! *= sy; m[4]! *= sy; m[7]! *= sy
  m[2]! *= sz; m[5]! *= sz; m[8]! *= sz
}

/** `out = a ∘ b` (b 먼저) */
export function compose(a: Affine, b: Affine, out: Affine): Affine {
  const t0 = a.r[0]! * b.t[0]! + a.r[1]! * b.t[1]! + a.r[2]! * b.t[2]! + a.t[0]!
  const t1 = a.r[3]! * b.t[0]! + a.r[4]! * b.t[1]! + a.r[5]! * b.t[2]! + a.t[1]!
  const t2 = a.r[6]! * b.t[0]! + a.r[7]! * b.t[1]! + a.r[8]! * b.t[2]! + a.t[2]!
  mul3(a.r, b.r, out.r)
  out.t[0] = t0; out.t[1] = t1; out.t[2] = t2
  return out
}

export function copyAffine(src: Affine, out: Affine): Affine {
  out.r.set(src.r)
  out.t.set(src.t)
  return out
}

/** 3×3 역행렬. 특이하면 단위행렬 */
function invert3(m: M3, out: M3): M3 {
  const a = m[0]!, b = m[1]!, c = m[2]!, d = m[3]!, e = m[4]!, f = m[5]!, g = m[6]!, h = m[7]!, i = m[8]!
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-20) {
    out.fill(0); out[0] = 1; out[4] = 1; out[8] = 1
    return out
  }
  const k = 1 / det
  out[0] = A * k; out[1] = -(b * i - c * h) * k; out[2] = (b * f - c * e) * k
  out[3] = B * k; out[4] = (a * i - c * g) * k; out[5] = -(a * f - c * d) * k
  out[6] = C * k; out[7] = -(a * h - b * g) * k; out[8] = (a * e - b * d) * k
  return out
}

export function invertAffine(m: Affine, out: Affine): Affine {
  invert3(m.r, out.r)
  const x = -m.t[0]!, y = -m.t[1]!, z = -m.t[2]!
  const r = out.r
  out.t[0] = r[0]! * x + r[1]! * y + r[2]! * z
  out.t[1] = r[3]! * x + r[4]! * y + r[5]! * z
  out.t[2] = r[6]! * x + r[7]! * y + r[8]! * z
  return out
}

/** 크기를 뺀 회전만 (열마다 정규화). 크기가 0인 열은 단위 축으로 */
export function rotationOnly(m: M3, out: M3): M3 {
  for (let c = 0; c < 3; c++) {
    const x = m[c]!, y = m[3 + c]!, z = m[6 + c]!
    const n = Math.hypot(x, y, z)
    if (n < 1e-12) {
      out[c] = c === 0 ? 1 : 0; out[3 + c] = c === 1 ? 1 : 0; out[6 + c] = c === 2 ? 1 : 0
    } else {
      out[c] = x / n; out[3 + c] = y / n; out[6 + c] = z / n
    }
  }
  return out
}

/** 크기의 대표값 — 세 열 길이의 평균 (입자 크기에 곱한다) */
export function meanScale(m: M3): number {
  return (Math.hypot(m[0]!, m[3]!, m[6]!) + Math.hypot(m[1]!, m[4]!, m[7]!) + Math.hypot(m[2]!, m[5]!, m[8]!)) / 3
}
