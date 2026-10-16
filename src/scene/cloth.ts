// 깃발을 **천으로** 다시 건다 — 원작 깃발 판 한 장을 잘게 나눈 천 한 폭으로 (DATA.md §4.4 「깃발은 천이다」 · 3D_GAP_AUDIT §3.4)
//
// 원작 깃발은 사각형 한 장이다. 배틀프런티어 바깥(D32)의 파란 현수막 `bf_hata02.1`이 열두 장이고(청크 584 · 585 · 586 · 591 · 592), 전부 **수직**으로 서
// 있다(판 법선의 y가 0 · 실측). 고정 카메라에서는 그림으로 충분했지만 우리 카메라로 돌아가면 판때기가 깃대 앞에 떠 있다.
// `cards.cardShells`가 1텍셀 테두리를 둘렀던 것이 감사 사진의 「남쪽 파란 깃발이 판자」다.
//
// ⚠️ **모양은 원작 그림이 정한다.** 천의 폭 · 길이 · 제비꼬리는 그림의 불투명 칸 그대로이고(알파로 오린다), 우리가 정하는
// 것은 **어느 변이 깃대에 매였는가**와 펄럭임뿐이다.
//
// ⚠️ **매인 변은 짐작하지 않고 잰다** (`hoistEdge`). 두 잣대를 함께 본다:
//
//   ① 곧은 변 — 그림의 불투명 상자 둘레 줄이 **얼마나 꽉 찼는가**. 나부끼는 끝은 제비꼬리처럼 뚫려 있다.
//      `bf_hata02.1`: 위 1.00 · 왼 1.00 · 오른 1.00 · **아래 0.23** (텍셀 실측)
//   ② 붙은 변 — 그 변 위 다섯 점에서 **같은 청크의 다른 면까지** 평균 거리. 깃대 · 가로대가 거기 있다.
//      `bf_hata02.1` 열두 장이 다 같다: **위 0.075** (가로대 `bf_hata01` y 11.5~11.75) · 왼 0.232 (기둥 x 16.75~17.0) ·
//      아래 0.761 · 오른 0.885 타일 (`cloth.test`)
//
//   곧은 변 중 가장 가까운 것이 매인 변이다 — 열두 장 다 **위**다. 현수막은 가로대에 매달린다.
//
// ⚠️ **CPU는 한 번만 일한다.** 천 정점에 「매인 변까지 거리 · 변 따라 자리 · 길이 · 위상」을 실어 두고, 펄럭임은
// 셰이더의 `time` 하나가 낸다 (`clothMaterial`). 프레임마다 버퍼를 안 올린다
import { BufferAttribute, BufferGeometry } from 'three'
import { fitAffine, wrapTexel } from './cards'
import type { TexSheet } from './chunkMesh'

/** 알파 판정 문턱. 재질의 `alphaTest: 0.5`와 같은 자리 (`cards.ALPHA_CUT`) */
const ALPHA_CUT = 128

/**
 * 천 한 폭의 마디 — 매인 변을 따라 · 매인 변에서 멀어지며.
 *
 * 물결이 매인 변에서 끝으로 한 가락 반쯤 지나가므로(`clothMaterial.WAVE_K`) 멀어지는 쪽이 촘촘해야 한다 — 한 가락을
 * 여덟 마디로 그리면 꺾임이 안 보인다. 따라가는 쪽은 위상이 천천히 바뀌어 여섯이면 된다. 한 폭에 삼각형 144개, D32의
 * 열두 폭이 1,728개다 (테두리 1,056개를 걷어 낸 자리)
 */
export const CLOTH_ALONG = 6
export const CLOTH_AWAY = 12

/**
 * 곧은 변으로 볼 불투명 비율. `bf_hata02.1`의 세 변이 1.00이고 제비꼬리 변이 0.27이다 — 사이가 넓어 가운데를 잡는다
 */
const STRAIGHT = 0.9

/**
 * 매인 변을 찾을 거리 (타일). 이보다 먼 데 아무것도 없으면 **안 바꾼다** — 매달 데가 없는 깃발을 펄럭이게 하면 허공에
 * 뜬 천이 된다. 실측 최대가 0.075라 넉넉하다
 */
const REACH = 0.5

/** 변 하나 — 텍셀 상자의 어느 쪽인가. `u0`=왼 · `u1`=오른 · `v0`=위(그림 위쪽 줄) · `v1`=아래 */
type ClothEdge = 'u0' | 'u1' | 'v0' | 'v1'

const EDGES: readonly ClothEdge[] = ['u0', 'u1', 'v0', 'v1']

/** 천 한 폭. 청크 로컬 좌표 */
export interface ClothPanel {
  /** `(CLOTH_ALONG + 1) × (CLOTH_AWAY + 1)` 정점 */
  position: Float32Array
  uv: Float32Array
  /** 판 법선 (단위). 천은 이 방향으로 나부낀다 */
  normal: Float32Array
  /** 매인 변에서 멀어지는 방향 (단위) */
  away: Float32Array
  /** 정점마다 `[매인 변까지 거리, 변 따라 자리, 천 길이, 위상]` (타일 · 라디안) */
  wave: Float32Array
  index: number[]
  hoist: ClothEdge
  /** 매인 변을 고른 근거 — 변마다 곧음(불투명 비율)과 다른 면까지 평균 거리(타일) */
  measured: { straight: Record<ClothEdge, number>, distance: Record<ClothEdge, number> }
  /** 원본 정점 색의 평균 — 재질 색으로 쓴다 */
  tint: [number, number, number]
}

/** 점과 삼각형 사이 거리 (Ericson, Real-Time Collision Detection §5.1.5) */
export function pointTriangleDistance(
  p: readonly number[], a: readonly number[], b: readonly number[], c: readonly number[],
): number {
  const sub = (x: readonly number[], y: readonly number[]) => [x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!]
  const dot = (x: readonly number[], y: readonly number[]) => x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a)
  const d1 = dot(ab, ap), d2 = dot(ac, ap)
  const at = (q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!)
  const along = (s: number, t: number) => [a[0]! + ab[0]! * s + ac[0]! * t, a[1]! + ab[1]! * s + ac[1]! * t, a[2]! + ab[2]! * s + ac[2]! * t]
  if (d1 <= 0 && d2 <= 0) return at(a)
  const bp = sub(p, b)
  const d3 = dot(ab, bp), d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return at(b)
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(along(d1 / (d1 - d3), 0))
  const cp = sub(p, c)
  const d5 = dot(ab, cp), d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return at(c)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(along(0, d2 / (d2 - d6)))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    return at([b[0]! + (c[0]! - b[0]!) * w, b[1]! + (c[1]! - b[1]!) * w, b[2]! + (c[2]! - b[2]!) * w])
  }
  const den = 1 / (va + vb + vc)
  return at(along(vb * den, vc * den))
}

/** 같은 청크의 다른 면 — 매인 변 재기용 */
interface ClothSurroundings {
  index: ArrayLike<number>
  position: ArrayLike<number>
  /** `[재질, 시작, 개수]` — `ChunkMesh.groups` 그대로 */
  groups: readonly (readonly [number, number, number])[]
}

/**
 * 변마다 **곧음**(불투명 비율)과 **다른 면까지 평균 거리**를 재서 매인 변을 고른다.
 * 곧은 변이 없거나 다 `REACH` 밖이면 null — 그 판은 원래대로 둔다
 */
export function hoistEdge(
  straight: Readonly<Record<ClothEdge, number>>, distance: Readonly<Record<ClothEdge, number>>,
): ClothEdge | null {
  let best: ClothEdge | null = null
  for (const e of EDGES) {
    if (straight[e] < STRAIGHT || !(distance[e] <= REACH)) continue
    if (best === null || distance[e] < distance[best]) best = e
  }
  return best
}

/**
 * 깃발 판 하나(`tris` — 원본 색인의 삼각형 시작 자리들)를 천 한 폭으로. 못 하면 null.
 *
 * `group`은 그 판의 서브메시다 — 매인 변을 잴 때 **제 서브메시는 뺀다**(옆 깃발에 매달리면 안 된다)
 */
export function clothPanel(
  around: ClothSurroundings, uv: ArrayLike<number>, color: ArrayLike<number> | undefined,
  tris: readonly number[], group: number,
  sheet: TexSheet, item: { x: number, y: number, w: number, h: number }, rep: number,
): ClothPanel | null {
  const verts = [...new Set(tris.flatMap((o) => [around.index[o]!, around.index[o + 1]!, around.index[o + 2]!]))]
  const f = fitAffine(verts, around.position, uv)
  if (f === null) return null
  const P = (u: number, v: number): [number, number, number] => [
    f.a[0] * u + f.b[0] * v + f.c[0], f.a[1] * u + f.b[1] * v + f.c[1], f.a[2] * u + f.b[2] * v + f.c[2],
  ]

  // 판이 덮는 텍셀 — 원본 UV 그대로(반복이면 칸 밖 값)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const i of verts) {
    const u = uv[i * 2]!, v = uv[i * 2 + 1]!
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
  }
  const tx0 = Math.round(u0 * item.w), tx1 = Math.round(u1 * item.w)
  const ty0 = Math.round(v0 * item.h), ty1 = Math.round(v1 * item.h)
  if (tx1 - tx0 < 2 || ty1 - ty0 < 2) return null
  const opaque = (tx: number, ty: number): boolean => {
    const sx = wrapTexel(tx, item.w, (rep & 1) !== 0, (rep & 4) !== 0)
    const sy = wrapTexel(ty, item.h, (rep & 2) !== 0, (rep & 8) !== 0)
    return sheet.pixels[((item.y + sy) * sheet.width + item.x + sx) * 4 + 3]! >= ALPHA_CUT
  }
  // 불투명 상자 — 천은 이만큼이다. 판 가장자리의 빈 텍셀(`bf_hata02.1`은 양옆 2열)까지 펄럭일 이유가 없다
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      if (!opaque(tx, ty)) continue
      bx0 = Math.min(bx0, tx); bx1 = Math.max(bx1, tx + 1); by0 = Math.min(by0, ty); by1 = Math.max(by1, ty + 1)
    }
  }
  if (!(bx1 - bx0 >= 2 && by1 - by0 >= 2)) return null

  const fill = (along: 'row' | 'col', at: number, from: number, to: number): number => {
    let n = 0
    for (let k = from; k < to; k++) if (along === 'row' ? opaque(k, at) : opaque(at, k)) n++
    return n / (to - from)
  }
  const straight: Record<ClothEdge, number> = {
    u0: fill('col', bx0, by0, by1), u1: fill('col', bx1 - 1, by0, by1),
    v0: fill('row', by0, bx0, bx1), v1: fill('row', by1 - 1, bx0, bx1),
  }

  // 변 위 다섯 점에서 다른 면까지. 판 근처(REACH 안)의 삼각형만 본다
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const [tu, tv] of [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]] as const) {
    const p = P(tu / item.w, tv / item.h)
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p[k]! - REACH); hi[k] = Math.max(hi[k]!, p[k]! + REACH) }
  }
  const near: [number, number, number][][] = []
  around.groups.forEach(([, start, count], g) => {
    if (g === group) return
    for (let t = 0; t < count; t += 3) {
      const tri = [0, 1, 2].map((k): [number, number, number] => {
        const i = around.index[start + t + k]!
        return [around.position[i * 3]!, around.position[i * 3 + 1]!, around.position[i * 3 + 2]!]
      })
      const out = [0, 1, 2].some((k) => tri.every((p) => p[k]! < lo[k]!) || tri.every((p) => p[k]! > hi[k]!))
      if (!out) near.push(tri)
    }
  })
  const edgePoint = (e: ClothEdge, s: number): [number, number, number] => {
    const tu = e === 'u0' ? bx0 : e === 'u1' ? bx1 : bx0 + (bx1 - bx0) * s
    const tv = e === 'v0' ? by0 : e === 'v1' ? by1 : by0 + (by1 - by0) * s
    return P(tu / item.w, tv / item.h)
  }
  const distance = {} as Record<ClothEdge, number>
  for (const e of EDGES) {
    let sum = 0
    for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const p = edgePoint(e, s)
      let best = Infinity
      for (const [a, b, c] of near) best = Math.min(best, pointTriangleDistance(p, a!, b!, c!))
      sum += best
    }
    distance[e] = sum / 5
  }
  const hoist = hoistEdge(straight, distance)
  if (hoist === null) return null

  // 격자 — s는 매인 변을 따라, r은 매인 변에서 멀어지며 (0 = 매인 변)
  const texelAt = (s: number, r: number): [number, number] => {
    switch (hoist) {
      case 'v0': return [bx0 + (bx1 - bx0) * s, by0 + (by1 - by0) * r]
      case 'v1': return [bx0 + (bx1 - bx0) * s, by1 - (by1 - by0) * r]
      case 'u0': return [bx0 + (bx1 - bx0) * r, by0 + (by1 - by0) * s]
      case 'u1': return [bx1 - (bx1 - bx0) * r, by0 + (by1 - by0) * s]
    }
  }
  const at = (s: number, r: number) => {
    const [tu, tv] = texelAt(s, r)
    return P(tu / item.w, tv / item.h)
  }
  const h0 = at(0, 0), h1 = at(1, 0), f0 = at(0, 1)
  const width = Math.hypot(h1[0] - h0[0], h1[1] - h0[1], h1[2] - h0[2])
  const length = Math.hypot(f0[0] - h0[0], f0[1] - h0[1], f0[2] - h0[2])
  if (width < 1e-6 || length < 1e-6) return null
  const away = [(f0[0] - h0[0]) / length, (f0[1] - h0[1]) / length, (f0[2] - h0[2]) / length]
  let nx = f.a[1] * f.b[2] - f.a[2] * f.b[1], ny = f.a[2] * f.b[0] - f.a[0] * f.b[2], nz = f.a[0] * f.b[1] - f.a[1] * f.b[0]
  const nl = Math.hypot(nx, ny, nz)
  if (nl < 1e-9) return null
  nx /= nl; ny /= nl; nz /= nl
  // 깃발마다 위상을 다르게 — 한 줄로 선 열두 장이 한 박자로 흔들리면 기계다. 자리에서 나오므로 늘 같다
  const seed = Math.sin(h0[0] * 12.9898 + h0[2] * 78.233 + h0[1] * 37.719) * 43758.5453
  const phase = (seed - Math.floor(seed)) * Math.PI * 2

  const nV = (CLOTH_ALONG + 1) * (CLOTH_AWAY + 1)
  const position = new Float32Array(nV * 3), texcoord = new Float32Array(nV * 2)
  const normal = new Float32Array(nV * 3), awayOut = new Float32Array(nV * 3), wave = new Float32Array(nV * 4)
  for (let j = 0; j <= CLOTH_AWAY; j++) {
    for (let i = 0; i <= CLOTH_ALONG; i++) {
      const k = j * (CLOTH_ALONG + 1) + i
      const s = i / CLOTH_ALONG, r = j / CLOTH_AWAY
      const [tu, tv] = texelAt(s, r)
      const p = P(tu / item.w, tv / item.h)
      position.set(p, k * 3)
      texcoord[k * 2] = tu / item.w; texcoord[k * 2 + 1] = tv / item.h
      normal[k * 3] = nx; normal[k * 3 + 1] = ny; normal[k * 3 + 2] = nz
      awayOut.set(away, k * 3)
      wave[k * 4] = r * length; wave[k * 4 + 1] = s * width; wave[k * 4 + 2] = length; wave[k * 4 + 3] = phase
    }
  }
  const index: number[] = []
  for (let j = 0; j < CLOTH_AWAY; j++) {
    for (let i = 0; i < CLOTH_ALONG; i++) {
      const a = j * (CLOTH_ALONG + 1) + i, b = a + 1, c = a + CLOTH_ALONG + 1, d = c + 1
      index.push(a, c, b, b, c, d)
    }
  }
  const tint: [number, number, number] = [0, 0, 0]
  if (color !== undefined) {
    for (const i of verts) for (let k = 0; k < 3; k++) tint[k] += color[i * 3 + k]! / verts.length
  } else tint.fill(1)
  return { position, uv: texcoord, normal, away: awayOut, wave, index, hoist, measured: { straight, distance }, tint }
}

/** 천 정점 속성 이름 — `clothMaterial`이 읽는다 */
export const CLOTH_WAVE = 'clothWave'
export const CLOTH_AWAY_ATTR = 'clothAway'

/** 같은 그림의 천 여러 폭을 기하 하나로 */
export function clothGeometry(panels: readonly ClothPanel[]): BufferGeometry | null {
  if (panels.length === 0) return null
  const nV = panels.reduce((n, p) => n + p.position.length / 3, 0)
  const position = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), normal = new Float32Array(nV * 3)
  const away = new Float32Array(nV * 3), wave = new Float32Array(nV * 4)
  const index: number[] = []
  let base = 0
  for (const p of panels) {
    position.set(p.position, base * 3); uv.set(p.uv, base * 2); normal.set(p.normal, base * 3)
    away.set(p.away, base * 3); wave.set(p.wave, base * 4)
    for (const i of p.index) index.push(base + i)
    base += p.position.length / 3
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(position, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setAttribute('normal', new BufferAttribute(normal, 3))
  g.setAttribute(CLOTH_AWAY_ATTR, new BufferAttribute(away, 3))
  g.setAttribute(CLOTH_WAVE, new BufferAttribute(wave, 4))
  g.setIndex(index)
  g.computeBoundingSphere()
  // 펄럭이는 만큼 경계구를 키운다 — 안 키우면 끝자락이 시야 끝에서 잘려 나간다 (`clothMaterial.SWAY_MAX`)
  if (g.boundingSphere) g.boundingSphere.radius += 0.5
  return g
}
