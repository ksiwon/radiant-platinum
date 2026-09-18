// 청크 하나의 표현 계획 (FIRST_PERSON §4.5-1)
//
//     planChunk → (plates가 plan을 따라 원본을 거른다) + (Planters가 대체물을 세운다)
//
// ⚠️ **레시피가 없거나 legacy면 아무것도 안 한다** — `plan`이 undefined이고, 그때
// `plates`의 모든 함수는 예전과 한 글자도 안 다르게 돈다.
//
// ⚠️ **대체물은 같은 커밋에 선다.** 화분 모양은 동기로 만들어지고 `ChunkModels`가
// 땅과 같은 `setState` 묶음으로 `Planters`에 넘긴다. 그래서 여기서 곧바로 `ready`로
// 적는다 — 색을 못 꺼내면 그 조각만 `failed`로 현행 표현에 돌려보낸다.
import type { ChunkMesh, TexSheet } from '../chunkMesh'
import type { PlanterGroup, PlanterSite } from './Planters'
import { PLANTER_FILL } from './planter'
import { markFailed, markReady, planOf, resolveParts, type RecipeMode } from './resolve'
import { regionDigest, sourceParts, type MeshArrays } from './sourceParts'
import {
  bollardSwatch, fenceSwatch, PLANTER_LAYOUTS, planterSwatch, shrubSwatch,
  type BollardSwatch, type FenceSwatch, type PlanterSwatch, type ShrubSwatch,
} from './swatches'
import type { PartDecision, ResolvedVisualPlan, SourcePart, VisualRecipe } from './types'

/** 세울 것 하나 — 무리 열쇠·폭·색과 자리 (`Omit`은 판별 유니언을 뭉개서 따로 적는다) */
type Planned = { key: string, width: number, site: PlanterSite }
  & (
    | { kind: 'planter', swatch: PlanterSwatch }
    | { kind: 'shrub', swatch: ShrubSwatch }
    | { kind: 'fence', swatch: FenceSwatch, u0: number, u1: number }
    | {
      kind: 'bollard', variant: 'chain' | 'grass', swatch: BollardSwatch, u0: number, u1: number,
    }
  )

/**
 * 계획 하나를 **자리를 뺀 무리**로 바꾼다. 자리는 무리가 아니라 `items`에 든다 —
 * 같은 모양이면 청크를 넘어 한 무리로 모이기 때문이다
 */
export function planterGroupOf(one: Planned): PlanterGroup {
  const base = { key: one.key, width: one.width, items: [] as PlanterGroup['items'] }
  return one.kind === 'fence'
    ? { ...base, kind: 'fence', swatch: one.swatch, u0: one.u0, u1: one.u1 }
    : one.kind === 'bollard'
      ? { ...base, kind: 'bollard', variant: one.variant, swatch: one.swatch, u0: one.u0, u1: one.u1 }
      : one.kind === 'shrub'
        ? { ...base, kind: 'shrub', swatch: one.swatch }
        : { ...base, kind: 'planter', swatch: one.swatch }
}

interface ChunkPlan {
  plan: ResolvedVisualPlan
  /** 이 청크가 세울 화분·덤불 — 무리 열쇠마다 */
  planters: Planned[]
}

type Item = TexSheet['items'][number]

const itemOf = (sheet: TexSheet, tex: string | null, pal: string | null): Item | null =>
  sheet.items.find((s) => s.tex === tex && s.pal === (pal ?? '')) ?? null

/** 원본 조각의 수평 경첩 방향과 그 방향의 폭 */
function hinge(arrays: MeshArrays, part: SourcePart): { yaw: number, width: number } {
  const [nx, , nz] = part.normal
  let hx = nz, hz = -nx
  const len = Math.hypot(hx, hz)
  if (len < 1e-6) { hx = 1; hz = 0 } else { hx /= len; hz /= len }
  let lo = Infinity, hi = -Infinity
  for (const o of part.triangleOffsets) {
    for (let k = 0; k < 3; k++) {
      const i = arrays.index[o + k]!
      const d = arrays.position[i * 3]! * hx + arrays.position[i * 3 + 2]! * hz
      if (d < lo) lo = d
      if (d > hi) hi = d
    }
  }
  return { yaw: Math.atan2(hz, hx), width: hi - lo }
}

/**
 * 세운 판의 **밑변**과 양 끝의 칸 텍셀 u (§6.2 울타리).
 *
 * 판은 45°로 누워 있어 상자 가운데가 밑변이 아니다 — `standCutouts`가 가장 낮은
 * 정점을 경첩으로 삼아 세우므로 그 정점의 가로축 수직 거리가 울타리가 설 줄이다.
 * u는 가로축 양 끝 정점의 UV를 칸 폭으로 옮긴 값이다(반복이면 칸 밖 그대로)
 */
function baseline(
  arrays: MeshArrays, part: SourcePart, itemW: number,
): { x: number, y: number, z: number, u0: number, u1: number } | null {
  if (arrays.uv === undefined) return null
  const [nx, , nz] = part.normal
  let hx = nz, hz = -nx
  const len = Math.hypot(hx, hz)
  if (len < 1e-6) return null
  hx /= len; hz /= len
  let lo = Infinity, hi = -Infinity, uLo = 0, uHi = 0
  let low = Infinity, cross = 0
  for (const o of part.triangleOffsets) {
    for (let k = 0; k < 3; k++) {
      const i = arrays.index[o + k]!
      const x = arrays.position[i * 3]!, y = arrays.position[i * 3 + 1]!, z = arrays.position[i * 3 + 2]!
      const d = x * hx + z * hz
      const u = arrays.uv[i * 2]! * itemW
      if (d < lo) { lo = d; uLo = u }
      if (d > hi) { hi = d; uHi = u }
      if (y < low) { low = y; cross = -x * hz + z * hx }
    }
  }
  if (!(hi - lo > 1e-6) || Math.abs(uHi - uLo) < 1e-6) return null
  const mid = (lo + hi) / 2
  return { x: mid * hx - cross * hz, y: low, z: mid * hz + cross * hx, u0: uLo, u1: uHi }
}

/**
 * 청크 하나의 계획. 걸 레시피가 없으면 null.
 *
 * `set`은 이 청크를 그리는 묶음 번호다 (`chunkSheets`) — 지문 캐시 열쇠에 든다
 */
export function planChunk(
  mesh: ChunkMesh, sheet: TexSheet, set: number, assetId: number,
  recipes: readonly VisualRecipe[], mode: RecipeMode,
): ChunkPlan | null {
  if (mode === 'legacy' || recipes.length === 0) return null
  const texes = new Set(recipes.flatMap((r) => r.selectors.map((s) => s.tex)))
  const groups = new Set<number>()
  mesh.materials.forEach((m, g) => { if (m.tex !== null && texes.has(m.tex)) groups.add(g) })
  if (groups.size === 0) return null

  const geometry = mesh.geometry
  const arrays: MeshArrays = {
    index: geometry.getIndex()!.array,
    position: geometry.getAttribute('position').array,
    uv: geometry.getAttribute('uv')?.array,
    // 레시피가 볼 서브메시만 — 나머지는 조각을 안 센다(넓이만 늘린다)
    groups: mesh.groups.map((g, i) => (groups.has(i) ? g : [g[0], g[1], 0] as [number, number, number])),
    materials: mesh.materials,
  }
  const parts = sourceParts(arrays, { kind: 'chunk', assetId, texSet: set, hashOf: () => '-' })
  const digests = new Map<string, string>()
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

  const byId = new Map(parts.map((p) => [p.componentId, p]))
  const recipeOf = new Map(recipes.map((r) => [r.id, r]))
  const planters: ChunkPlan['planters'] = []
  const settled: PartDecision[] = decisions.map((d) => {
    if (d.status !== 'pending') return d
    const part = byId.get(d.componentId)!
    const recipe = recipeOf.get(d.recipeId ?? '')
    const kind = recipe?.geometry
    const line2 = kind === 'bollard-chain' ? 'chain' : kind === 'bollard-grass' ? 'grass' : null
    if (recipe === undefined
      || (kind !== 'planter' && kind !== 'shrub' && kind !== 'fence' && line2 === null)) {
      return markFailed(d, `만들 줄 모르는 형상 (${String(kind)})`)
    }
    const item = itemOf(sheet, part.source.tex, part.source.pal)
    const sel = recipe.selectors[0]!
    const hash = item === null ? null : (digests.get(`${part.source.tex ?? ''}/${part.source.pal ?? ''}/${sel.within.join(',')}`) ?? null)
    const { yaw, width: plate } = hinge(arrays, part)
    const [x0, y0, z0, x1, , z1] = part.bounds
    const width = +(plate * PLANTER_FILL).toFixed(3)
    const site = { x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2, yaw }
    const key = `${recipe.id}@${String(recipe.version)}/${String(hash)}/${String(width)}`
    if (kind === 'fence' || line2 !== null) {
      const swatch = item === null ? null
        : line2 === null ? fenceSwatch(sheet, item) : bollardSwatch(sheet, item, line2)
      const line = item === null ? null : baseline(arrays, part, item.w)
      if (swatch === null || line === null) return markFailed(d, `울타리 줄을 못 읽었다 (${String(hash)})`)
      const length = +plate.toFixed(3)
      // 기둥 자리는 u를 `pitch`로 나눈 나머지만 본다 — 같은 모양이면 청크를 넘어 모인다
      const shift = Math.floor(Math.min(line.u0, line.u1) / 8) * 8
      const u0 = +(line.u0 - shift).toFixed(3), u1 = +(line.u1 - shift).toFixed(3)
      const key2 = `${recipe.id}@${String(recipe.version)}/${String(hash)}/${String(length)}/${String(u0)}:${String(u1)}`
      const site2 = { x: line.x, y: line.y, z: line.z, yaw }
      planters.push(line2 === null
        ? { kind: 'fence', key: key2, width: length, swatch: swatch as FenceSwatch, u0, u1, site: site2 }
        : {
          kind: 'bollard', variant: line2, key: key2, width: length,
          swatch: swatch as BollardSwatch, u0, u1, site: site2,
        })
    } else if (kind === 'planter') {
      const layout = hash === null ? undefined : PLANTER_LAYOUTS[hash]
      const swatch = item === null || layout === undefined ? null : planterSwatch(sheet, item, layout)
      if (swatch === null) return markFailed(d, `색 자리를 못 읽었다 (${String(hash)})`)
      planters.push({ kind: 'planter', key, width, swatch, site })
    } else {
      // 덤불 칸의 왼쪽 위는 선택자의 `within`이 말해 준다 (imped 48,32 · bf_ueki01 0,0)
      const swatch = item === null ? null
        : shrubSwatch(sheet, item, [sel.within[0], sel.within[1]])
      if (swatch === null) return markFailed(d, `색 자리를 못 읽었다 (${String(hash)})`)
      planters.push({ kind: 'shrub', key, width, swatch, site })
    }
    return markReady(d)
  })
  return { plan: planOf(settled), planters }
}

/**
 * `plates`가 쓰는 **사각형 시작 자리** 규약으로 바꾼다 (`plateLumps`·`splitFoliage`).
 * 삼각형 자리 `o`의 사각형 시작은 그 서브메시 시작에서 6의 배수만큼이다
 */
export function quadStarts(mesh: ChunkMesh, offsets: ReadonlySet<number>): Set<number> {
  const out = new Set<number>()
  if (offsets.size === 0) return out
  for (const [, start, count] of mesh.groups) {
    for (const o of offsets) {
      if (o < start || o >= start + count) continue
      out.add(o - ((o - start) % 6))
    }
  }
  return out
}
