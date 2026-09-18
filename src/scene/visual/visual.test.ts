// 1인칭 표현 정책의 뼈대 검증 (FIRST_PERSON §13.1)
//
// 분류·조각·교체·충돌을 **작은 손 메시**로 잰다. 실제 롬 자료로 재는 것은
// 아래 `withData` 묶음이다 — 명세 §3의 imped 표본이 그 칸으로 갈리는지 본다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  footprintWithin, leanDegrees, regionDigest, regionShares, sourceParts, uvFootprint, type MeshArrays,
} from './sourceParts'
import {
  hashText, markFailed, markReady, planOf, rejectDoubleClaims, resolveParts, type ResolveContext,
} from './resolve'
import { noteVisualDecisions, resetVisualReadiness, visualReadiness } from './readiness'
import { REP, type SourcePart, type VisualRecipe } from './types'
import { withData } from '../../data/romData.testkit'

/** 사각형 하나 — 네 꼭짓점, 두 삼각형. `flip`이면 대각선을 바꾼다 */
function quad(
  corners: readonly (readonly [number, number, number])[],
  uvs: readonly (readonly [number, number])[],
  flip = false,
) {
  return { corners, uvs, tris: flip ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3] }
}

/** 사각형 몇 개를 한 서브메시로. `share`면 이웃과 정점 색인을 나눈다 */
function meshOf(quads: ReturnType<typeof quad>[], rep = 0, tex = 'imped'): MeshArrays {
  const position: number[] = []
  const uv: number[] = []
  const index: number[] = []
  for (const q of quads) {
    const base = position.length / 3
    q.corners.forEach((c, i) => { position.push(...c); uv.push(...q.uvs[i]!) })
    for (const t of q.tris) index.push(base + t)
  }
  return {
    index, position, uv,
    groups: [[7, 0, index.length]],
    materials: [{ tex, pal: tex, rep }],
  }
}

const OPT = { kind: 'chunk' as const, assetId: 1, texSet: 0, hashOf: () => 'H' }
const upright = (x: number) => [[x, 0, 0], [x + 1, 0, 0], [x + 1, 1, 0], [x, 1, 0]] as const
const leaning45 = [[0, 0, 0], [1, 0, 0], [1, 1, -1], [0, 1, -1]] as const
const cell = (u0: number, v0: number, u1: number, v1: number) =>
  [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] as const

describe('원본 조각', () => {
  it('모서리를 함께 쓰는 같은 평면의 두 삼각형은 한 조각이다 — 대각선 방향과 상관없다', () => {
    for (const flip of [false, true]) {
      const parts = sourceParts(meshOf([quad(upright(0), cell(0, 0, 1, 1), flip)]), OPT)
      expect(parts).toHaveLength(1)
      expect(parts[0]!.triangleOffsets).toEqual([0, 3])
    }
  })

  it('같은 평면에 맞닿아도 UV가 이어지지 않으면 안 붙는다', () => {
    // 두 판이 x=1 모서리를 공유하지만 오른쪽 판의 UV가 다른 칸이다
    const parts = sourceParts(meshOf([
      quad(upright(0), cell(0, 0, 0.5, 0.5)),
      quad(upright(1), cell(0.5, 0.5, 1, 1)),
    ]), OPT)
    expect(parts).toHaveLength(2)
  })

  it('UV가 이어지는 이웃 판은 정점을 따로 들고 있어도 한 조각이다', () => {
    const parts = sourceParts(meshOf([
      quad(upright(0), cell(0, 0, 0.5, 1)),
      quad(upright(1), cell(0.5, 0, 1, 1)),
    ]), OPT)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.triangleOffsets).toEqual([0, 3, 6, 9])
  })

  it('꺾인 두 판은 모서리를 나눠도 따로다 — 사각형이 아닌 메시도 삼각형 단위로 본다', () => {
    const bent = meshOf([quad(upright(0), cell(0, 0, 1, 1))])
    // 같은 아래 모서리에서 바닥으로 꺾인 삼각형 하나 (UV도 같은 꼭짓점)
    const base = bent.position.length / 3
    ;(bent.position as number[]).push(1, 0, 0, 0, 0, 0, 0, 0, 1)
    ;(bent.uv as number[]).push(1, 1, 0, 1, 0, 0.5)
    ;(bent.index as number[]).push(base, base + 1, base + 2)
    ;(bent.groups as [number, number, number][])[0]![2] = bent.index.length
    const parts = sourceParts(bent, OPT)
    expect(parts).toHaveLength(2)
    expect(parts.map((p) => p.triangleOffsets.length).sort()).toEqual([1, 2])
  })

  it('넓이가 0인 삼각형은 버리지 않고 제 조각이 된다', () => {
    const m = meshOf([quad(upright(0), cell(0, 0, 1, 1))])
    ;(m.position as number[]).push(0, 0, 0, 0, 0, 0, 0, 0, 0)
    ;(m.uv as number[]).push(0, 0, 0, 0, 0, 0)
    ;(m.index as number[]).push(4, 5, 6)
    ;(m.groups as [number, number, number][])[0]![2] = m.index.length
    const parts = sourceParts(m, OPT)
    expect(parts.flatMap((p) => p.triangleOffsets).sort((a, b) => a - b)).toEqual([0, 3, 6])
  })

  it('누운 각을 법선으로 잰다 — 서 있으면 0°, 45° 판은 45°', () => {
    const [stand] = sourceParts(meshOf([quad(upright(0), cell(0, 0, 1, 1))]), OPT)
    const [lean] = sourceParts(meshOf([quad(leaning45, cell(0, 0, 1, 1))]), OPT)
    expect(leanDegrees(stand!.normal)).toBeCloseTo(0, 5)
    expect(leanDegrees(lean!.normal)).toBeCloseTo(45, 5)
  })
})

describe('UV 칸', () => {
  it('자르기(반복 없음)는 칸 밖을 가장자리로 누른다', () => {
    const fp = uvFootprint([-0.25, 0, 0.5, 0.25], 0, 64, 64)
    expect(fp.rects).toEqual([[0, 0, 32, 16]])
    expect(fp.wrapsU).toBe(true)
  })

  it('반복은 칸 번호를 떼고 제자리로 접는다 — 경계를 넘으면 두 토막', () => {
    const one = uvFootprint([1.5, 0.5, 1.75, 0.75], REP.repeatU | REP.repeatV, 64, 64)
    expect(one.rects).toEqual([[32, 32, 48, 48]])
    const two = uvFootprint([0.75, 0, 1.25, 0.25], REP.repeatU, 64, 64)
    expect(two.rects).toEqual([[48, 0, 64, 16], [0, 0, 16, 16]])
  })

  it('거울 반복은 홀수 칸에서 뒤집는다', () => {
    const fp = uvFootprint([1.0, 0, 1.25, 0.25], REP.repeatU | REP.mirrorU, 64, 64)
    expect(fp.rects).toEqual([[48, 0, 64, 16]])
  })

  it('한 칸 넘게 반복하면 가로 전체다 — 울타리 U [-0.5, 1.5]', () => {
    const fp = uvFootprint([-0.5, 0, 1.5, 0.25], REP.repeatU, 64, 64)
    expect(fp.rects).toEqual([[0, 0, 64, 16]])
  })

  it('소수 경계는 반올림하지 않고 표시만 한다', () => {
    const fp = uvFootprint([31.125 / 64, 31.313 / 64, 48.75 / 64, 48.438 / 64], 0, 64, 64)
    expect(fp.fractional).toBe(true)
    expect(fp.rects[0]![0]).toBeCloseTo(31.125, 6)
  })

  it('imped 표 — 화분·덤불·바위 칸이 서로 안 섞인다', () => {
    const regions = [
      { name: 'planter', rect: [32, 32, 48, 48] as const },
      { name: 'shrub', rect: [48, 32, 64, 48] as const },
      { name: 'rock-small-brown', rect: [32, 48, 48, 64] as const },
      { name: 'fence', rect: [0, 0, 64, 16] as const },
    ]
    const at = (u0: number, v0: number) => regionShares(uvFootprint([u0 / 64, v0 / 64, (u0 + 16) / 64, (v0 + 16) / 64], 0, 64, 64), regions)[0]!
    expect(at(32, 32)).toEqual({ name: 'planter', share: 1 })
    expect(at(48, 32)).toEqual({ name: 'shrub', share: 1 })
    expect(at(32, 48)).toEqual({ name: 'rock-small-brown', share: 1 })
    // 한 텍셀 아래로 밀린 바위 칸(32,49,48,65)은 반복이면 접혀서 둘에 걸친다
    const shifted = regionShares(uvFootprint([32 / 64, 49 / 64, 48 / 64, 65 / 64], REP.repeatV, 64, 64), regions)
    expect(shifted[0]!.name).toBe('rock-small-brown')
    expect(shifted[0]!.share).toBeCloseTo(15 / 16, 6)
  })

  it('안에 든다는 것은 넓이 있는 토막이 전부 든다는 뜻이다', () => {
    const fp = uvFootprint([0.5, 0.5, 0.75, 0.75], 0, 64, 64)
    expect(footprintWithin(fp, [32, 32, 48, 48])).toBe(true)
    expect(footprintWithin(fp, [32, 32, 47, 48])).toBe(false)
  })
})

describe('칸 지문', () => {
  // 4×2 그림 두 칸 — 왼쪽 칸만 다르다
  const sheet = (left: number) => ({
    width: 4,
    pixels: [left, 0, 0, 255, left, 0, 0, 255, 9, 9, 9, 255, 9, 9, 9, 255,
      left, 0, 0, 255, left, 0, 0, 255, 9, 9, 9, 255, 9, 9, 9, 255],
  })
  const item = { x: 0, y: 0, w: 4, h: 2 }
  it('검수한 칸만 본다 — 칸 밖이 달라도 같고, 칸 안이 다르면 다르다', () => {
    expect(regionDigest(sheet(1), item, [2, 0, 4, 2])).toBe(regionDigest(sheet(7), item, [2, 0, 4, 2]))
    expect(regionDigest(sheet(1), item, [0, 0, 2, 2])).not.toBe(regionDigest(sheet(7), item, [0, 0, 2, 2]))
  })
  it('크기가 다르면 같은 픽셀이어도 다르다', () => {
    expect(regionDigest(sheet(1), item, [2, 0, 4, 1])).not.toBe(regionDigest(sheet(1), item, [2, 0, 4, 2]))
  })
})

describe('교체 결정', () => {
  const planterMesh = meshOf([
    quad(leaning45, cell(32 / 64, 32 / 64, 48 / 64, 48 / 64)),
    quad([[3, 0, 0], [4, 0, 0], [4, 1, -1], [3, 1, -1]], cell(48 / 64, 32 / 64, 1, 48 / 64)),
  ])
  const parts = sourceParts(planterMesh, OPT)
  // 지문은 조각의 출처 지문을 그대로 돌려준다 — 묶음이 다르면 다른 값이다
  const ctx = (mode: ResolveContext['mode']): ResolveContext => ({
    mode, itemSize: () => ({ w: 64, h: 64 }), regionHash: (p) => p.source.sourceHash,
  })
  const recipe = (over: Partial<VisualRecipe> = {}): VisualRecipe => ({
    id: 'imped-planter', version: 1, semantic: 'planter', outcome: 'replace',
    geometry: 'planter', materialProfile: 'rom-lit', anchor: 'ground-contact', review: 'verified',
    selectors: [{ tex: 'imped', regionHashes: ['H'], within: [32, 32, 48, 48], leanDeg: [44.8, 45.2] }],
    provenance: '시험',
    ...over,
  })
  const planterPart = (p: readonly SourcePart[]) => p.find((x) => x.uvBounds[0] === 0.5)!

  it('맞는 레시피가 없으면 미분류 — 현행 표현이다', () => {
    const d = resolveParts(parts, [], ctx('verified'))
    expect(d.every((x) => x.status === 'unclassified')).toBe(true)
    expect(planOf(d).key).toBe('legacy')
    expect(planOf(d).suppressLegacyOffsets.size).toBe(0)
  })

  it('교체는 준비 전에 안 지운다 — 맡기만 한다', () => {
    const d = resolveParts(parts, [recipe()], ctx('verified'))
    const mine = d.find((x) => x.componentId === planterPart(parts).componentId)!
    expect(mine.status).toBe('pending')
    const plan = planOf(d)
    expect([...plan.suppressLegacyOffsets]).toEqual([...planterPart(parts).triangleOffsets])
    expect(plan.removeOffsets.size).toBe(0)
    // 덤불 칸은 안 걸렸다
    expect(d.filter((x) => x.status === 'unclassified')).toHaveLength(1)
  })

  it('준비되면 그 조각만 지운다. 실패하면 그 조각만 현행으로 돌아간다', () => {
    const d = resolveParts(parts, [recipe()], ctx('verified'))
    const ready = d.map((x) => markReady(x))
    expect([...planOf(ready).removeOffsets]).toEqual([...planterPart(parts).triangleOffsets])
    const failed = ready.map((x) => (x.recipeId === 'imped-planter' ? markFailed(x, '재질 실패') : x))
    const plan = planOf(failed)
    expect(plan.removeOffsets.size).toBe(0)
    expect(plan.suppressLegacyOffsets.size).toBe(0)
    expect(failed.filter((x) => x.status === 'unclassified')).toHaveLength(1)
  })

  it('keep은 기다리지 않고 원본을 그대로 둔다 — 기존 변환만 막는다', () => {
    const d = resolveParts(parts, [recipe({ outcome: 'keep' })], ctx('verified'))
    const plan = planOf(d)
    expect(plan.removeOffsets.size).toBe(0)
    expect(plan.suppressLegacyOffsets.size).toBe(2)
    expect(d.some((x) => x.status === 'ready' && x.outcome === 'keep')).toBe(true)
  })

  it('keep + original은 **덩이에서만 빼고 세운다**', () => {
    // 자전거 거치대·금빛 기둥 — 새 모델을 안 만들고 원작처럼 세우는 길이다
    const d = resolveParts(parts, [recipe({ outcome: 'keep', geometry: 'original' })], ctx('verified'))
    const plan = planOf(d)
    expect(plan.removeOffsets.size).toBe(0)
    expect(plan.suppressLegacyOffsets.size).toBe(2)
    // 맡은 삼각형이 그대로 `standOffsets`에도 든다 — `ChunkModels`가 이것으로 `hold`에서 뺀다
    expect([...plan.standOffsets]).toEqual([...plan.suppressLegacyOffsets])
  })

  it('대체물을 세우는 레시피는 standOffsets에 안 든다', () => {
    // 화분·덤불은 그 자리에 새 모델이 서므로 원본을 **세우면 안 된다**
    const plan = planOf(resolveParts(parts, [recipe()], ctx('verified')))
    expect(plan.suppressLegacyOffsets.size).toBe(2)
    expect(plan.standOffsets.size).toBe(0)
  })

  it('geometry가 original이어도 replace면 세우지 않는다', () => {
    const d = resolveParts(parts, [recipe({ geometry: 'original' })], ctx('verified'))
    expect(planOf(d).standOffsets.size).toBe(0)
  })

  it('지문이 다르면 적용하지 않는다 — 같은 이름 다른 그림', () => {
    const other = sourceParts(planterMesh, { ...OPT, texSet: 9, hashOf: () => 'OTHER' })
    const d = resolveParts(other, [recipe()], ctx('verified'))
    const mine = d.find((x) => x.recipeId === 'imped-planter')!
    expect(mine.status).toBe('fallback')
    expect(mine.reason).toContain('지문')
    expect(planOf(d).suppressLegacyOffsets.size).toBe(0)
  })

  it('초안은 candidate 모드에서만 돈다', () => {
    const draft = recipe({ review: 'draft' })
    expect(resolveParts(parts, [draft], ctx('verified')).some((x) => x.status === 'fallback')).toBe(true)
    expect(resolveParts(parts, [draft], ctx('candidate')).some((x) => x.status === 'pending')).toBe(true)
    expect(resolveParts(parts, [draft], ctx('legacy')).every((x) => x.status === 'unclassified')).toBe(true)
  })

  it('두 레시피가 한 조각을 노리면 어느 쪽도 이기지 않는다', () => {
    const d = resolveParts(parts, [recipe(), recipe({ id: 'imped-planter-2' })], ctx('verified'))
    const hit = d.find((x) => x.reason?.includes('충돌'))!
    expect(hit.status).toBe('fallback')
    expect(hit.claimOffsets).toEqual([])
  })

  it('다른 출처가 같은 삼각형을 맡으면 둘 다 물러난다', () => {
    const d = resolveParts(parts, [recipe()], ctx('verified'))
    const dup = { ...d.find((x) => x.status === 'pending')!, componentId: 'patch:0', recipeId: 'room-patch' }
    const merged = rejectDoubleClaims([...d, dup])
    expect(merged.filter((x) => x.reason?.includes('둘 이상'))).toHaveLength(2)
    expect(planOf(merged).suppressLegacyOffsets.size).toBe(0)
  })

  it('결정이 바뀌면 계획 열쇠도 바뀐다', () => {
    const pending = planOf(resolveParts(parts, [recipe()], ctx('verified')))
    const ready = planOf(resolveParts(parts, [recipe()], ctx('verified')).map((x) => markReady(x)))
    expect(pending.key).not.toBe(ready.key)
    expect(hashText('a')).not.toBe(hashText('b'))
  })

  it('원본 배열을 안 건드린다', () => {
    const before = JSON.stringify(planterMesh)
    resolveParts(sourceParts(planterMesh, OPT), [recipe()], ctx('candidate'))
    expect(JSON.stringify(planterMesh)).toBe(before)
  })
})

describe('준비 진단', () => {
  afterEach(() => { resetVisualReadiness() })

  it('늦게 끝난 옛 요청은 새 요청의 숫자를 덮지 못한다', () => {
    const pending = [{
      componentId: 'a', group: 0, outcome: 'replace' as const, recipeId: 'r',
      removeOffsets: [], claimOffsets: [0], keepStanding: false,
      status: 'pending' as const, reason: null,
    }]
    expect(noteVisualDecisions(5, pending)).toBe(true)
    expect(visualReadiness()).toMatchObject({ req: 5, pending: 1, settled: false })
    expect(noteVisualDecisions(4, [])).toBe(false)
    expect(visualReadiness().req).toBe(5)
    expect(noteVisualDecisions(5, pending.map((x) => markReady(x)))).toBe(true)
    expect(visualReadiness()).toMatchObject({ req: 5, ready: 1, pending: 0, settled: true })
  })
})

// ── 실제 롬 자료 ─────────────────────────────────────────────────────────────

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('chunks/index.json', 'chunks/133.bin', 'chunks/565.bin', 'chunks/0.bin', 'tex/index.json')

function readChunk(chunk: number): MeshArrays {
  const fmt = JSON.parse(readFileSync(resolve(DATA, 'chunks/index.json'), 'utf8')) as { vertexBytes: number, posScale: number }
  const buf = readFileSync(resolve(DATA, `chunks/${String(chunk)}.bin`))
  const metaLen = buf.readUInt32LE(4)
  const meta = JSON.parse(buf.subarray(8, 8 + metaLen).toString('utf8')) as {
    verts: number, indices: number,
    materials: { tex: string | null, pal: string | null, rep: number }[],
    submeshes: [number, number, number][]
  }
  const head = 8 + metaLen + ((4 - (metaLen % 4)) % 4)
  const position = new Float32Array(meta.verts * 3)
  const uv = new Float32Array(meta.verts * 2)
  for (let i = 0; i < meta.verts; i++) {
    const o = head + i * fmt.vertexBytes
    for (let a = 0; a < 3; a++) position[i * 3 + a] = buf.readInt16LE(o + a * 2) / fmt.posScale
    for (let a = 0; a < 2; a++) uv[i * 2 + a] = buf.readFloatLE(o + 8 + a * 4)
  }
  const index = new Uint16Array(meta.indices)
  for (let i = 0; i < meta.indices; i++) index[i] = buf.readUInt16LE(head + meta.verts * fmt.vertexBytes + i * 2)
  return {
    index, position, uv,
    groups: meta.submeshes,
    materials: meta.submeshes.map(([mat]) => meta.materials[mat]!),
  }
}

maybe('롬 청크의 imped 표본 (명세 §3)', () => {
  const REGIONS = [
    { name: 'fence', rect: [0, 0, 64, 16] as const },
    { name: 'rail', rect: [0, 20, 64, 28] as const },
    { name: 'rock-large', rect: [0, 32, 32, 64] as const },
    { name: 'planter', rect: [32, 32, 48, 48] as const },
    { name: 'shrub', rect: [48, 32, 64, 48] as const },
    { name: 'rock-small-brown', rect: [32, 48, 48, 64] as const },
    { name: 'rock-small-grey', rect: [48, 48, 64, 64] as const },
  ]
  const imped = (chunk: number) => sourceParts(readChunk(chunk), { kind: 'chunk', assetId: chunk, texSet: 0, hashOf: () => '-' })
    .filter((p) => p.source.tex === 'imped')
    .map((p) => ({ p, top: regionShares(uvFootprint(p.uvBounds, p.source.rep, 64, 64), REGIONS)[0] }))

  it('청크 133에 화분 칸 조각이 있고, 원본 offset은 3의 배수이며 겹치지 않는다', () => {
    const got = imped(133)
    expect(got.some((x) => x.top?.name === 'planter' && x.top.share === 1)).toBe(true)
    const all = got.flatMap((x) => x.p.triangleOffsets)
    expect(all.every((o) => o % 3 === 0)).toBe(true)
    expect(new Set(all).size).toBe(all.length)
  })

  it('청크 565에는 둥근 식생 칸이 있다 — 화분과 다른 칸이다', () => {
    const got = imped(565)
    expect(got.some((x) => x.top?.name === 'shrub' && x.top.share === 1)).toBe(true)
  })

  it('청크 0에는 울타리 칸이 있다', () => {
    expect(imped(0).some((x) => x.top?.name === 'fence')).toBe(true)
  })

  it('조각이 서브메시의 삼각형을 빠짐없이 한 번씩 덮는다', () => {
    for (const chunk of [0, 133, 565]) {
      const mesh = readChunk(chunk)
      const parts = sourceParts(mesh, { kind: 'chunk', assetId: chunk, texSet: 0, hashOf: () => '-' })
      const covered = parts.flatMap((p) => p.triangleOffsets).sort((a, b) => a - b)
      const want: number[] = []
      for (const [, start, count] of mesh.groups) for (let t = 0; t + 3 <= count; t += 3) want.push(start + t)
      expect(covered).toEqual(want.sort((a, b) => a - b))
    }
  })
})
