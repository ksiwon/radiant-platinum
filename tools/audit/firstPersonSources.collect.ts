// 1인칭 개선 FP-00 — **원재료와 지금 표현의 전수 목록** (기획서 FIRST_PERSON §11.1)
//
//     node tools/audit/firstPersonSources.mjs
//
// ⚠️ **이 파일은 시험이 아니다.** 이름이 `.test.ts`로 안 끝나서 `pnpm check`가
// 안 줍는다. vitest를 빌리는 까닭은 하나다 — 게임의 로더와 분류 함수(TS)를
// **그대로** 불러야 해서다. 규칙을 여기서 다시 적으면 게임과 목록이 갈라진다.
//
// 세는 것
// - 청크 666 · 소품 590의 서브메시를 **이어진 조각**으로 나눈다. 정점을 함께 쓰는
//   삼각형끼리만 잇는다 — 롬 사각형은 정점을 제 것으로 들고 있어서(청크 0:
//   정점 3226 ÷ 삼각형 1628) 같은 자리여도 UV가 다른 두 판은 안 붙는다.
// - 조각마다 지금 게임이 고르는 길(`outcome`)을 **게임 함수로** 정한다:
//   `cutoutGroups` · `plateLumps` · `isFoliage` · `isBakedShadow` · `rockSites` ·
//   `leaning`. 판정 차례는 `plates.splitFoliage`와 같다.
// - 뜻(`semantic`)은 **아무것도 확정하지 않는다.** 기획서 §3의 imped 영역과 겹치는
//   정도만 `candidate`로 적고, 검수 전에는 `verified`가 없다.
//
// 쓰는 것 — `.audit/first-person/{sources,placements,coverage}.json`
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { it } from 'vitest'
import type { BufferAttribute } from 'three'
import { installNodeAssets } from '../../src/data/romData.testkit'
import {
  loadChunkMesh, loadPropMesh, loadPropSheet, loadTexNames, loadTexSheet,
  type ChunkMesh, type TexSheet,
} from '../../src/scene/chunkMesh'
import {
  cutoutGroups, isBakedShadow, isFoliage, leaning, plateLumps, rockSites,
} from '../../src/scene/plates'
import { bestSet, lendersFor, lendKey, pickSheet } from '../../src/scene/chunkSheets'
import { planChunk, quadStarts } from '../../src/scene/visual/chunkPlan'
import { crossClaims, standClaims, treeClaims } from '../../src/scene/visual/propPlan'
import { VISUAL_RECIPES } from '../../src/scene/visual/recipes'

const ROOT = resolve(__dirname, '../..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, '.audit/first-person')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 지금 게임이 이 조각을 어떻게 그리는가. 이름이 곧 그리는 자리다 */
type Outcome =
  | 'keep:original'        // 롬 삼각형 그대로
  | 'keep:cutout-flat'     // 오려 낸 그림인데 원작 눕힘 각이 아니다 — 그대로 둔다
  | 'stand:card'           // 45°·63.4° 판을 세운다 (standCutouts) + 두께 껍질 (cardShells)
  | 'replace:foliage'      // 잎 판을 걷고 Foliage가 수관을 세운다
  | 'remove:baked-shadow'  // 나무 그림자 판을 걷는다 — 자리는 나무 앞으로 쓴다
  | 'replace:rock-named'   // searock·dun_srock 판을 걷고 Rocks가 세운다
  | 'replace:rock-lump'    // imped 등의 「덩이」 판을 걷고 Rocks가 세운다 — 화분도 여기로 간다
  | 'keep:no-sheet'        // 어느 묶음에도 그 이름이 없다 — 자홍이 된다
  | 'keep:borrowed'        // 이 묶음엔 없지만 **이름으로 남의 묶음에서 빌려 온다** (`lendersFor`)
  | 'replace:recipe'       // 검수된 새 표현 레시피가 맡았다 (`scene/visual`)
  | 'augment:cross-cards'  // 원본은 그대로, 같은 카드를 90° 돌려 한 벌 더 (`visual/propPlan`)

/** 기획서 §3 표 — imped 64×64 안의 좌표, 좌상단 원점, [x0,y0,x1,y1) */
const IMPED_REGIONS: readonly { name: string, rect: readonly [number, number, number, number] }[] = [
  { name: 'fence', rect: [0, 0, 64, 16] },
  { name: 'rail', rect: [0, 20, 64, 28] },
  { name: 'rock-large', rect: [0, 32, 32, 64] },
  { name: 'planter', rect: [32, 32, 48, 48] },
  { name: 'shrub', rect: [48, 32, 64, 48] },
  { name: 'rock-small-brown', rect: [32, 48, 48, 64] },
  { name: 'rock-small-grey', rect: [48, 48, 64, 64] },
]

interface Part {
  kind: 'chunk' | 'prop'
  asset: number
  group: number
  tex: string | null
  pal: string | null
  rep: number
  alpha: number
  tris: number[]
  uv: [number, number, number, number]
  lean: number | null
}

const fmt3 = (n: number): number => Math.round(n * 1000) / 1000

/** 서브메시를 정점 공유로 이어진 조각으로 */
function partsOf(kind: Part['kind'], asset: number, mesh: ChunkMesh): Part[] {
  const index = mesh.geometry.getIndex()!.array
  const pos = (mesh.geometry.getAttribute('position') as BufferAttribute).array as Float32Array
  const uv = (mesh.geometry.getAttribute('uv') as BufferAttribute | undefined)?.array as Float32Array | undefined
  const out: Part[] = []
  mesh.groups.forEach(([, start, count], group) => {
    const spec = mesh.materials[group]!
    const parent = new Map<number, number>()
    const find = (x: number): number => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r)!
      let c = x
      while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n }
      return r
    }
    for (let t = 0; t + 3 <= count; t += 3) {
      const a = index[start + t]!, b = index[start + t + 1]!, c = index[start + t + 2]!
      for (const v of [a, b, c]) if (!parent.has(v)) parent.set(v, v)
      const ra = find(a)
      for (const v of [b, c]) { const rv = find(v); if (rv !== ra) parent.set(rv, ra) }
    }
    const byRoot = new Map<number, Part>()
    const normals = new Map<number, number[]>()
    for (let t = 0; t + 3 <= count; t += 3) {
      const a = index[start + t]!
      const root = find(a)
      let part = byRoot.get(root)
      if (!part) {
        part = {
          kind, asset, group, tex: spec.tex, pal: spec.pal, rep: spec.rep, alpha: spec.a,
          tris: [], uv: [Infinity, Infinity, -Infinity, -Infinity], lean: null,
        }
        byRoot.set(root, part)
      }
      part.tris.push(start + t)
      for (let k = 0; k < 3; k++) {
        const i = index[start + t + k]!
        const u = uv?.[i * 2] ?? 0, v = uv?.[i * 2 + 1] ?? 0
        if (u < part.uv[0]) part.uv[0] = u
        if (v < part.uv[1]) part.uv[1] = v
        if (u > part.uv[2]) part.uv[2] = u
        if (v > part.uv[3]) part.uv[3] = v
      }
      // 넓이 가중 법선 — `plates.standCutouts`와 같은 셈. ⚠️ 첫 삼각형 하나로 재면
      // 평면이 아닌 판(`dhole` 입구: 첫 삼각형 63.4° · 전체 48.0°)을 게임과 다르게 센다
      const b = index[start + t + 1]!, c = index[start + t + 2]!
      const ux = pos[b * 3]! - pos[a * 3]!, uy = pos[b * 3 + 1]! - pos[a * 3 + 1]!, uz = pos[b * 3 + 2]! - pos[a * 3 + 2]!
      const vx = pos[c * 3]! - pos[a * 3]!, vy = pos[c * 3 + 1]! - pos[a * 3 + 1]!, vz = pos[c * 3 + 2]! - pos[a * 3 + 2]!
      const n = normals.get(root) ?? [0, 0, 0]
      n[0] += uy * vz - uz * vy; n[1] += uz * vx - ux * vz; n[2] += ux * vy - uy * vx
      normals.set(root, n)
    }
    for (const [root, part] of byRoot) {
      const n = normals.get(root)!
      const len = Math.hypot(n[0]!, n[1]!, n[2]!)
      if (len > 1e-9) part.lean = Math.abs(n[1]!) / len
    }
    out.push(...byRoot.values())
  })
  return out
}

/**
 * **납작한 오려 낸 그림을 뜻으로 가른다** (FIRST_PERSON §12 · FP-07).
 *
 * `keep:cutout-flat`은 「오려 낸 그림인데 원작의 눕힘 각(45°·63.4°)이 아니다」일
 * 뿐이라, 그 안에 뜻이 아주 다른 것들이 섞여 있다. 숫자만큼 일괄로 세우면 바닥
 * 그림자와 물결까지 일으켜 세운다. 그래서 **기울기로 먼저 가른다** —
 * `lean`은 판 법선의 |y|이고 `asin(lean)`이 수직에서 넘어간 각이다.
 *
 * - `ground`   깔렸다 (>0.95) — 물가·웅덩이·꽃·빛무리·턱 그림 같은 **바닥 그림**.
 *              원작이 일부러 눕힌 것이라 그대로 둔다
 * - `upright`  이미 섰다 (<0.1) — 벽·창·간판. 세울 것이 없다
 * - `tilted`   그 사이 — **후보**다. 지붕·비탈처럼 기울어 마땅한 것과, 납작하게
 *              눌린 화분·풀처럼 고쳐야 할 것이 여기 섞여 있다
 */
function flatClass(lean: number | null): 'ground' | 'upright' | 'tilted' | null {
  if (lean === null) return null
  if (lean > 0.95) return 'ground'
  if (lean < 0.1) return 'upright'
  return 'tilted'
}

/** 게임이 그 조각을 어떻게 다루는가 — `plates.splitFoliage`와 같은 차례 */
function outcomeOf(
  part: Part, mesh: ChunkMesh, cutout: readonly boolean[], lumps: ReadonlySet<number>,
  rockGroups: ReadonlySet<number>, hasItem: boolean, borrowed = false,
): Outcome {
  if (isBakedShadow(mesh, part.group)) return 'remove:baked-shadow'
  if (rockGroups.has(part.group)) return 'replace:rock-named'
  const lumped = part.tris.filter((t) => lumps.has(t - ((t - (mesh.groups[part.group]![1])) % 6))).length
  if (lumped > 0 && lumped === part.tris.length) return 'replace:rock-lump'
  if (isFoliage(mesh, part.group, cutout)) return 'replace:foliage'
  if (cutout[part.group] === true) {
    return part.lean !== null && leaning(part.lean) ? 'stand:card' : 'keep:cutout-flat'
  }
  if (part.tex !== null && !hasItem) return borrowed ? 'keep:borrowed' : 'keep:no-sheet'
  return 'keep:original'
}

/** 그림 칸 전체의 픽셀 지문. 이름이 같아도 묶음마다 다른 그림인지 가른다 */
const itemHashCache = new Map<string, string>()
function itemHash(sheet: TexSheet, item: TexSheet['items'][number], tag: string): string {
  const key = `${tag}/${item.tex}/${item.pal}`
  const hit = itemHashCache.get(key)
  if (hit !== undefined) return hit
  const h = createHash('sha1')
  for (let y = 0; y < item.h; y++) {
    const from = ((item.y + y) * sheet.width + item.x) * 4
    h.update(sheet.pixels.subarray(from, from + item.w * 4))
  }
  const got = h.digest('hex').slice(0, 12)
  itemHashCache.set(key, got)
  return got
}

/** 겹치는 imped 영역. UV가 칸 밖으로 나가면(반복) 여럿에 걸친다 */
function impedCandidates(rect: readonly number[]): { name: string, share: number }[] {
  const [x0, y0, x1, y1] = rect as [number, number, number, number]
  const area = Math.max(1e-9, (x1 - x0) * (y1 - y0))
  return IMPED_REGIONS.map((r) => {
    const w = Math.max(0, Math.min(x1, r.rect[2]) - Math.max(x0, r.rect[0]))
    const h = Math.max(0, Math.min(y1, r.rect[3]) - Math.max(y0, r.rect[1]))
    return { name: r.name, share: fmt3((w * h) / area) }
  }).filter((c) => c.share > 0).sort((a, b) => b.share - a.share)
}

interface MatrixChunk { i: number, mx: number, my: number, land: number, zone: number }
interface Building { model: number, x: number, z: number, y?: number, rot?: number[], scale?: number[] }
interface MatrixMeta { id: number, name: string, chunks: MatrixChunk[], buildings?: Record<string, Building[]> }
interface MapRow { id: number, area: number, matrix: number, name: string }

it('1인칭 원재료 전수 목록', { timeout: 1_800_000 }, async () => {
  const restore = installNodeAssets()
  try {
    const maps = read('maps.json') as { maps: MapRow[], areas: { tex: number, props: number }[] }
    const matrices: MatrixMeta[] = [read('matrices/0.json') as MatrixMeta]
    const inner = read('matrices/interiors.json') as { matrices: Record<string, MatrixMeta> }
    matrices.push(...Object.values(inner.matrices))

    /** 행렬 → 그 행렬을 쓰는 맵들 */
    const mapsOfMatrix = new Map<number, MapRow[]>()
    for (const m of maps.maps) {
      const list = mapsOfMatrix.get(m.matrix) ?? []
      list.push(m)
      mapsOfMatrix.set(m.matrix, list)
    }
    const mapById = new Map(maps.maps.map((m) => [m.id, m]))
    const texSetOfMap = (id: number): number => maps.areas[mapById.get(id)?.area ?? -1]?.tex ?? 0

    // ── 배치 전수: 행렬 칸 → (청크, 맵, 그림 묶음) ────────────────────────────
    const chunkPlacements: {
      placementId: string, matrixId: number, cell: [number, number], chunk: number,
      mapIds: number[], texSets: number[], homeSet: number | null,
      /** 집 없는 청크가 볼 창의 묶음들 — 보는 맵마다 다르다 */
      windowSets: Record<number, number[]>,
    }[] = []
    const propPlacements: {
      placementId: string, matrixId: number, cell: number, model: number,
      x: number, z: number, y: number | null, rotY: number, scale: number[] | null,
      mapIds: number[],
    }[] = []
    /**
     * ⚠️ **청크의 그림 묶음은 제 칸의 맵이 정하지 않는다.** 게임은 시야
     * (`MapStreamer`의 `VIEW_RADIUS` 2칸) 안의 청크를 전부 **지금 선 맵**의 묶음
     * 하나로 그린다. 그래서 한 청크는 둘레 두 칸 안의 어느 맵에서든 보일 수 있고,
     * 그만큼의 묶음과 짝이 된다. 제 칸의 맵만 붙였더니 가장자리 칸
     * (맵 0 `EVERYWHERE` → 묶음 0)에서 이름을 못 찾는 조각이 수천 개 나왔다
     */
    const VIEW_RADIUS = 2
    for (const mx of matrices) {
      const zoneAt = new Map(mx.chunks.map((c) => [`${String(c.mx)},${String(c.my)}`, c.zone]))
      for (const c of mx.chunks) {
        let mapIds: number[]
        if (c.zone < 0) mapIds = (mapsOfMatrix.get(mx.id) ?? []).map((m) => m.id)
        else {
          const near = new Set<number>()
          for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
            for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
              const z = zoneAt.get(`${String(c.mx + dx)},${String(c.my + dy)}`)
              if (z !== undefined && z > 0) near.add(z)
            }
          }
          mapIds = near.size > 0 ? [...near].sort((a, b) => a - b) : [c.zone]
        }
        const texSets = [...new Set(mapIds.map(texSetOfMap))].sort((a, b) => a - b)
        chunkPlacements.push({
          placementId: `m${String(mx.id)}/c${String(c.i)}`, matrixId: mx.id, cell: [c.mx, c.my],
          chunk: c.land, mapIds, texSets,
          // 게임이 모자랄 때 쓰는 제 집 묶음 (`scene/chunkSheets`)
          homeSet: c.zone > 0 ? texSetOfMap(c.zone) : null,
          windowSets: {},
        })
        for (const [k, b] of (mx.buildings?.[String(c.i)] ?? []).entries()) {
          propPlacements.push({
            placementId: `m${String(mx.id)}/c${String(c.i)}/b${String(k)}`, matrixId: mx.id,
            cell: c.i, model: b.model, x: b.x, z: b.z, y: b.y ?? null,
            rotY: b.rot?.[1] ?? 0, scale: b.scale ?? null, mapIds,
          })
        }
      }
    }

    /**
     * 집 없는 청크의 후보 — **보는 사람이 선 칸의 창**에 실린 맵들의 묶음.
     * 보는 맵의 칸 중 이 청크에서 두 칸 안인 것마다 그 칸 둘레 두 칸의 맵을 모은다
     */
    for (const mx of matrices) {
      if (mx.id !== 0) continue
      const at = new Map(mx.chunks.map((c) => [`${String(c.mx)},${String(c.my)}`, c.zone]))
      const zoneAt = (x: number, y: number) => at.get(`${String(x)},${String(y)}`)
      for (const p of chunkPlacements.filter((q) => q.matrixId === 0 && q.homeSet === null)) {
        const [cx, cy] = p.cell
        for (const viewer of p.mapIds) {
          const sets = new Set<number>()
          for (let vy = cy - VIEW_RADIUS; vy <= cy + VIEW_RADIUS; vy++) {
            for (let vx = cx - VIEW_RADIUS; vx <= cx + VIEW_RADIUS; vx++) {
              if (zoneAt(vx, vy) !== viewer) continue
              for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
                for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
                  const z = zoneAt(vx + dx, vy + dy)
                  if (z !== undefined && z > 0) sets.add(texSetOfMap(z))
                }
              }
            }
          }
          p.windowSets[viewer] = [...sets]
        }
      }
    }

    // ── 자산 × 그림 묶음 조합 ────────────────────────────────────────────────
    // 보는 맵의 묶음이 모자라면 게임은 제 집 묶음으로 그린다 — 같은 규칙으로 고른다
    const combos = new Map<string, { chunk: number, texSet: number, placements: number }>()
    let switched = 0
    for (const p of chunkPlacements) {
      const mesh = await loadChunkMesh(p.chunk)
      for (const viewerMap of p.mapIds) {
        const viewer = texSetOfMap(viewerMap)
        const sheet = await loadTexSheet(viewer)
        let candSets = p.homeSet !== null ? [p.homeSet] : (p.windowSets[viewerMap] ?? [])
        if (p.homeSet === null) {
          const far = bestSet(await loadTexNames(), viewer, mesh.materials)
          if (far !== null) candSets = [...candSets, far]
        }
        const cands = await Promise.all(candSets.map(async (set) => ({ set, sheet: await loadTexSheet(set) })))
        const picked = pickSheet(sheet, cands, mesh.materials)
        if (picked !== null) switched += 1
        const s = picked ?? viewer
        const key = `${String(p.chunk)}/${String(s)}`
        const hit = combos.get(key)
        if (hit) hit.placements += 1
        else combos.set(key, { chunk: p.chunk, texSet: s, placements: 1 })
      }
    }

    interface SourceRow {
      sourceKey: string, kind: Part['kind'], asset: number, texSet: number | null, group: number,
      tex: string | null, pal: string | null, rep: number, alpha: number, itemHash: string | null,
      tris: number, triOffsets: [number, number], rawUv: number[], texelRect: number[] | null,
      wraps: boolean, fractional: boolean, lean: number | null,
      semantic: { status: 'unclassified' | 'candidate', candidates: { name: string, share: number }[] },
      recipe: string | null, outcome: Outcome, review: 'unreviewed' | 'verified', placements: number,
      lend?: { set: number, pal: string, loose: boolean } | null,
    }
    const sources: SourceRow[] = []
    const failed: { what: string, why: string }[] = []

    /**
     * **이 묶음에 없는 그림을 어디서 빌려 오나** — 게임과 같은 함수(`lendersFor`)로
     * 묻는다 (`ChunkModels`의 `lend`). 이걸 안 물으면 목록이 자홍을 부풀린다:
     * 실측으로 97삼각형(`h_kage` 85 · `gym04_d` 10 · `dun_floor2` 2)이 그려지는데도
     * `keep:no-sheet`로 세어졌다
     */
    const lendFor = async (
      mesh: ChunkMesh, sheet: TexSheet, texSet: number,
    ): Promise<Map<string, { set: number, sheet: TexSheet, pal: string, loose: boolean }>> => {
      const out = new Map<string, { set: number, sheet: TexSheet, pal: string, loose: boolean }>()
      const lacking = new Map<string, { tex: string, pal: string | null }>()
      for (const m of mesh.materials) {
        if (m.tex === null) continue
        if (sheet.items.some((it) => it.tex === m.tex && it.pal === (m.pal ?? ''))) continue
        lacking.set(lendKey(m.tex, m.pal), { tex: m.tex, pal: m.pal })
      }
      if (lacking.size === 0) return out
      for (const r of lendersFor(await loadTexNames(), [...lacking.values()])) {
        out.set(r.key, { set: r.set, sheet: await loadTexSheet(r.set), pal: r.pal, loose: r.loose })
      }
      return out
    }

    const describePart = (
      part: Part, mesh: ChunkMesh, sheet: TexSheet | null, cutout: boolean[], lumps: Set<number>,
      rocks: Set<number>, texSet: number | null, placements: number, sheetTag: string,
      lend?: ReadonlyMap<string, { set: number, sheet: TexSheet, pal: string, loose: boolean }>,
    ): void => {
      const mine = sheet?.items.find((s) => s.tex === part.tex && s.pal === (part.pal ?? '')) ?? null
      // 제 묶음에 없으면 빌려 온 묶음에서 찾는다 — 그림도 거기 것을 잰다
      const from = mine !== null || part.tex === null
        ? null : lend?.get(lendKey(part.tex, part.pal)) ?? null
      const item = mine ?? (from === null ? null
        : from.sheet.items.find((s) => s.tex === part.tex && s.pal === from.pal) ?? null)
      const at = mine !== null ? sheet! : from?.sheet ?? null
      const tag = mine !== null ? sheetTag : `set${String(from?.set ?? -1)}`
      const rect = item
        ? [part.uv[0] * item.w, part.uv[1] * item.h, part.uv[2] * item.w, part.uv[3] * item.h].map(fmt3)
        : null
      const wraps = part.uv[0] < -1e-4 || part.uv[1] < -1e-4 || part.uv[2] > 1 + 1e-4 || part.uv[3] > 1 + 1e-4
      const fractional = rect !== null && rect.some((n) => Math.abs(n - Math.round(n)) > 1e-3)
      const candidates = part.tex === 'imped' && rect !== null && item?.w === 64 && item.h === 64
        ? impedCandidates(rect) : []
      const tris = part.tris
      sources.push({
        sourceKey: `${part.kind}:${String(part.asset)}/set${texSet === null ? '-' : String(texSet)}`
          + `/g${String(part.group)}/t${String(tris[0])}`,
        kind: part.kind, asset: part.asset, texSet, group: part.group,
        tex: part.tex, pal: part.pal, rep: part.rep, alpha: part.alpha,
        itemHash: at && item ? itemHash(at, item, tag) : null,
        tris: tris.length, triOffsets: [tris[0]!, tris[tris.length - 1]!],
        rawUv: part.uv.map(fmt3), texelRect: rect, wraps, fractional,
        lean: part.lean === null ? null : fmt3(part.lean),
        semantic: { status: candidates.length > 0 ? 'candidate' : 'unclassified', candidates },
        recipe: null,
        outcome: outcomeOf(part, mesh, cutout, lumps, rocks, mine !== null, item !== null),
        lend: from === null || item === null ? null : { set: from.set, pal: from.pal, loose: from.loose },
        review: 'unreviewed',
        placements,
      })
    }

    let done = 0
    for (const { chunk, texSet, placements } of combos.values()) {
      try {
        const [mesh, sheet] = await Promise.all([loadChunkMesh(chunk), loadTexSheet(texSet)])
        const pos = (mesh.geometry.getAttribute('position') as BufferAttribute).array as Float32Array
        const cutout = cutoutGroups(mesh, sheet)
        // 게임과 같은 계획 — 검수된 레시피가 맡은 사각형은 바위 덩이에서 빠진다
        const vp = planChunk(mesh, sheet, texSet, chunk, VISUAL_RECIPES, 'verified')
        const claimed = vp === null ? undefined : quadStarts(mesh, vp.plan.suppressLegacyOffsets)
        const recipeAt = new Map<number, string>()
        for (const d of vp?.plan.decisions ?? []) {
          if (d.status !== 'ready' || d.recipeId === null) continue
          for (const o of d.claimOffsets) recipeAt.set(o, d.recipeId)
        }
        const lumps = plateLumps(mesh, sheet, cutout, pos, claimed)
        const rocks = new Set(rockSites(mesh, pos).map((s) => s.group))
        const lend = await lendFor(mesh, sheet, texSet)
        for (const part of partsOf('chunk', chunk, mesh)) {
          describePart(
            part, mesh, sheet, cutout, lumps, rocks, texSet, placements, `set${String(texSet)}`, lend,
          )
          const ids = new Set(part.tris.map((t) => recipeAt.get(t)))
          if (ids.size === 1 && !ids.has(undefined)) {
            const row = sources[sources.length - 1]!
            const id = [...ids][0]!
            // ⚠️ **augment는 교체가 아니다** — 원본이 그대로 서고 사본이 붙는다
            row.outcome = VISUAL_RECIPES.find((r) => r.id === id)?.geometry === 'cross-cards'
              ? 'augment:cross-cards' : 'replace:recipe'
            row.recipe = id
            row.review = 'verified'
          }
        }
      } catch (e) {
        failed.push({ what: `chunk ${String(chunk)} / set ${String(texSet)}`, why: String((e as Error).message ?? e).slice(0, 200) })
      }
      done += 1
      if (done % 100 === 0) console.log(`  청크 조합 ${String(done)}/${String(combos.size)}`)
    }

    const propUse = new Map<number, number>()
    for (const p of propPlacements) propUse.set(p.model, (propUse.get(p.model) ?? 0) + 1)
    const propCount = (read('props/index.json') as { count: number }).count
    for (let id = 0; id < propCount; id++) {
      try {
        const [mesh, sheet] = await Promise.all([loadPropMesh(id), loadPropSheet(id)])
        const pos = (mesh.geometry.getAttribute('position') as BufferAttribute).array as Float32Array
        const cutout = cutoutGroups(mesh, sheet)
        // ⚠️ 소품에는 잎 걷기·덩이 걷기가 안 걸린다 (`ChunkModels`는 소품을 `splitShadow`만
        // 해서 그린다). 판정은 게임 함수로 하되 결과를 「소품은 그대로」로 접는다
        const lumps = plateLumps(mesh, sheet, cutout, pos)
        // 소품에 걸리는 레시피 — 지금은 십자 카드 하나다 (`visual/propPlan`)
        const crossAt = crossClaims(mesh, sheet, id, VISUAL_RECIPES, 'verified')
        // 눕힌 카드를 세우는 레시피 (`propPlan.standProp`) — 묘비·석상·조각상
        const standAt = standClaims(mesh, sheet, id, VISUAL_RECIPES, 'verified')
        // 잎 카드를 입체 나무로 바꾸는 레시피 (`propPlan.propTree`) — 꿀나무
        const treeAt = treeClaims(mesh, sheet, id, VISUAL_RECIPES, 'verified')
        for (const part of partsOf('prop', id, mesh)) {
          describePart(part, mesh, sheet, cutout, new Set(), new Set(), null, propUse.get(id) ?? 0, `prop${String(id)}`)
          const row = sources[sources.length - 1]!
          const start = mesh.groups[part.group]![1]
          const wouldLump = part.tris.some((t) => lumps.has(t - ((t - start) % 6)))
          row.outcome = cutout[part.group] === true ? 'keep:cutout-flat' : row.outcome
          if (wouldLump) row.semantic.candidates.push({ name: 'lump-shaped(prop, not replaced)', share: 1 })
          const ids = new Set(part.tris.map((t) => crossAt.get(t)))
          if (ids.size === 1 && !ids.has(undefined)) {
            row.outcome = 'augment:cross-cards'
            row.recipe = [...ids][0]!
            row.review = 'verified'
          }
          const treed = new Set(part.tris.map((t) => treeAt.get(t)))
          if (treed.size === 1 && !treed.has(undefined)) {
            row.outcome = 'replace:recipe'
            row.recipe = [...treed][0]!
            row.review = 'verified'
          }
          const stood = new Set(part.tris.map((t) => standAt.get(t)))
          if (stood.size === 1 && !stood.has(undefined)) {
            row.outcome = 'stand:card'
            row.recipe = [...stood][0]!
            row.review = 'verified'
          }
        }
      } catch (e) {
        failed.push({ what: `prop ${String(id)}`, why: String((e as Error).message ?? e).slice(0, 200) })
      }
    }

    // ── 요약 ──────────────────────────────────────────────────────────────
    const tally = <K extends string>(rows: SourceRow[], key: (r: SourceRow) => K) => {
      const m: Record<string, { parts: number, tris: number, placedParts: number }> = {}
      for (const r of rows) {
        const k = key(r)
        m[k] ??= { parts: 0, tris: 0, placedParts: 0 }
        m[k].parts += 1
        m[k].tris += r.tris
        m[k].placedParts += r.placements
      }
      return m
    }
    const uniqueImages = new Set(sources.filter((s) => s.itemHash !== null).map((s) => `${s.tex}/${s.pal}/${s.itemHash}`))
    const sameNameDiffPixels: Record<string, string[]> = {}
    const hashesByName = new Map<string, Set<string>>()
    for (const s of sources) {
      if (s.itemHash === null || s.kind !== 'chunk') continue
      const k = `${s.tex}/${s.pal}`
      const set = hashesByName.get(k) ?? new Set()
      set.add(s.itemHash)
      hashesByName.set(k, set)
    }
    for (const [k, v] of hashesByName) if (v.size > 1) sameNameDiffPixels[k] = [...v]

    const coverage = {
      generatedAt: new Date().toISOString(),
      meaning: '지금 게임이 고르는 표현의 전수. review가 verified인 레시피만 기본 게임에 걸린다',
      counts: {
        chunkAssets: new Set(chunkPlacements.map((p) => p.chunk)).size,
        chunkTexCombos: combos.size,
        viewsSwitchedToHomeSet: switched,
        chunkPlacements: chunkPlacements.length,
        propModels: propCount,
        propPlacements: propPlacements.length,
        sourceParts: sources.length,
        uniqueImages: uniqueImages.size,
        failed: failed.length,
      },
      review: {
        verified: sources.filter((r) => r.review === 'verified').length,
        unreviewed: sources.filter((r) => r.review !== 'verified').length,
        recipes: VISUAL_RECIPES.map((r) => ({ id: r.id, review: r.review })),
      },
      byOutcome: tally(sources, (r) => `${r.kind}/${r.outcome}`),
      // 납작한 그림을 뜻으로 가른 것 (FP-07). `tilted`만 후보다
      flatCutouts: tally(
        sources.filter((r) => r.outcome === 'keep:cutout-flat'),
        (r) => `${r.kind}/${String(flatClass(r.lean))}`,
      ),
      // `tilted` 안에서 어느 그림이 큰가 — 배치 많은 것부터 (§12의 「고빈도 먼저」)
      flatTiltedBySource: Object.fromEntries(Object.entries(tally(
        sources.filter((r) => r.outcome === 'keep:cutout-flat' && flatClass(r.lean) === 'tilted'),
        (r) => `${r.kind}/${r.tex ?? '-'}`,
      )).sort((a, b) => b[1].placedParts - a[1].placedParts).slice(0, 40)),
      bySemantic: tally(sources, (r) => r.semantic.status),
      impedLumpRegions: tally(
        sources.filter((r) => r.tex === 'imped' && r.kind === 'chunk'),
        (r) => `${r.outcome} ← ${r.semantic.candidates[0]?.name ?? '?'}${r.wraps ? ' (반복 UV)' : ''}${r.fractional ? ' (소수 UV)' : ''}`,
      ),
      wrapsOrFractional: {
        wraps: sources.filter((s) => s.wraps).length,
        fractional: sources.filter((s) => s.fractional).length,
      },
      sameNameDifferentPixels: Object.keys(sameNameDiffPixels).length,
      sameNameDifferentPixelsSample: Object.fromEntries(Object.entries(sameNameDiffPixels).slice(0, 20)),
      failed,
    }

    mkdirSync(OUT, { recursive: true })
    writeFileSync(resolve(OUT, 'sources.json'), JSON.stringify({ rows: sources }))
    writeFileSync(resolve(OUT, 'placements.json'), JSON.stringify({ chunks: chunkPlacements, props: propPlacements }))
    writeFileSync(resolve(OUT, 'coverage.json'), `${JSON.stringify(coverage, null, 1)}\n`)
    console.log(`  조각 ${String(sources.length)} · 조합 ${String(combos.size)} · 실패 ${String(failed.length)}`)
  } finally {
    restore()
  }
})
