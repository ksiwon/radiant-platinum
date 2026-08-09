// 오려 낸 판에 두께를 준다 — 울타리·표지판·덤불 (DATA.md §2.2)
//
// 판때기인 것이 나무만이 아니다. 원작 울타리는 **사각형 한 장**이고, 고정 3/4
// 카메라를 보고 45°로 눕혀 그려 놓았다. `plates.standCutouts`가 그것을 세우지만
// 세워도 여전히 **종잇장**이다 — 옆에서 보면 선 하나로 사라지고, 1인칭으로
// 울타리를 따라 걸으면 담이 있다 없다 한다.
//
// ⚠️ **울타리 모양을 우리가 지어내면 안 된다.** 말뚝 몇 개에 가로대 두 줄이라고
// 짐작해 만들면 그건 우리 울타리다. 원작 그림에 이미 다 들어 있다:
//
//   `imped` 위쪽 (64×64 중 y 0~14)
//     ..####....####....####....####..   ← 말뚝 (폭 4텍셀, 간격 8)
//     ################################   ← 가로대 (y 6~9)
//     ..####....####....####....####..
//     ################################   ← 가로대 (y 12~13)
//
// 그래서 **그림의 실루엣을 그대로 밀어낸다.** 불투명한 데와 투명한 데의 경계를
// 따라 옆면을 세우면, 말뚝은 말뚝대로 가로대는 가로대대로 두께가 생긴다. 어느
// 것이 말뚝인지 우리가 고를 일이 없다.
//
// 원래 판은 **그 자리에 그대로 둔다.** 앞뒤 사본을 따로 만들면 같은 그림이 세
// 겹이 된다 — 판을 가운데 두고 둘레만 세우면, 두께가 한 텍셀이라 가운데에
// 떠 있는 것이 보이지 않는다. 삼각형도 실루엣 길이에만 비례한다.
import { BufferAttribute, BufferGeometry } from 'three'
import type { ChunkMesh, TexSheet } from './chunkMesh'
import { isBakedShadow, isFoliage } from './plates'

/** 알파 판정 문턱. 재질이 쓰는 `alphaTest: 0.5`와 같은 자리다 */
const ALPHA_CUT = 128

/**
 * 옆면의 두께 — **한 텍셀**.
 *
 * 고정 상수가 아니라 그 판 자신의 눈금이다. `imped` 울타리 한 장이 1타일 폭에
 * 8텍셀이라 한 텍셀이 0.125타일이고, 그것이 곧 원작 그림이 표현할 수 있는
 * 제일 얇은 것이다. 널판 두께로도 그럴듯한 값이 여기서 저절로 나온다
 */
const SHELL_TEXELS = 1

/**
 * 그림 한 장을 텍셀 격자로 훑을 때의 상한.
 *
 * UV가 반복하는 판이 있다 — `area07_hei_b`는 u가 −6.75~7.75라 928텍셀이다.
 * 그런 판은 오버월드에 열두 삼각형뿐이라 성기게 훑어도 손해가 없다
 */
const MAX_GRID = 128

/**
 * **서 있는 판에만 붙인다.**
 *
 * ⚠️ 오려 낸 그림이 곧 판때기인 것이 아니다. 바닷가 거품(`seaside3`)·바위
 * 가장자리(`searock`)·화단(`t3_fl_*`)은 **땅에 깔린 지형**인데 알파가 뚫려 있어
 * 같은 잣대에 걸린다. 거기에 옆면을 세우면 땅바닥 무늬마다 1텍셀짜리 턱이
 * 생기고, 실측으로 삼각형이 769,340개 중 590,000개가 그 넷에서 나왔다.
 *
 * 잣대는 **세운 뒤의 기울기**다. `plates.standCutouts`가 원작이 눕혀 둔 각
 * (45.0°)만 골라 세우고 나면, 여기서 lean < 0.20으로 걸리는 것은 그렇게 선
 * 판과 원래부터 수직이던 판뿐이다 — 15.9°로 놓인 거품도 48°짜리 천장 구멍도
 * 저절로 빠진다
 */
const UPRIGHT = 0.20

/** 판 하나의 UV → 3D 아핀 변환. 축마다 `p = a·u + b·v + c` */
interface Affine {
  a: [number, number, number]
  b: [number, number, number]
  c: [number, number, number]
}

/**
 * 정점들의 (u, v) → (x, y, z)를 최소제곱으로 맞춘다.
 *
 * 판이 사각형이면 정확히 떨어지고, 정점이 열둘인 판(`area07_hei_f`)도
 * 한 평면 위에 있으므로 같은 식으로 풀린다. 못 풀면 `null`이다
 */
export function fitAffine(
  verts: readonly number[], pos: ArrayLike<number>, uv: ArrayLike<number>,
): Affine | null {
  let suu = 0, svv = 0, suv = 0, su = 0, sv = 0, n = 0
  for (const i of verts) {
    const u = uv[i * 2]!, v = uv[i * 2 + 1]!
    suu += u * u; svv += v * v; suv += u * v; su += u; sv += v; n++
  }
  if (n < 3) return null
  // 대칭 3×3 정규방정식. 역행렬을 한 번만 구해 세 축에 돌려 쓴다
  const m = [[suu, suv, su], [suv, svv, sv], [su, sv, n]]
  const det = m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!)
    - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!)
    + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
  if (Math.abs(det) < 1e-12) return null
  const inv = (r: number, c: number): number => {
    const r1 = (r + 1) % 3, r2 = (r + 2) % 3, c1 = (c + 1) % 3, c2 = (c + 2) % 3
    // 여인수를 전치해서 담는다 (수반행렬)
    return (m[r1]![c1]! * m[r2]![c2]! - m[r1]![c2]! * m[r2]![c1]!) / det
  }
  const out: Affine = { a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0] }
  for (let axis = 0; axis < 3; axis++) {
    let ru = 0, rv = 0, r1 = 0
    for (const i of verts) {
      const u = uv[i * 2]!, v = uv[i * 2 + 1]!, p = pos[i * 3 + axis]!
      ru += u * p; rv += v * p; r1 += p
    }
    out.a[axis] = inv(0, 0) * ru + inv(0, 1) * rv + inv(0, 2) * r1
    out.b[axis] = inv(1, 0) * ru + inv(1, 1) * rv + inv(1, 2) * r1
    out.c[axis] = inv(2, 0) * ru + inv(2, 1) * rv + inv(2, 2) * r1
  }
  return out
}

const at = (f: Affine, u: number, v: number, axis: number): number =>
  f.a[axis]! * u + f.b[axis]! * v + f.c[axis]!

/** `rep` 비트대로 텍셀 좌표를 감는다. 0=클램프 · 1=반복 · 5=거울 반복 */
function wrapTexel(t: number, size: number, repeat: boolean, mirror: boolean): number {
  if (!repeat) return Math.min(size - 1, Math.max(0, t))
  const m = ((t % size) + size) % size
  if (!mirror) return m
  const period = ((Math.floor(t / size) % 2) + 2) % 2
  return period === 0 ? m : size - 1 - m
}

/**
 * 판 하나의 옆면.
 *
 * 텍셀 격자에서 불투명/투명 경계를 찾고, **같은 줄로 이어지는 것은 한 판으로
 * 합쳐** 3D 사각형을 세운다. 말뚝 옆면 하나가 삼각형 둘이면 되는 이유다
 */
function shellPart(
  verts: readonly number[], pos: ArrayLike<number>, uv: ArrayLike<number>,
  sheet: TexSheet, item: { x: number, y: number, w: number, h: number }, rep: number,
  out: { position: number[], uv: number[] },
): void {
  const f = fitAffine(verts, pos, uv)
  if (!f) return

  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const i of verts) {
    const u = uv[i * 2]!, v = uv[i * 2 + 1]!
    if (u < u0) u0 = u
    if (u > u1) u1 = u
    if (v < v0) v0 = v
    if (v > v1) v1 = v
  }
  const tx0 = Math.floor(u0 * item.w), ty0 = Math.floor(v0 * item.h)
  const gw = Math.min(MAX_GRID, Math.max(1, Math.ceil(u1 * item.w) - tx0))
  const gh = Math.min(MAX_GRID, Math.max(1, Math.ceil(v1 * item.h) - ty0))
  // 상한에 걸린 판은 성기게 훑는다 — 격자 한 칸이 텍셀 여럿을 뜻하게 된다
  const stepX = Math.max(1, (Math.ceil(u1 * item.w) - tx0) / gw)
  const stepY = Math.max(1, (Math.ceil(v1 * item.h) - ty0) / gh)

  const solid = new Uint8Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const sx = wrapTexel(Math.floor(tx0 + i * stepX), item.w, (rep & 1) !== 0, (rep & 4) !== 0)
      const sy = wrapTexel(Math.floor(ty0 + j * stepY), item.h, (rep & 2) !== 0, (rep & 8) !== 0)
      const o = ((item.y + sy) * sheet.width + item.x + sx) * 4
      solid[j * gw + i] = sheet.pixels[o + 3]! >= ALPHA_CUT ? 1 : 0
    }
  }

  // 판 평면의 법선. 두께는 이 방향으로 ±절반씩 간다
  const nx = f.a[1]! * f.b[2]! - f.a[2]! * f.b[1]!
  const ny = f.a[2]! * f.b[0]! - f.a[0]! * f.b[2]!
  const nz = f.a[0]! * f.b[1]! - f.a[1]! * f.b[0]!
  const nl = Math.hypot(nx, ny, nz)
  if (nl < 1e-9) return
  // 한 텍셀이 몇 타일인가 — 그것이 곧 두께다
  const texel = Math.hypot(f.a[0]!, f.a[1]!, f.a[2]!) / item.w
  const half = (texel * SHELL_TEXELS) / 2
  const hx = (nx / nl) * half, hy = (ny / nl) * half, hz = (nz / nl) * half

  /** 격자 좌표 → uv */
  const uAt = (i: number) => (tx0 + i * stepX) / item.w
  const vAt = (j: number) => (ty0 + j * stepY) / item.h

  const solidAt = (i: number, j: number) =>
    i >= 0 && i < gw && j >= 0 && j < gh && solid[j * gw + i] === 1

  /** 옆면 한 장. 두 끝점을 앞뒤로 벌려 사각형으로 만든다 */
  const wall = (ua: number, va: number, ub: number, vb: number, tu: number, tv: number): void => {
    const p = (u: number, v: number, s: number): [number, number, number] => [
      at(f, u, v, 0) + hx * s, at(f, u, v, 1) + hy * s, at(f, u, v, 2) + hz * s,
    ]
    const q = [p(ua, va, 1), p(ub, vb, 1), p(ub, vb, -1), p(ua, va, -1)]
    for (const k of [0, 1, 2, 0, 2, 3]) {
      out.position.push(...q[k]!)
      out.uv.push(tu, tv)
    }
  }

  // 세로 경계 — 왼쪽·오른쪽. 같은 열에서 이어지는 것은 한 판으로 합친다
  for (const side of [-1, 1]) {
    for (let i = 0; i < gw; i++) {
      let from = -1
      for (let j = 0; j <= gh; j++) {
        const edge = j < gh && solidAt(i, j) && !solidAt(i + side, j)
        if (edge && from < 0) from = j
        if (!edge && from >= 0) {
          const u = uAt(side < 0 ? i : i + 1)
          wall(u, vAt(from), u, vAt(j), uAt(i + 0.5), vAt((from + j) / 2))
          from = -1
        }
      }
    }
  }
  // 가로 경계 — 위·아래
  for (const side of [-1, 1]) {
    for (let j = 0; j < gh; j++) {
      let from = -1
      for (let i = 0; i <= gw; i++) {
        const edge = i < gw && solidAt(i, j) && !solidAt(i, j + side)
        if (edge && from < 0) from = i
        if (!edge && from >= 0) {
          const v = vAt(side < 0 ? j : j + 1)
          wall(uAt(from), v, uAt(i), v, uAt((from + i) / 2), vAt(j + 0.5))
          from = -1
        }
      }
    }
  }
}

/** 옆면 지오메트리 하나. 서브메시 순서는 청크 재질 배열과 같다 */
export interface CardShells {
  geometry: BufferGeometry
  groups: [number, number, number][]
}

/**
 * 오려 낸 판 전부에 옆면을 세운다. 세울 것이 없으면 `null`.
 *
 * 잎(`Foliage`가 입체로 다시 세운다)과 구운 그림자(걷어낸다)는 뺀다 — 남는 것이
 * 울타리·표지판·덤불이다.
 *
 * `position`은 **세운 뒤**의 자리여야 한다(`plates.standCutouts`). 눕은 판에
 * 옆면을 세우면 두께가 엉뚱한 쪽으로 붙는다
 */
export function cardShells(
  mesh: ChunkMesh, cutout: readonly boolean[], position: Float32Array, sheet: TexSheet | null,
): CardShells | null {
  if (!sheet) return null
  const uv = (mesh.geometry.getAttribute('uv') as BufferAttribute | undefined)?.array as
    Float32Array | undefined
  if (!uv) return null
  const index = mesh.geometry.getIndex()!.array

  const groups: [number, number, number][] = []
  const position3: number[] = []
  const texcoord: number[] = []

  mesh.groups.forEach(([, start, count], group) => {
    if (cutout[group] !== true) return
    if (isFoliage(mesh, group, cutout) || isBakedShadow(mesh, group)) return
    const spec = mesh.materials[group]!
    const item = sheet.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    if (!item) return

    // 정점을 함께 쓰는 삼각형끼리 묶는다 — 울타리 한 줄이 한 서브메시에 다 있고
    // 판이 저마다 다른 자리에서 시작한다 (`plates.standCutouts`와 같은 길)
    const parent = new Map<number, number>()
    const find = (x: number): number => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r) ?? r
      return r
    }
    const join = (a: number, b: number) => {
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
    for (let t = 0; t < count; t += 3) {
      for (const k of [0, 1, 2]) {
        const i = index[start + t + k]!
        if (!parent.has(i)) parent.set(i, i)
      }
      join(index[start + t]!, index[start + t + 1]!)
      join(index[start + t]!, index[start + t + 2]!)
    }
    /** 덩이마다 정점과 면적 가중 법선. 누워 있는 것을 여기서 가른다 */
    const byRoot = new Map<number, { verts: Set<number>, n: [number, number, number] }>()
    for (let t = 0; t < count; t += 3) {
      const a = index[start + t]!, b = index[start + t + 1]!, c = index[start + t + 2]!
      const root = find(a)
      let part = byRoot.get(root)
      if (!part) { part = { verts: new Set(), n: [0, 0, 0] }; byRoot.set(root, part) }
      const ax = position[a * 3]!, ay = position[a * 3 + 1]!, az = position[a * 3 + 2]!
      const ux = position[b * 3]! - ax, uy = position[b * 3 + 1]! - ay, uz = position[b * 3 + 2]! - az
      const vx = position[c * 3]! - ax, vy = position[c * 3 + 1]! - ay, vz = position[c * 3 + 2]! - az
      part.n[0] += uy * vz - uz * vy
      part.n[1] += uz * vx - ux * vz
      part.n[2] += ux * vy - uy * vx
      part.verts.add(a); part.verts.add(b); part.verts.add(c)
    }

    const into = { position: [] as number[], uv: [] as number[] }
    for (const part of byRoot.values()) {
      const len = Math.hypot(...part.n)
      if (len < 1e-9) continue
      // 누워 있으면 판때기가 아니라 지형이다
      if (Math.abs(part.n[1]) / len >= UPRIGHT) continue
      shellPart([...part.verts], position, uv, sheet, item, spec.rep, into)
    }
    if (into.position.length === 0) return
    groups.push([position3.length / 3, into.position.length / 3, group])
    // 전개 연산자로 밀면 안 된다 — 판이 많은 청크에서 인자 수가 스택을 넘긴다
    for (const v of into.position) position3.push(v)
    for (const v of into.uv) texcoord.push(v)
  })

  if (position3.length === 0) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position3), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(texcoord), 2))
  // ⚠️ **정점 색을 안 주면 안 된다.** 지형 재질이 `vertexColors`라, 속성이 없으면
  // 백엔드가 알아서 채운 값으로 그려진다 — WebGL과 WebGPU가 서로 다르게 채운다.
  // 옆면은 원작 판의 그늘을 물려받을 것이 없으므로 흰색이 맞는 값이다
  const white = new Float32Array(position3.length).fill(1)
  geometry.setAttribute('color', new BufferAttribute(white, 3))
  for (const [start, count, group] of groups) geometry.addGroup(start, count, group)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return { geometry, groups }
}
