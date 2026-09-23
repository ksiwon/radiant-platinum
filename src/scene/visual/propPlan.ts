// 소품의 납작한 오려 낸 그림 (FIRST_PERSON §12 FP-07 · §6.5)
//
// ⚠️ **원본을 안 지운다.** 화분에 심은 작은 나무(`plant01`)는 잎 한 장 · 줄기 한 장을
// 20° 기울여 세운 카드라, 옆에서 보면 종이 한 장이 된다. 새 색을 짓거나 덩이로
// 바꾸면 원작이 그린 잎을 잃는다 — 그래서 **같은 그림을 한 번 더, 90° 돌려 세운다**.
// 더하는 것만 있고 지우는 것은 없다 (`outcome: 'augment'`).
//
// 돌리는 축은 카드의 **등줄기**다 — 밑동(가장 낮은 정점들의 한가운데)을 지나, 카드 면
// 안에서 가로와 직각인 기운 선. 화면 실측으로 둘 다 틀렸다 —
//   · 세로축 · 가로 한가운데: 밑동이 옮겨져 줄기가 화분에서 둘로 벌어진다 (plant-after)
//   · 세로축 · 밑동: 밑동은 모이지만 20° 기운 것까지 돌아 두 장이 V로 벌어진다 (plant-after2)
// 등줄기로 돌리면 두 장이 같은 선을 나눠 가진 X가 된다. 화분은 원본 그대로다.
import { BufferAttribute, BufferGeometry, type InterleavedBufferAttribute } from 'three'
import type { ChunkMesh, TexSheet } from '../chunkMesh'
import { standCard } from '../plates'
import { resolveParts, type RecipeMode } from './resolve'
import { regionDigest, sourceParts, type MeshArrays } from './sourceParts'
import type { VisualRecipe } from './types'

const itemOf = (sheet: TexSheet, tex: string | null, pal: string | null) =>
  sheet.items.find((s) => s.tex === tex && s.pal === (pal ?? '')) ?? null

/**
 * 십자 카드 레시피가 **맡은 삼각형** — 자리 → 레시피 번호. 목록(`firstPersonSources`)이
 * 게임과 같은 판정으로 세도록 따로 둔다
 */
export function crossClaims(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
  /** 청크면 `'chunk'`와 그 청크를 그리는 묶음 번호 — 선택자의 `kind`가 이걸로 갈린다 */
  kind: 'prop' | 'chunk' = 'prop', texSet: number | null = null,
): Map<number, string> {
  return claimsFor('cross-cards', mesh, sheet, assetId, recipes, mode, kind, texSet)
}

/** 세우기 레시피가 맡은 삼각형 (소품만 — 청크는 `plates.standCutouts`가 세운다) */
export function standClaims(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): Map<number, string> {
  return claimsFor('stand-card', mesh, sheet, assetId, recipes, mode, 'prop', null)
}

/** 입체 나무로 바꿀 잎 카드 (소품만 — 꿀나무) */
export function treeClaims(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): Map<number, string> {
  return claimsFor('tree', mesh, sheet, assetId, recipes, mode, 'prop', null)
}

/**
 * 계단 레시피가 맡은 **비탈** (소품만). 우물 벽은 선택자로 못 잡아서 `stairs.stairClaims`가
 * 모양으로 더한다 — 여기는 레시피가 고른 것만이다
 */
export function stairRampClaims(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): Map<number, string> {
  return claimsFor('stairs-down', mesh, sheet, assetId, recipes, mode, 'prop', null)
}

/** 방석·의자 레시피가 맡은 **눕힌 그림** (소품만 · `seats.propSeat`) */
export function seatClaims(
  shape: 'cushion' | 'stool',
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): Map<number, string> {
  return claimsFor(shape, mesh, sheet, assetId, recipes, mode, 'prop', null)
}

function claimsFor(
  geometryKind: 'cross-cards' | 'stand-card' | 'tree' | 'stairs-down' | 'cushion' | 'stool',
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
  kind: 'prop' | 'chunk', texSet: number | null,
): Map<number, string> {
  const want = new Map<number, string>()
  if (sheet === null) return want
  const geometry = mesh.geometry
  const index = geometry.getIndex()
  if (index === null) return want
  const arrays: MeshArrays = {
    index: index.array,
    position: geometry.getAttribute('position').array,
    uv: geometry.getAttribute('uv')?.array,
    groups: mesh.groups,
    materials: mesh.materials,
  }
  const digests = new Map<string, string>()
  const parts = sourceParts(arrays, { kind, assetId, texSet, hashOf: () => '-' })
  const decisions = resolveParts(parts, recipes, {
    mode,
    itemSize: (p) => itemOf(sheet, p.source.tex, p.source.pal),
    regionHash: (p, rect) => {
      const item = itemOf(sheet, p.source.tex, p.source.pal)
      if (item === null) return null
      const k = `${p.source.tex ?? ''}/${p.source.pal ?? ''}/${rect.join(',')}`
      let d = digests.get(k)
      if (d === undefined) { d = regionDigest(sheet, item, rect); digests.set(k, d) }
      return d
    },
  })
  const byId = new Map(recipes.map((r) => [r.id, r]))
  for (const d of decisions) {
    // `augment`는 지울 것이 없어 곧바로 `ready`다 (`resolve`) — 둘 다 받는다
    if (d.status !== 'ready' && d.status !== 'pending') continue
    if (byId.get(d.recipeId ?? '')?.geometry !== geometryKind) continue
    for (const o of d.claimOffsets) want.set(o, d.recipeId!)
  }
  return want
}

/**
 * 맡은 조각을 **90° 돌려 한 벌 더** 만든다. 맞는 레시피가 없으면 null.
 *
 * 돌아온 기하는 원본과 **같은 재질 칸**을 쓴다 (`mergeByMaterial`이 합칠 수 있다).
 * 새 그림도 새 색도 없다 — 원본 삼각형의 좌표만 돌린 것이다
 */
export function crossCards(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
  kind: 'prop' | 'chunk' = 'prop', texSet: number | null = null,
): BufferGeometry | null {
  const want = crossClaims(mesh, sheet, assetId, recipes, mode, kind, texSet)
  if (want.size === 0) return null
  const geometry = mesh.geometry
  const index = geometry.getIndex()!

  // 맡은 삼각형의 정점 — 차례를 지켜 새 색인으로 옮긴다
  const idx = index.array
  const attrs = Object.entries(geometry.attributes) as [string, BufferAttribute | InterleavedBufferAttribute][]
  const map = new Map<number, number>()
  const picked: number[] = []
  const take = (v: number): number => {
    const hit = map.get(v)
    if (hit !== undefined) return hit
    const at = picked.length
    picked.push(v)
    map.set(v, at)
    return at
  }
  const groups: { start: number, count: number, material: number }[] = []
  const out: number[] = []
  // ⚠️ **재질 칸은 서브메시 차례다.** `groups[i][0]`은 롬 재질 번호라 다르다
  // (`chunkMesh`가 `addGroup(start, count, i)`로 붙인다)
  mesh.groups.forEach(([, start, count], material) => {
    const from = out.length
    for (let t = start; t < start + count; t += 3) {
      if (!want.has(t)) continue
      out.push(take(idx[t]!), take(idx[t + 1]!), take(idx[t + 2]!))
    }
    if (out.length > from) groups.push({ start: from, count: out.length - from, material })
  })
  if (out.length === 0) return null

  const pos = geometry.getAttribute('position')
  const nor = geometry.getAttribute('normal') as BufferAttribute | InterleavedBufferAttribute | undefined

  /**
   * ⚠️ **그루마다 따로 돌린다.** 소품 85는 나무가 한 그루라 맡은 삼각형 전부를 한
   * 밑동 둘레로 돌려도 됐다. 청크에는 한 방에 여러 그루가 선다 — 청크 332(리조트
   * 별장)에 두 그루. 한 축으로 돌리면 한 그루는 제 밑동이 아닌 곳을 축으로 돌아
   * 방 한가운데로 날아간다. 잎 카드와 줄기 카드는 밑동이 같아 **바닥 상자가
   * 겹친다** — 그것을 이어 한 그루로 친다
   */
  const tris: number[][] = []
  for (let t = 0; t < out.length; t += 3) tris.push([out[t]!, out[t + 1]!, out[t + 2]!])
  const boxes = tris.map((vs) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    for (const i of vs) {
      const v = picked[i]!
      x0 = Math.min(x0, pos.getX(v)); x1 = Math.max(x1, pos.getX(v))
      z0 = Math.min(z0, pos.getZ(v)); z1 = Math.max(z1, pos.getZ(v))
    }
    return [x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05] as const
  })
  const root = tris.map((_, i) => i)
  const find = (i: number): number => { while (root[i] !== i) { root[i] = root[root[i]!]!; i = root[i]! } return i }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i]!, q = boxes[j]!
      if (p[0] <= q[2] && q[0] <= p[2] && p[1] <= q[3] && q[1] <= p[3]) root[find(i)] = find(j)
    }
  }
  /** 정점(새 색인) → 그 그루의 돌리기 */
  const turnOf = new Map<number, (x: number, y: number, z: number, normal: boolean) => [number, number, number]>()
  const trees = new Map<number, Set<number>>()
  tris.forEach((vs, i) => {
    const r = find(i)
    let set = trees.get(r)
    if (!set) { set = new Set(); trees.set(r, set) }
    for (const v of vs) set.add(v)
  })
  for (const verts of trees.values()) {
    const vs = [...verts].map((i) => picked[i]!)
    let low = Infinity
    for (const v of vs) low = Math.min(low, pos.getY(v))
    const base = vs.filter((v) => pos.getY(v) - low < 1e-4)
    let cx = 0, cy = 0, cz = 0
    for (const v of base) {
      cx += pos.getX(v) / base.length; cy += pos.getY(v) / base.length; cz += pos.getZ(v) / base.length
    }
    // 카드 면의 방향 — 앞뒤가 섞여 있어도 한쪽으로 모아 더한다
    let nx = 0, ny = 0, nz = 0
    for (const v of vs) {
      const x = nor?.getX(v) ?? 0, y = nor?.getY(v) ?? 0, z = nor?.getZ(v) ?? 0
      const s = x * nx + y * ny + z * nz < 0 ? -1 : 1
      nx += s * x; ny += s * y; nz += s * z
    }
    // 가로 w = 위 × n, 등줄기 k = n × w. 면이 없거나 누웠으면 세로축으로 돈다
    let wx = nz, wz = -nx
    let kx = 0, ky = 1, kz = 0
    const wl = Math.hypot(wx, wz)
    if (wl > 1e-6) {
      wx /= wl; wz /= wl
      kx = ny * wz
      ky = nz * wx - nx * wz
      kz = -ny * wx
      const kl = Math.hypot(kx, ky, kz)
      kx /= kl; ky /= kl; kz /= kl
      if (ky < 0) { kx = -kx; ky = -ky; kz = -kz }
    }
    /** 등줄기 둘레 90° (로드리게스, θ = 90°): v′ = k × v + k (k · v) */
    const turn = (x: number, y: number, z: number): [number, number, number] => {
      const d = kx * x + ky * y + kz * z
      return [ky * z - kz * y + kx * d, kz * x - kx * z + ky * d, kx * y - ky * x + kz * d]
    }
    const f = (x: number, y: number, z: number, normal: boolean): [number, number, number] => {
      if (normal) return turn(x, y, z)
      const [a, b, c] = turn(x - cx, y - cy, z - cz)
      return [cx + a, cy + b, cz + c]
    }
    for (const i of verts) turnOf.set(i, f)
  }

  const made = new BufferGeometry()
  for (const [name, attr] of attrs) {
    const size = attr.itemSize
    const data = new Float32Array(picked.length * size)
    picked.forEach((v, i) => {
      for (let k = 0; k < size; k++) data[i * size + k] = attr.getComponent(v, k)
      if (name === 'position') {
        const [x, y, z] = turnOf.get(i)!(attr.getX(v), attr.getY(v), attr.getZ(v), false)
        data[i * size] = x
        data[i * size + 1] = y
        data[i * size + 2] = z
      } else if (name === 'normal') {
        const [x, y, z] = turnOf.get(i)!(attr.getX(v), attr.getY(v), attr.getZ(v), true)
        data[i * size] = x
        data[i * size + 1] = y
        data[i * size + 2] = z
      }
    })
    made.setAttribute(name, new BufferAttribute(data, size))
  }
  made.setIndex(out)
  for (const g of groups) made.addGroup(g.start, g.count, g.material)
  return made
}

/**
 * 맡은 카드를 **세운** 몸통 기하. 맞는 레시피가 없으면 null.
 *
 * 원작은 묘비·체육관 석상·조각상을 **뒤로 눕힌 그림 한 장**으로 그렸다 — 고정
 * 카메라에서 서 보이라고다(묘비 42.8° · 석상 35.6~58.2° · 조각상 45°). 1인칭에서는
 * 책이 기댄 판이 된다. 청크의 `standCutouts`와 같은 규칙으로 **가장 낮은 모서리를
 * 경첩으로** 세운다 — 새 좌표계·색·그림이 없다. 몸통을 통째로 복제하고 맡은 정점만
 * 옮기므로 받침(석상 받침·조각상 받침)은 원본 그대로다.
 *
 * 법선은 다시 계산한다 — 롬 법선을 안 쓰는 것과 같은 까닭이다 (`chunkMesh`)
 */
export function standProp(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): BufferGeometry | null {
  const want = standClaims(mesh, sheet, assetId, recipes, mode)
  if (want.size === 0) return null
  const made = mesh.geometry.clone()
  const pos = made.getAttribute('position') as BufferAttribute
  const idx = made.getIndex()!.array
  // 판마다 따로 세운다 — 정점을 함께 쓰는 삼각형끼리 묶는다
  const root = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (root.get(r) !== r) r = root.get(r)!
    return r
  }
  for (const t of want.keys()) {
    for (let k = 0; k < 3; k++) if (!root.has(idx[t + k]!)) root.set(idx[t + k]!, idx[t + k]!)
    for (let k = 1; k < 3; k++) {
      const a = find(idx[t]!), b = find(idx[t + k]!)
      if (a !== b) root.set(a, b)
    }
  }
  const parts = new Map<number, { n: [number, number, number], verts: Set<number> }>()
  const p = pos.array as Float32Array
  for (const t of want.keys()) {
    const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!
    const r = find(a)
    let part = parts.get(r)
    if (!part) { part = { n: [0, 0, 0], verts: new Set() }; parts.set(r, part) }
    const ux = p[b * 3]! - p[a * 3]!, uy = p[b * 3 + 1]! - p[a * 3 + 1]!, uz = p[b * 3 + 2]! - p[a * 3 + 2]!
    const vx = p[c * 3]! - p[a * 3]!, vy = p[c * 3 + 1]! - p[a * 3 + 1]!, vz = p[c * 3 + 2]! - p[a * 3 + 2]!
    part.n[0] += uy * vz - uz * vy; part.n[1] += uz * vx - ux * vz; part.n[2] += ux * vy - uy * vx
    part.verts.add(a); part.verts.add(b); part.verts.add(c)
  }
  for (const part of parts.values()) {
    const l = Math.hypot(...part.n)
    if (l < 1e-9) continue
    standCard(p, [...part.verts], [part.n[0] / l, part.n[1] / l, part.n[2] / l])
  }
  pos.needsUpdate = true
  made.computeVertexNormals()
  made.computeBoundingSphere()
  return made
}

/**
 * 맡은 삼각형을 **넓이 0으로 접은** 몸통 사본. 맡은 것이 없으면 원본.
 *
 * 색인 차례가 서브메시 구획이라 삼각형을 빼면 구획이 어긋난다 — 그래서 빼지 않고 접는다
 */
export function dropClaims(mesh: ChunkMesh, claims: ReadonlyMap<number, string>): ChunkMesh {
  if (claims.size === 0) return mesh
  const geometry = mesh.geometry.clone()
  const idx = geometry.getIndex()!
  const a = idx.array as Uint16Array | Uint32Array
  for (const t of claims.keys()) { a[t + 1] = a[t]!; a[t + 2] = a[t]! }
  idx.needsUpdate = true
  return { ...mesh, geometry }
}

/**
 * 메운 판(`shell.shellPlates`)을 셀 몸통 — **세울 카드와 나무로 바꿀 잎 카드를 뺀다.**
 *
 * ⚠️ 메운 판은 모델이 안 그린 옆·뒤를 **보이는 것을 그 경계에 투영해** 메운다. 눕힌 카드도
 * 투영돼 뒤쪽에 수직 판이 하나 서 있었다(묘비 z −0.38 · 높이 0.75). 카드를 세우고 그 판을
 * 그대로 두면 **비석이 두 장**이 된다. 소품은 양면으로 그리므로(`ChunkModels`) 세운 카드에는
 * 뒤를 메울 판이 필요 없다 — 받침의 메운 판만 남는다 (조각상 y ≤ 1.16 · 석상 y ≤ 1.66).
 * 나무로 바꾼 잎 카드도 같다 — 안 빼면 입체 나무 뒤에 잎 그림 판이 한 장 선다
 */
export function shellBody(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): ChunkMesh {
  const gone = new Map([
    ...standClaims(mesh, sheet, assetId, recipes, mode),
    ...treeClaims(mesh, sheet, assetId, recipes, mode),
  ])
  return dropClaims(mesh, gone)
}

/** 소품이 세울 입체 나무 한 그루 — 모델 좌표 */
export interface PropTree {
  /** 잎 카드가 차지한 높이 범위. 나무 크기를 정한다 (`Foliage.treeAt`) */
  minY: number
  maxY: number
  /** 밑동 자리 — 잎 카드 발자국의 한가운데 */
  x: number
  z: number
  leaf: number[]
  trunk: number
}

/**
 * **잎 카드 더미를 입체 나무 하나로** (FP-07 `tilted` 꼬리 · 꿀나무).
 *
 * 꿀나무(소품 26)는 땅에 깐 그루터기 한 장과 **55°로 눕혀 겹쳐 쌓은 잎 뭉치 세 장**이다
 * (갈색 · 황토 · 노랑). 고정 카메라에서는 겹쳐 둥근 금빛 나무로 보이지만 1인칭에서는
 * 기운 원판 세 장이다 — 세우거나 십자로 겹쳐도 판 더미다. 그래서 **청크의 나무와 같은
 * 입체 나무**(`Foliage`)로 바꾼다: 크기는 잎 카드 더미의 높이가, 색은 **잎 카드가 실제로
 * 찍는 텍셀**이 정한다. 그루터기 판은 그대로 둔다.
 *
 * 줄기 색은 같은 그림의 나머지(맡지 않은 칸)에서 가장 흔한 갈색이다 — 꿀나무는 그루터기
 */
export function propTree(
  mesh: ChunkMesh, sheet: TexSheet | null, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): PropTree | null {
  if (sheet === null) return null
  const want = treeClaims(mesh, sheet, assetId, recipes, mode)
  if (want.size === 0) return null
  const geometry = mesh.geometry
  const idx = geometry.getIndex()!.array
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  let minY = Infinity, maxY = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  // 잎 카드가 찍는 텍셀 — 그림 칸 안의 좌표로. **카드(서브메시)마다 따로** 센다
  const leafCount = new Map<number, Map<number, number>>()
  const restCount = new Map<number, number>()
  const claimedGroups = new Set<number>()
  const tally = (into: Map<number, number>, item: { x: number, y: number, w: number, h: number },
    u0: number, v0: number, u1: number, v1: number) => {
    const fold = (t: number, n: number) => ((Math.floor(t) % n) + n) % n
    for (let ty = Math.floor(v0 * item.h); ty < Math.ceil(v1 * item.h); ty++) {
      for (let tx = Math.floor(u0 * item.w); tx < Math.ceil(u1 * item.w); tx++) {
        const o = ((item.y + fold(ty, item.h)) * sheet.width + item.x + fold(tx, item.w)) * 4
        if (sheet.pixels[o + 3]! < 128) continue
        const rgb = (sheet.pixels[o]! << 16) | (sheet.pixels[o + 1]! << 8) | sheet.pixels[o + 2]!
        into.set(rgb, (into.get(rgb) ?? 0) + 1)
      }
    }
  }
  mesh.groups.forEach(([, start, count], group) => {
    const m = mesh.materials[group]!
    const item = itemOf(sheet, m.tex, m.pal)
    for (let t = start; t < start + count; t += 3) {
      const mine = want.has(t)
      if (mine) claimedGroups.add(group)
      let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k]!
        if (mine) {
          minY = Math.min(minY, pos.getY(v)); maxY = Math.max(maxY, pos.getY(v))
          x0 = Math.min(x0, pos.getX(v)); x1 = Math.max(x1, pos.getX(v))
          z0 = Math.min(z0, pos.getZ(v)); z1 = Math.max(z1, pos.getZ(v))
        }
        u0 = Math.min(u0, uv.getX(v)); u1 = Math.max(u1, uv.getX(v))
        v0 = Math.min(v0, uv.getY(v)); v1 = Math.max(v1, uv.getY(v))
      }
      if (item === null) continue
      let into = restCount
      if (mine) {
        into = leafCount.get(group) ?? new Map()
        leafCount.set(group, into)
      }
      tally(into, item, u0, v0, u1, v1)
    }
  })
  const ranked = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  const brown = (c: number) => {
    const r = c >> 16, g = (c >> 8) & 255, b = c & 255
    return r > b + 24 && r >= g && r + g + b < 520
  }
  // ⚠️ **카드마다 가장 많이 찍는 색 하나씩.** 꿀나무는 층마다 색이 다르다 — 아래·뒤 갈색
  // #947b39 · 가운데 황토 #ad9439 · 위 노랑 #c6ad39. 넓이로 순위를 매기면 제일 큰 갈색 층이
  // 세 자리를 다 가져가 금빛 나무가 흙빛이 된다 (실측). 밝은 것부터 — `plateColors`와 같은
  // 차례다 (밝은 쪽이 잎 윗면)
  const luma = (c: number) => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)
  const leaf = [...new Set([...leafCount.values()].map((m) => ranked(m)[0]!).filter((c) => c !== undefined))]
    .sort((a, b) => luma(b) - luma(a)).slice(0, 3)
  const trunk = ranked(restCount).find(brown) ?? 0x4a3a24
  return {
    minY, maxY, x: (x0 + x1) / 2, z: (z0 + z1) / 2,
    leaf: leaf.length > 0 ? leaf : [0x4f9e52], trunk,
  }
}
