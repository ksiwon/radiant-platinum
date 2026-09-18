// 표현 계획을 실제 청크에 건다 — 축복시티 청크 18 · 묶음 6 (FIRST_PERSON §13.1 「교체」)
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { BufferAttribute } from 'three'
import { installNodeAssets, withData } from '../../data/romData.testkit'
import { loadChunkMesh, loadTexSheet, type ChunkMesh, type TexSheet } from '../chunkMesh'
import { cutoutGroups, plateLumps, rockSites, splitFoliage } from '../plates'
import { planChunk, quadStarts } from './chunkPlan'
import { VISUAL_RECIPES } from './recipes'

withData('chunks/18.bin', 'tex/6.png', 'tex/index.json')('표현 계획 — 축복시티 화분', () => {
  let restore: () => void
  let mesh: ChunkMesh
  let sheet: TexSheet
  beforeAll(async () => {
    restore = installNodeAssets()
    mesh = await loadChunkMesh(18)
    sheet = await loadTexSheet(6)
  })
  afterAll(() => { restore() })

  const pos = () => (mesh.geometry.getAttribute('position') as BufferAttribute).array as Float32Array

  it('legacy·레시피 없음이면 계획이 없다 — 예전 그대로 돈다', () => {
    expect(planChunk(mesh, sheet, 6, 18, VISUAL_RECIPES, 'legacy')).toBeNull()
    expect(planChunk(mesh, sheet, 6, 18, [], 'candidate')).toBeNull()
    // 초안만 있으면 기본(verified)에서는 안 걸린다
    const drafts = VISUAL_RECIPES.map((r) => ({ ...r, review: 'draft' as const }))
    const v = planChunk(mesh, sheet, 6, 18, drafts, 'verified')
    expect(v?.planters ?? []).toEqual([])
    expect(v?.plan.removeOffsets.size ?? 0).toBe(0)
  })

  it('검수된 화분은 기본 모드에서 걸린다 — 초안까지 켜도 같은 답이다 (묶음 6에는 초안 그림이 없다)', () => {
    const a = planChunk(mesh, sheet, 6, 18, VISUAL_RECIPES, 'verified')!
    const b = planChunk(mesh, sheet, 6, 18, VISUAL_RECIPES, 'candidate')!
    expect(a.planters.length).toBeGreaterThan(0)
    expect(a.plan.key).toBe(b.plan.key)
  })

  it('candidate에서는 화분만 맡고, 맡은 만큼 화분이 선다', () => {
    const v = planChunk(mesh, sheet, 6, 18, VISUAL_RECIPES.filter((r) => r.id === 'imped-planter'), 'candidate')!
    expect(v.planters.length).toBeGreaterThan(0)
    const ready = v.plan.decisions.filter((d) => d.status === 'ready')
    expect(ready).toHaveLength(v.planters.length)
    expect(ready.every((d) => d.recipeId === 'imped-planter')).toBe(true)
    // 맡은 것 = 지울 것 (준비가 같은 커밋이다)
    expect([...v.plan.removeOffsets].sort()).toEqual([...v.plan.suppressLegacyOffsets].sort())
    // 폭은 한 칸 판의 14/16, 모두 같은 그림 지문
    expect(new Set(v.planters.map((p) => p.width))).toEqual(new Set([0.875]))
    expect(new Set(v.planters.map((p) => p.key.split('/')[1]))).toEqual(new Set(['c92159ee']))
  })

  it('맡은 사각형은 바위 덩이에서 빠지고, 원본에서 정확히 그만큼 걷힌다', () => {
    const v = planChunk(mesh, sheet, 6, 18, VISUAL_RECIPES, 'candidate')!
    const cutout = cutoutGroups(mesh, sheet)
    const claimed = quadStarts(mesh, v.plan.suppressLegacyOffsets)
    const before = plateLumps(mesh, sheet, cutout, pos())
    const after = plateLumps(mesh, sheet, cutout, pos(), claimed)
    expect(before.size - after.size).toBe(claimed.size)
    for (const q of claimed) expect(after.has(q)).toBe(false)
    const rocksBefore = rockSites(mesh, pos(), before).length
    const rocksAfter = rockSites(mesh, pos(), after).length
    expect(rocksBefore - rocksAfter).toBe(claimed.size)
    // 원본 걷기: 예전 덩이 + 교체 = 예전과 같은 삼각형이 빠진다 (화분이 바위 대신 선다)
    const removed = quadStarts(mesh, v.plan.removeOffsets)
    const gone = new Set([...after, ...removed])
    const kept = (s: ReturnType<typeof splitFoliage>) => s.geometry.getIndex()!.count
    expect(kept(splitFoliage(mesh, cutout, gone))).toBe(kept(splitFoliage(mesh, cutout, before)))
  })

  it('원본으로 두기(hold)면 걷지도 세우지도 않는다', () => {
    const v = planChunk(mesh, sheet, 6, 18, VISUAL_RECIPES, 'candidate')!
    const cutout = cutoutGroups(mesh, sheet)
    const claimed = quadStarts(mesh, v.plan.suppressLegacyOffsets)
    const lumps = plateLumps(mesh, sheet, cutout, pos(), claimed)
    const held = splitFoliage(mesh, cutout, lumps, false, claimed)
    const plain = splitFoliage(mesh, cutout, lumps)
    // 걷는 삼각형 수는 같다 — hold는 지우지 않는다
    expect(held.geometry.getIndex()!.count).toBe(plain.geometry.getIndex()!.count)
    // hold 사각형의 정점은 원본 자리 그대로다 (세우지 않았다)
    const src = pos()
    const out = held.geometry.getAttribute('position').array
    const index = mesh.geometry.getIndex()!.array
    for (const q of claimed) {
      for (let k = 0; k < 6; k++) {
        const i = index[q + k]!
        expect([out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]).toEqual([src[i * 3], src[i * 3 + 1], src[i * 3 + 2]])
      }
    }
    // hold 없이 두면 그 판은 세워진다 (대조)
    const stood = plain.geometry.getAttribute('position').array
    // 경첩(가장 낮은 꼭짓점)은 제자리라 여섯 꼭짓점 중 하나라도 움직였는지 본다
    const moved = [...claimed].every((q) => [0, 1, 2, 3, 4, 5].some((k) => {
      const i = index[q + k]!
      return stood[i * 3 + 1] !== src[i * 3 + 1] || stood[i * 3 + 2] !== src[i * 3 + 2]
    }))
    expect(moved).toBe(true)
  })
})

withData('chunks/22.bin', 'tex/7.png', 'tex/index.json')('표현 계획 — 무쇠시티 말뚝 울타리 (FP-03)', () => {
  let restore: () => void
  let mesh: ChunkMesh
  let sheet: TexSheet
  beforeAll(async () => {
    restore = installNodeAssets()
    mesh = await loadChunkMesh(22)
    sheet = await loadTexSheet(7)
  })
  afterAll(() => { restore() })

  it('검수됐으니 기본 모드에서 걸리고, 맡은 판마다 울타리가 선다', () => {
    const fence = VISUAL_RECIPES.filter((r) => r.id === 'imped-fence')
    // 초안으로 되돌리면 기본 모드에서 빠진다 — 검수 표시가 실제로 문을 여닫는다
    const draft = fence.map((r) => ({ ...r, review: 'draft' as const }))
    expect(planChunk(mesh, sheet, 7, 22, draft, 'verified')?.planters ?? []).toEqual([])
    expect(planChunk(mesh, sheet, 7, 22, fence, 'verified')!.planters.length).toBeGreaterThan(0)
    const v = planChunk(mesh, sheet, 7, 22, fence, 'candidate')!
    const ready = v.plan.decisions.filter((d) => d.status === 'ready')
    expect(ready.length).toBeGreaterThan(0)
    expect(v.planters).toHaveLength(ready.length)
    expect(v.planters.every((p) => p.kind === 'fence')).toBe(true)
    expect([...v.plan.removeOffsets].sort()).toEqual([...v.plan.suppressLegacyOffsets].sort())
  })

  it('울타리는 판의 밑변(가장 낮은 정점의 줄)에 서고, 16텍셀이 한 칸이다', () => {
    const v = planChunk(mesh, sheet, 7, 22, VISUAL_RECIPES.filter((r) => r.id === 'imped-fence'), 'candidate')!
    const pos = (mesh.geometry.getAttribute('position') as BufferAttribute).array
    const index = mesh.geometry.getIndex()!.array
    const byId = new Map(v.plan.decisions.map((d) => [d.componentId, d]))
    expect(byId.size).toBeGreaterThan(0)
    for (const p of v.planters) {
      if (p.kind !== 'fence') continue
      expect(Math.abs(p.u1 - p.u0) / p.width).toBeCloseTo(16, 3)
      // 자리의 높이는 원본 판에서 가장 낮은 정점의 높이 중 하나다
      let hit = false
      for (let i = 0; i < index.length && !hit; i++) {
        const k = index[i]! * 3
        hit = Math.abs(pos[k + 1]! - p.site.y) < 1e-4
          && Math.hypot(pos[k]! - p.site.x, pos[k + 2]! - p.site.z) <= p.width / 2 + 1e-3
      }
      expect(hit).toBe(true)
    }
  })
})
