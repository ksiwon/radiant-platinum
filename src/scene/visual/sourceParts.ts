// 원본 조각 식별과 UV 칸 해석 (FIRST_PERSON §3·§4.1)
//
// ⚠️ **원본을 안 고친다.** 배열을 읽기만 하고, 조각은 원본 index의 시작 자리로
// 가리킨다 — 뒤 단계가 그 자리로 원본을 거르거나 남긴다.
//
// ⚠️ **사각형 = 삼각형 둘이라고 가정하지 않는다.** `plateLumps`는 6개씩 끊어 읽지만
// 여기서는 모서리를 함께 쓰는 **같은 평면**의 삼각형끼리 잇는다. 삼각형 차례가
// 달라도, 사각형이 아닌 메시여도 같은 답이 나온다.
//
// ⚠️ **UV 이음매는 안 잇는다.** 모서리의 두 꼭짓점을 「같은 자리 + 같은 UV」로
// 본다. 롬 사각형은 정점을 제 것으로 들고 있어서 이웃 판과 색인을 안 나눈다 —
// 자리만 보면 이음매 건너 판이 붙고, 색인만 보면 정점을 따로 둔 한 판이 갈린다.
import { REP, type SourceKey, type SourceKind, type SourcePart, type UvFootprint } from './types'

/** 조각을 찾는 데 필요한 것만. `ChunkMesh`에서 뽑아 넘긴다 */
export interface MeshArrays {
  index: ArrayLike<number>
  position: ArrayLike<number>
  uv?: ArrayLike<number>
  /** [롬 재질 번호, 색인 시작, 색인 개수] — `ChunkMesh.groups` 그대로 */
  groups: readonly (readonly [number, number, number])[]
  /** 서브메시 차례의 재질 */
  materials: readonly { tex: string | null, pal: string | null, rep: number }[]
}

interface PartsOptions {
  kind: SourceKind
  assetId: number
  texSet: number | null
  /** 서브메시의 그림 지문. 그림이 없으면 `'-'` */
  hashOf: (group: number) => string
}

/** 같은 평면으로 볼 법선 내적. 1°의 코사인이 0.99985다 */
const COPLANAR_DOT = 0.9998
/** 같은 평면으로 볼 평면 거리 차 (타일) */
const COPLANAR_DIST = 1e-3
/** 꼭짓점을 같은 것으로 볼 자리 눈금. 저장 좌표가 1/256 타일이다 */
const POS_Q = 512
/** UV 눈금. 512 텍셀 그림의 반의반 텍셀 */
const UV_Q = 4096

function vertexKey(a: MeshArrays, i: number): string {
  const p = a.position
  const x = Math.round(p[i * 3]! * POS_Q), y = Math.round(p[i * 3 + 1]! * POS_Q)
  const z = Math.round(p[i * 3 + 2]! * POS_Q)
  const u = a.uv ? Math.round(a.uv[i * 2]! * UV_Q) : 0
  const v = a.uv ? Math.round(a.uv[i * 2 + 1]! * UV_Q) : 0
  return `${String(x)},${String(y)},${String(z)}|${String(u)},${String(v)}`
}

function triNormal(a: MeshArrays, i0: number, i1: number, i2: number): [number, number, number, number] | null {
  const p = a.position
  const ux = p[i1 * 3]! - p[i0 * 3]!, uy = p[i1 * 3 + 1]! - p[i0 * 3 + 1]!, uz = p[i1 * 3 + 2]! - p[i0 * 3 + 2]!
  const vx = p[i2 * 3]! - p[i0 * 3]!, vy = p[i2 * 3 + 1]! - p[i0 * 3 + 1]!, vz = p[i2 * 3 + 2]! - p[i0 * 3 + 2]!
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  if (len < 1e-12) return null
  const n: [number, number, number] = [nx / len, ny / len, nz / len]
  return [n[0], n[1], n[2], n[0] * p[i0 * 3]! + n[1] * p[i0 * 3 + 1]! + n[2] * p[i0 * 3 + 2]!]
}

/**
 * 서브메시마다 **모서리를 함께 쓰는 같은 평면 삼각형**끼리 묶는다.
 *
 * 넓이가 0인 삼각형은 제 조각이 된다 — 어디에도 안 붙이고 버리지도 않는다
 * (지우면 원본 개수가 어긋난다)
 */
export function sourceParts(a: MeshArrays, opt: PartsOptions): SourcePart[] {
  const out: SourcePart[] = []
  a.groups.forEach(([, start, count], group) => {
    const spec = a.materials[group]
    if (spec === undefined) return
    const tris = Math.floor(count / 3)
    const parent = Int32Array.from({ length: tris }, (_, k) => k)
    const find = (x: number): number => {
      let r = x
      while (parent[r] !== r) r = parent[r]!
      while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n }
      return r
    }
    const planes: ([number, number, number, number] | null)[] = []
    const keys: string[][] = []
    for (let t = 0; t < tris; t++) {
      const o = start + t * 3
      const i0 = a.index[o]!, i1 = a.index[o + 1]!, i2 = a.index[o + 2]!
      planes.push(triNormal(a, i0, i1, i2))
      keys.push([vertexKey(a, i0), vertexKey(a, i1), vertexKey(a, i2)])
    }
    const edges = new Map<string, number[]>()
    for (let t = 0; t < tris; t++) {
      if (planes[t] === null) continue
      const k = keys[t]!
      for (const [p, q] of [[0, 1], [1, 2], [2, 0]] as const) {
        const e = k[p]! < k[q]! ? `${k[p]!}#${k[q]!}` : `${k[q]!}#${k[p]!}`
        const list = edges.get(e)
        if (list) list.push(t)
        else edges.set(e, [t])
      }
    }
    for (const list of edges.values()) {
      for (let x = 0; x < list.length; x++) {
        for (let y = x + 1; y < list.length; y++) {
          const pa = planes[list[x]!]!, pb = planes[list[y]!]!
          const dot = pa[0] * pb[0] + pa[1] * pb[1] + pa[2] * pb[2]
          if (dot < COPLANAR_DOT || Math.abs(pa[3] - pb[3]) > COPLANAR_DIST) continue
          const ra = find(list[x]!), rb = find(list[y]!)
          if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
        }
      }
    }
    const byRoot = new Map<number, number[]>()
    for (let t = 0; t < tris; t++) {
      const r = find(t)
      const list = byRoot.get(r)
      if (list) list.push(t)
      else byRoot.set(r, [t])
    }
    const source: SourceKey = {
      kind: opt.kind, assetId: opt.assetId, texSet: opt.texSet,
      tex: spec.tex, pal: spec.pal, rep: spec.rep, sourceHash: opt.hashOf(group),
    }
    for (const list of byRoot.values()) {
      const uv: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
      const box: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
      const n: [number, number, number] = [0, 0, 0]
      const offsets: number[] = []
      for (const t of list) {
        const o = start + t * 3
        offsets.push(o)
        const pl = planes[t]
        if (pl) { n[0] += pl[0]; n[1] += pl[1]; n[2] += pl[2] }
        for (let k = 0; k < 3; k++) {
          const i = a.index[o + k]!
          if (a.uv) {
            const u = a.uv[i * 2]!, v = a.uv[i * 2 + 1]!
            if (u < uv[0]) uv[0] = u
            if (v < uv[1]) uv[1] = v
            if (u > uv[2]) uv[2] = u
            if (v > uv[3]) uv[3] = v
          }
          for (let d = 0; d < 3; d++) {
            const c = a.position[i * 3 + d]!
            if (c < box[d]!) box[d] = c
            if (c > box[d + 3]!) box[d + 3] = c
          }
        }
      }
      if (!a.uv) { uv[0] = 0; uv[1] = 0; uv[2] = 0; uv[3] = 0 }
      const len = Math.hypot(n[0], n[1], n[2])
      out.push({
        source,
        group,
        componentId: `${opt.kind}:${String(opt.assetId)}/s${opt.texSet === null ? '-' : String(opt.texSet)}/g${String(group)}/t${String(offsets[0])}`,
        triangleOffsets: offsets,
        uvBounds: uv,
        normal: len > 0 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 0, 0],
        bounds: box,
      })
    }
  })
  return out
}

/** 판이 수직에서 넘어간 각 (도) — 0이 서 있고 90이 깔렸다 (`plates.leaning`과 같은 잣대) */
export function leanDegrees(normal: readonly [number, number, number]): number {
  return (Math.asin(Math.min(1, Math.abs(normal[1]))) * 180) / Math.PI
}

const EPS = 1e-4

/** 한 축의 UV 구간을 그림 칸 안의 구간들로 편다 */
function unwrapAxis(
  lo: number, hi: number, repeat: boolean, mirror: boolean,
): { spans: [number, number][], wraps: boolean } {
  if (!repeat) {
    const a = Math.max(0, Math.min(1, lo)), b = Math.max(0, Math.min(1, hi))
    return { spans: [[a, b]], wraps: lo < -EPS || hi > 1 + EPS }
  }
  if (hi - lo >= 1 - EPS) return { spans: [[0, 1]], wraps: lo < -EPS || hi > 1 + EPS }
  const tile = Math.floor(lo + EPS)
  const wraps = tile !== 0 || hi > 1 + EPS
  const fold = (x: number, k: number): number => {
    const f = x - k
    return mirror && ((k % 2) + 2) % 2 === 1 ? 1 - f : f
  }
  if (hi <= tile + 1 + EPS) {
    const a = fold(lo, tile), b = fold(Math.min(hi, tile + 1), tile)
    return { spans: [[Math.min(a, b), Math.max(a, b)]], wraps }
  }
  // 칸 경계를 넘는다 — 두 토막
  const a1 = fold(lo, tile), b1 = fold(tile + 1, tile)
  const a2 = fold(tile + 1, tile + 1), b2 = fold(hi, tile + 1)
  return {
    spans: [[Math.min(a1, b1), Math.max(a1, b1)], [Math.min(a2, b2), Math.max(a2, b2)]],
    wraps: true,
  }
}

/**
 * UV 상자가 그림 칸의 **어느 텍셀**을 쓰는가 (§3-4).
 *
 * ⚠️ `u0 === 0.5` 같은 일치 비교, 임의 반올림, 0~1 강제 자르기를 안 한다.
 * 원본 `rep`의 반복·거울·자르기를 그대로 풀고, 소수 경계는 `fractional`로 남긴다
 */
export function uvFootprint(
  uvBounds: readonly [number, number, number, number], rep: number, w: number, h: number,
): UvFootprint {
  const [u0, v0, u1, v1] = uvBounds
  const U = unwrapAxis(u0, u1, (rep & REP.repeatU) !== 0, (rep & REP.mirrorU) !== 0)
  const V = unwrapAxis(v0, v1, (rep & REP.repeatV) !== 0, (rep & REP.mirrorV) !== 0)
  const rects: [number, number, number, number][] = []
  for (const [a, b] of U.spans) {
    for (const [c, d] of V.spans) rects.push([a * w, c * h, b * w, d * h])
  }
  const raw: [number, number, number, number] = [u0 * w, v0 * h, u1 * w, v1 * h]
  const fractional = raw.some((x) => Math.abs(x - Math.round(x)) > 1e-3)
  return { rects, raw, wrapsU: U.wraps, wrapsV: V.wraps, fractional }
}

/** 사각형들이 `within` 안에 **다** 드는가. 넓이 0인 토막은 안 센다 */
export function footprintWithin(
  fp: UvFootprint, within: readonly [number, number, number, number], slack = 1e-3,
): boolean {
  const real = fp.rects.filter((r) => r[2] - r[0] > slack && r[3] - r[1] > slack)
  if (real.length === 0) return false
  return real.every((r) => r[0] >= within[0] - slack && r[1] >= within[1] - slack
    && r[2] <= within[2] + slack && r[3] <= within[3] + slack)
}

/** 영역마다 겹친 비율 — 뜻 후보로만 쓴다. 확정하지 않는다 */
export function regionShares(
  fp: UvFootprint, regions: readonly { name: string, rect: readonly [number, number, number, number] }[],
): { name: string, share: number }[] {
  let total = 0
  const got = new Map<string, number>()
  for (const r of fp.rects) {
    const area = Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1])
    total += area
    for (const g of regions) {
      const w = Math.max(0, Math.min(r[2], g.rect[2]) - Math.max(r[0], g.rect[0]))
      const hh = Math.max(0, Math.min(r[3], g.rect[3]) - Math.max(r[1], g.rect[1]))
      if (w * hh > 0) got.set(g.name, (got.get(g.name) ?? 0) + w * hh)
    }
  }
  if (total <= 0) return []
  return [...got].map(([name, a]) => ({ name, share: a / total })).sort((x, y) => y.share - x.share)
}

/** 그림 칸의 픽셀 — 묶음 한 장 안의 자리 */
export interface SheetPixels {
  width: number
  pixels: ArrayLike<number>
}

/**
 * 그림 칸 안 **한 사각형의 픽셀 지문** (FNV-1a 32비트, 16진 8자).
 *
 * 레시피가 검수한 것은 그림 전체가 아니라 그 칸이다 — 화분 16×16만 같으면 울타리
 * 색이 다른 묶음에서도 같은 화분이다. 게임과 목록 도구가 **같은 함수**로 잰다.
 * 보안용이 아니다
 */
export function regionDigest(
  sheet: SheetPixels, item: { x: number, y: number, w: number, h: number },
  rect: readonly [number, number, number, number],
): string {
  const x0 = Math.max(0, Math.floor(rect[0])), y0 = Math.max(0, Math.floor(rect[1]))
  const x1 = Math.min(item.w, Math.ceil(rect[2])), y1 = Math.min(item.h, Math.ceil(rect[3]))
  let h = 0x811c9dc5
  const eat = (b: number) => { h ^= b & 0xff; h = Math.imul(h, 0x01000193) }
  eat(x1 - x0); eat(y1 - y0)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = ((item.y + y) * sheet.width + item.x + x) * 4
      for (let k = 0; k < 4; k++) eat(sheet.pixels[o + k]!)
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
