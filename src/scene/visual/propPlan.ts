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
  const parts = sourceParts(arrays, { kind: 'prop', assetId, texSet: null, hashOf: () => '-' })
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
    if (byId.get(d.recipeId ?? '')?.geometry !== 'cross-cards') continue
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
): BufferGeometry | null {
  const want = crossClaims(mesh, sheet, assetId, recipes, mode)
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
  let low = Infinity
  for (const v of picked) low = Math.min(low, pos.getY(v))
  const base = picked.filter((v) => pos.getY(v) - low < 1e-4)
  let cx = 0, cy = 0, cz = 0
  for (const v of base) {
    cx += pos.getX(v) / base.length; cy += pos.getY(v) / base.length; cz += pos.getZ(v) / base.length
  }
  // 카드 면의 방향 — 앞뒤가 섞여 있어도 한쪽으로 모아 더한다
  let nx = 0, ny = 0, nz = 0
  for (const v of picked) {
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

  const made = new BufferGeometry()
  for (const [name, attr] of attrs) {
    const size = attr.itemSize
    const data = new Float32Array(picked.length * size)
    picked.forEach((v, i) => {
      for (let k = 0; k < size; k++) data[i * size + k] = attr.getComponent(v, k)
      if (name === 'position') {
        const [x, y, z] = turn(attr.getX(v) - cx, attr.getY(v) - cy, attr.getZ(v) - cz)
        data[i * size] = cx + x
        data[i * size + 1] = cy + y
        data[i * size + 2] = cz + z
      } else if (name === 'normal') {
        const [x, y, z] = turn(attr.getX(v), attr.getY(v), attr.getZ(v))
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
