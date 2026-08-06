// 소품의 빠진 면을 만든다 (DATA.md §2.2)
//
// 원작 집은 **면이 통째로 없다.** 소품 590종 중 여섯 방향이 다 있는 것이 78종뿐이고,
// 오버월드 배치 501개로 세면 −Z가 64% · −X가 40% · +Y가 31% · +X가 22%에서 그쪽을
// 보는 면이 0개다. 구멍이 뚫린 것이 아니라 안 만들어져 있다 — 원작 카메라가 고정
// 각도라 만들 이유가 없었다. 그쪽으로 돌아가면 반대편 벽의 **안쪽**이 보인다.
//
// ⚠️ **면적 벡터로는 이걸 못 잰다.** 한 번 그렇게 접근했다가 틀렸다. 경계 고리를
// 부채꼴로 덮으면 면적 벡터는 0에 수렴하는데, 문틀·창틀 같은 안쪽 테두리를 덮고
// 정작 뚫린 쪽은 그대로 두고도 합이 맞는다. 재야 할 것은 넓이가 아니라
// **그쪽에서 본 실루엣이 다 막혔는가**다(`shell.test`가 그걸 잰다).
//
// 그래서 고리를 고르지 않는다. **삼각형을 전부 그쪽 판으로 눌러 붙인다.** 눌러
// 붙인 것들의 합집합이 곧 그 방향에서 본 실루엣이라, 어느 고리가 진짜 구멍인지
// 고를 필요 자체가 없어진다.
import { BufferAttribute, BufferGeometry } from 'three'
import type { ChunkMesh, TexSheet } from './chunkMesh'

/**
 * 판을 이만큼 두께 안에 눌러 담는다 (타일).
 *
 * 한 평면에 완전히 눕히면 겹친 삼각형끼리 깊이가 같아 깜빡인다. 원래 순서를
 * 유지한 채 얇은 층에 담으면, 그 방향에서 볼 때 원작의 제일 바깥면이 앞에 온다 —
 * 뒤에서 보는 박공은 지붕이 아니라 벽으로 보여야 맞다
 */
const SLAB = 0.02
/** 알파 판정 문턱. 재질이 쓰는 `alphaTest: 0.5`와 같은 자리다 */
const ALPHA_CUT = 128
/** 이보다 작으면 그 방향에서 넓이가 0이다 — 모로 선 면이라 실루엣에 안 보탠다 */
export const FLAT = 1e-4

/**
 * 채울 방향 `[축, 부호]`. 축은 0=x · 1=y · 2=z다.
 *
 * **−Y(바닥)는 없다.** 건물 밑은 볼 자리가 없어서 채워 봐야 삼각형만 버린다 —
 * 소품 590종 중 84%가 바닥이 없는데 그게 화면에 나온 적이 없다
 */
export const FILLABLE: readonly (readonly [number, number])[] = [
  [0, -1], [0, 1], [1, 1], [2, -1], [2, 1],
]

/**
 * 뚫렸는지 재는 격자. 주인공 집(5.8타일)에서 한 칸이 0.09타일이다.
 *
 * `shell.test`가 같은 값으로 다시 잰다. 해상도와 `FLAT`은 **재는 눈금**이지
 * 검증 대상이 아니다 — 눈금이 다르면 칸 한가운데를 찍는 자리가 어긋나서
 * 버그가 아닌 표본 차이로 결과가 갈린다. 실제로 그렇게 446칸이 어긋났다
 */
export const GRID = 64

/** 축 방향의 두께. 0이면 그 축에 수직인 **한 장짜리**라 붙일 뒤가 없다 */
function extent(pos: ArrayLike<number>, axis: number): number {
  let lo = Infinity, hi = -Infinity
  for (let i = axis; i < pos.length; i += 3) {
    const c = pos[i]!
    if (c < lo) lo = c
    if (c > hi) hi = c
  }
  return hi - lo
}

/**
 * 그 축에 수직인 격자를 칠한다. `sign`이 0이면 실루엣, ±1이면 그쪽을 보는 면만.
 *
 * ⚠️ **"그쪽 면이 몇 개냐"로 판단하면 안 된다.** 처음에 그렇게 했다가 틀렸다 —
 * 지붕처럼 비스듬한 면도 옆에서 보면 넓이를 보태서, 면 개수로는 "있다"인데
 * 실루엣의 절반만 덮는 경우가 있다. 뚫렸는지는 **덮어 보고** 알아야 한다
 */
function coverage(
  pos: ArrayLike<number>, index: ArrayLike<number>,
  box: readonly number[][], axis: number, sign: number,
): Set<number> {
  const u = (axis + 1) % 3, v = (axis + 2) % 3
  const [u0, u1] = box[0] as [number, number]
  const [v0, v1] = box[1] as [number, number]
  const hit = new Set<number>()
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3
    const area = (pos[b + u]! - pos[a + u]!) * (pos[c + v]! - pos[a + v]!)
      - (pos[c + u]! - pos[a + u]!) * (pos[b + v]! - pos[a + v]!)
    if (Math.abs(area) < FLAT) continue
    if (sign !== 0 && area * sign <= 0) continue
    const lo = (w: number) => Math.min(pos[a + w]!, pos[b + w]!, pos[c + w]!)
    const hi = (w: number) => Math.max(pos[a + w]!, pos[b + w]!, pos[c + w]!)
    const cu0 = Math.max(0, Math.floor(((lo(u) - u0) / (u1 - u0)) * GRID))
    const cu1 = Math.min(GRID - 1, Math.ceil(((hi(u) - u0) / (u1 - u0)) * GRID))
    const cv0 = Math.max(0, Math.floor(((lo(v) - v0) / (v1 - v0)) * GRID))
    const cv1 = Math.min(GRID - 1, Math.ceil(((hi(v) - v0) / (v1 - v0)) * GRID))
    for (let cv = cv0; cv <= cv1; cv++) {
      for (let cu = cu0; cu <= cu1; cu++) {
        const x = u0 + ((cu + 0.5) / GRID) * (u1 - u0)
        const y = v0 + ((cv + 0.5) / GRID) * (v1 - v0)
        const w1 = ((x - pos[a + u]!) * (pos[c + v]! - pos[a + v]!)
          - (pos[c + u]! - pos[a + u]!) * (y - pos[a + v]!)) / area
        const w2 = ((pos[b + u]! - pos[a + u]!) * (y - pos[a + v]!)
          - (x - pos[a + u]!) * (pos[b + v]! - pos[a + v]!)) / area
        if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
        hit.add(cv * GRID + cu)
      }
    }
  }
  return hit
}

function boxOf(pos: ArrayLike<number>, axis: number): number[][] {
  return [(axis + 1) % 3, (axis + 2) % 3].map((a) => {
    let lo = Infinity, hi = -Infinity
    for (let i = a; i < pos.length; i += 3) {
      const c = pos[i]!
      if (c < lo) lo = c
      if (c > hi) hi = c
    }
    return [lo, hi]
  })
}

/**
 * 이 소품에서 **실제로 뚫린** 방향들. 채울 대상이다.
 *
 * 그 방향에서 보이는 실루엣을, 그 방향을 보는 면이 다 덮는지 격자로 확인한다.
 * 한 칸이라도 남으면 뚫린 것이다.
 *
 * 두께가 0인 축은 뺀다 — 간판·그림자처럼 **정면 한 장**은 판을 붙일 뒤가 아예
 * 없고, 양면으로 그리면 그것이 곧 뒷면이다
 */
export function openDirections(mesh: ChunkMesh): (readonly [number, number])[] {
  const pos = (mesh.geometry.getAttribute('position') as BufferAttribute)
    .array as ArrayLike<number>
  const index = mesh.geometry.getIndex()!.array
  return FILLABLE.filter(([axis, sign]) => {
    if (!(extent(pos, axis) > 0)) return false
    const box = boxOf(pos, axis)
    if (!(box[0]![1]! > box[0]![0]!) || !(box[1]![1]! > box[1]![0]!)) return false
    const seen = coverage(pos, index, box, axis, 0)
    if (seen.size === 0) return false
    const face = coverage(pos, index, box, axis, sign)
    for (const c of seen) if (!face.has(c)) return true
    return false
  })
}

/**
 * 서브메시마다 판에 쓸 색. `null`이면 그 서브메시는 판을 안 만든다.
 *
 * 색은 **그 그림의 평균**이다 — 아무 회색이나 칠하면 지역마다 다른 원작 색조가
 * 사라진다. 여기서 `plateColors`처럼 제일 많이 쓰인 색을 쓰지 않는 이유는,
 * 저쪽은 팔레트에서 잎 색과 줄기 색을 **갈라내는** 일이고 이쪽은 텍스처 한 장을
 * 색 하나로 **대신하는** 일이라서다. 대신하는 자리에서는 멀리서 보이는 색이
 * 답인데, 최빈값은 통나무 줄눈처럼 넓게 깔린 윤곽선을 집는다 — 주인공 집 벽이
 * 최빈 #947b73(밝기 129)이고 평균 #a5a28f(밝기 161)다.
 *
 * 그늘로 따로 깎지 않는다. 채우는 면은 대개 태양(24, 42, 18)도 필(−14, 12, 26)도
 * 못 받아 반구광만 닿는다 — 이미 그늘이다. 여기서 또 깎으면 이중이 된다.
 *
 * 오려 낸 그림(`cutout`)은 판을 만들면 안 된다. 판 한 장짜리 울타리·간판이라
 * 눌러 붙이면 없던 널판이 생긴다
 */
export function shellColors(
  mesh: ChunkMesh, sheet: TexSheet | null, cutout: readonly boolean[],
): (number | null)[] {
  return mesh.materials.map((spec, i) => {
    if (cutout[i] === true) return null
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    if (!sheet || !item) return null
    let r = 0, g = 0, b = 0, n = 0
    for (let y = 0; y < item.h; y++) {
      const row = ((item.y + y) * sheet.width + item.x) * 4
      for (let x = 0; x < item.w; x++) {
        const o = row + x * 4
        if (sheet.pixels[o + 3]! < ALPHA_CUT) continue
        r += sheet.pixels[o]!; g += sheet.pixels[o + 1]!; b += sheet.pixels[o + 2]!; n++
      }
    }
    if (n === 0) return null
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
  })
}

/**
 * 한 방향의 판. 없으면 `null`.
 *
 * 그 방향에서 봐서 넓이가 0인 삼각형(모로 선 것)은 실루엣에 아무것도 안 보태므로
 * 버린다 — 주인공 집 뒤판은 219개 중 110개만 남는다.
 *
 * 법선은 전부 그 방향으로 준다. 눌러 붙인 삼각형의 원래 법선은 사방을 보고 있어서
 * 그대로 두면 한 벽이 얼룩덜룩해진다
 */
export function facePlate(
  mesh: ChunkMesh, colors: readonly (number | null)[], axis: number, sign: number,
): BufferGeometry | null {
  const src = mesh.geometry
  const pos = (src.getAttribute('position') as BufferAttribute).array as ArrayLike<number>
  const index = src.getIndex()!.array
  let lo = Infinity, hi = -Infinity
  for (let i = axis; i < pos.length; i += 3) {
    const c = pos[i]!
    if (c < lo) lo = c
    if (c > hi) hi = c
  }
  const depth = hi - lo
  if (!(depth > 0)) return null

  // 바깥 끝에서 시작해 안쪽으로 `SLAB`만큼 들어간다. 원작의 제일 바깥면이
  // 그 방향에서 볼 때 제일 앞에 온다
  const flat = (c: number): number =>
    (sign > 0 ? hi : lo) + sign * SLAB * ((c - lo) / depth)

  const u = (axis + 1) % 3, v = (axis + 2) % 3
  const position: number[] = []
  const color: number[] = []
  mesh.groups.forEach(([, start, count], group) => {
    const rgb = colors[group]
    if (rgb === null || rgb === undefined) return
    const r = ((rgb >> 16) & 255) / 255, g = ((rgb >> 8) & 255) / 255, b = (rgb & 255) / 255
    for (let t = 0; t < count; t += 3) {
      const tri = [index[start + t]!, index[start + t + 1]!, index[start + t + 2]!]
      const p = tri.map((k) => [pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!] as const)
      const area = (p[1]![u] - p[0]![u]) * (p[2]![v] - p[0]![v])
        - (p[2]![u] - p[0]![u]) * (p[1]![v] - p[0]![v])
      if (Math.abs(area) < FLAT) continue
      // **그쪽을 보게 감는다.** 원작의 감는 방향을 그대로 물려받으면 판이 반대를
      // 보고 있어서, 면은 다 있는데 그 방향에서는 하나도 안 보인다
      const wound = area * sign > 0 ? p : [p[0]!, p[2]!, p[1]!]
      for (const q of wound) {
        const out = [q[0], q[1], q[2]]
        out[axis] = flat(q[axis])
        position.push(out[0]!, out[1]!, out[2]!)
        color.push(r, g, b)
      }
    }
  })
  if (position.length === 0) return null

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  const normal = new Float32Array(position.length)
  for (let i = 0; i < normal.length; i += 3) normal[i + axis] = sign
  geo.setAttribute('normal', new BufferAttribute(normal, 3))
  geo.computeBoundingSphere()
  return geo
}

/**
 * 빠진 면을 전부 채운 지오메트리 하나. 없으면 `null`.
 *
 * 방향마다 따로 그리면 소품 하나가 드로우콜을 넷씩 먹는다. 색을 정점이 나르고
 * 재질이 한 벌이라 합칠 수 있다
 */
export function shellPlates(
  mesh: ChunkMesh, colors: readonly (number | null)[],
): BufferGeometry | null {
  const parts: BufferGeometry[] = []
  for (const [axis, sign] of openDirections(mesh)) {
    const p = facePlate(mesh, colors, axis, sign)
    if (p) parts.push(p)
  }
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]!

  let n = 0
  for (const p of parts) n += p.getAttribute('position').count
  const position = new Float32Array(n * 3)
  const normal = new Float32Array(n * 3)
  const color = new Float32Array(n * 3)
  let at = 0
  for (const p of parts) {
    position.set((p.getAttribute('position') as BufferAttribute).array as Float32Array, at * 3)
    normal.set((p.getAttribute('normal') as BufferAttribute).array as Float32Array, at * 3)
    color.set((p.getAttribute('color') as BufferAttribute).array as Float32Array, at * 3)
    at += p.getAttribute('position').count
    p.dispose()
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(position, 3))
  geo.setAttribute('normal', new BufferAttribute(normal, 3))
  geo.setAttribute('color', new BufferAttribute(color, 3))
  geo.computeBoundingSphere()
  return geo
}
