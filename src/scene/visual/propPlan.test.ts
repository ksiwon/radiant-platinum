// 소품의 십자 카드 (FP-07)
import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { crossCards, crossClaims, propTree, shellBody, standClaims, standProp, treeClaims } from './propPlan'
import { VISUAL_RECIPES } from './recipes'
import type { ChunkMesh, TexSheet } from '../chunkMesh'
import { withData } from '../../data/romData.testkit'

/** 카드 한 장짜리 소품 — z=0 평면에 선 사각형 하나 */
function oneCard(tex: string): ChunkMesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([
    -1, 0, 0, 1, 0, 0, 1, 2, 0, -1, 2, 0,
  ]), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2))
  g.setAttribute('normal', new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]), 3))
  g.setIndex([0, 1, 2, 0, 2, 3])
  g.addGroup(0, 6, 0)
  return {
    geometry: g,
    materials: [{ tex, pal: tex, rep: 0, a: 31, f: 0 }],
    groups: [[0, 0, 6]],
  }
}

/** 32×32 한 장을 가진 가짜 시트. 픽셀은 지문에 쓰인다 */
function sheetOf(tex: string, seed: number): TexSheet {
  const pixels = new Uint8ClampedArray(32 * 32 * 4)
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7 + seed) & 0xff
  return { width: 32, height: 32, pixels, items: [{ tex, pal: tex, x: 0, y: 0, w: 32, h: 32 }] }
}

describe('십자 카드', () => {
  it('맞는 레시피가 없으면 아무것도 안 만든다', () => {
    expect(crossCards(oneCard('nope'), sheetOf('nope', 1), 0, VISUAL_RECIPES, 'verified')).toBeNull()
  })

  it('지문이 다르면 안 건다 — 이름만으로 안 고른다', () => {
    const mesh = oneCard('plant01')
    expect(crossCards(mesh, sheetOf('plant01', 3), 85, VISUAL_RECIPES, 'verified')).toBeNull()
  })

  it('legacy 모드에서는 안 돈다', () => {
    const mesh = oneCard('plant01')
    expect(crossCards(mesh, sheetOf('plant01', 3), 85, VISUAL_RECIPES, 'legacy')).toBeNull()
  })
})

withData('props/index.json', 'props/85.bin', 'props/85.png')('실제 자료 — 화분에 심은 작은 나무 (소품 85)', () => {
  it('원본 카드를 90° 돌린 사본이 나온다 — 정점 수와 재질 칸이 같다', async () => {
    const { loadPropMesh, loadPropSheet } = await import('../chunkMesh')
    const { installNodeAssets } = await import('../../data/romData.testkit')
    installNodeAssets()
    const mesh = await loadPropMesh(85)
    const sheet = await loadPropSheet(85)
    const made = crossCards(mesh, sheet, 85, VISUAL_RECIPES, 'verified')
    expect(made, '십자 카드를 못 만들었다').not.toBeNull()
    const src = mesh.geometry
    // 맡은 것은 `plant01` 서브메시뿐이다 — 화분(재질 0)은 안 건드린다
    const used = new Set(made!.groups.map((g) => g.materialIndex))
    expect([...used]).toEqual([1])
    // ⚠️ **나무 카드만** 복제한다 — 화분 윗면(누운 면)까지 돌려 복제하면 같은 높이에
    // 두 장이 겹친다. 나무 칸(0,0,16,32)의 선 판은 20°로 선 **잎 한 장(삼각형 6) ·
    // 줄기 한 장(2)**이다 (목록 실측 · 칸 [0,2,16,25]과 [4,25,12,30])
    expect(made!.getIndex()!.count / 3).toBe(8)
    const n = made!.getAttribute('normal')
    for (let i = 0; i < n.count; i++) expect(Math.abs(n.getY(i))).toBeLessThan(0.71)
    // 좌표가 다 유한하고, 세로(y)는 원본 범위에서 거의 안 벗어난다 — 등줄기로 돌리면
    // 가로 모서리가 기운 면 방향으로 가 반폭 × sin 20°만큼 오르내린다 (실측 위 +0.171)
    const p = made!.getAttribute('position')
    const q = src.getAttribute('position')
    let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity
    for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i)) }
    for (let i = 0; i < q.count; i++) { lo2 = Math.min(lo2, q.getY(i)); hi2 = Math.max(hi2, q.getY(i)) }
    expect(lo).toBeGreaterThanOrEqual(lo2 - 0.2)
    expect(hi).toBeLessThanOrEqual(hi2 + 0.2)
    expect([...(p.array as Float32Array)].every(Number.isFinite)).toBe(true)
    // 밑동은 제자리다 — 원본 밑동(가장 낮은 정점들)의 한가운데가 사본에서도 같다.
    // 사본에선 그 모서리들이 반폭 × sin 20°만큼 오르내리므로 **같은 수만큼 낮은 것**을 본다.
    // 가로 한가운데를 세로축으로 돌리면 밑동이 옮겨져 줄기가 둘로 벌어진다 (plant-after)
    const foot = (pts: number[][], many?: number) => {
      const low = Math.min(...pts.map((v) => v[1]!))
      const at = many === undefined
        ? pts.filter((v) => v[1]! - low < 1e-4)
        : [...pts].sort((l, r) => l[1]! - r[1]!).slice(0, many)
      return [0, 1, 2].map((k) => at.reduce((t, v) => t + v[k]!, 0) / at.length).concat(at.length)
    }
    const idx = src.getIndex()!.array
    // 정점은 한 번씩만 센다 — 사본도 같은 정점을 한 번씩 옮긴다
    const seen = new Set<number>()
    for (const t of crossClaims(mesh, sheet, 85, VISUAL_RECIPES, 'verified').keys()) {
      for (let k = 0; k < 3; k++) seen.add(idx[t + k]!)
    }
    const orig = [...seen].map((v) => [q.getX(v), q.getY(v), q.getZ(v)])
    const turned: number[][] = []
    for (let i = 0; i < p.count; i++) turned.push([p.getX(i), p.getY(i), p.getZ(i)])
    // 참 십자다 — 사본의 면은 원본 면과 직각이다 (세로축으로 돌린 V는 여기서 걸린다)
    const qn = src.getAttribute('normal')
    for (const v of seen) {
      for (let i = 0; i < n.count; i++) {
        const dot = qn.getX(v) * n.getX(i) + qn.getY(v) * n.getY(i) + qn.getZ(v) * n.getZ(i)
        expect(Math.abs(dot)).toBeLessThan(0.05)
      }
    }
    const [ox, oy, oz, many] = foot(orig)
    const [mx, my, mz] = foot(turned, many)
    expect(Math.hypot(ox! - mx!, oy! - my!, oz! - mz!)).toBeLessThan(1e-4)
  }, 60_000)
})

withData('chunks/332.bin', 'tex/index.json')('실제 자료 — 리조트 별장의 화분 나무 두 그루 (청크 332)', () => {
  it('⚠️ 그루마다 제 밑동 둘레로 돈다 — 한 축으로 돌리면 한 그루가 방 한가운데로 난다', async () => {
    const { loadChunkMesh, loadTexSheet } = await import('../chunkMesh')
    const { installNodeAssets } = await import('../../data/romData.testkit')
    installNodeAssets()
    const mesh = await loadChunkMesh(332)
    // 맵 454(T06R0101)의 영역이 그리는 묶음 — 청크가 그 묶음으로 그려진다
    const SET = 51
    const sheet = await loadTexSheet(SET)
    const made = crossCards(mesh, sheet, 332, VISUAL_RECIPES, 'verified', 'chunk', SET)
    expect(made, '청크에서 십자 카드를 못 만들었다').not.toBeNull()
    // 잎 6 + 줄기 2가 두 그루
    expect(made!.getIndex()!.count / 3).toBe(16)
    const src = mesh.geometry
    const q = src.getAttribute('position')
    const p = made!.getAttribute('position')
    const idx = src.getIndex()!.array
    const seen = new Set<number>()
    for (const t of crossClaims(mesh, sheet, 332, VISUAL_RECIPES, 'verified', 'chunk', SET).keys()) {
      for (let k = 0; k < 3; k++) seen.add(idx[t + k]!)
    }
    // 두 그루를 x로 가른다 — 가장 넓은 틈에서 자른다
    const split = (pts: number[][]) => {
      const xs = [...new Set(pts.map((v) => v[0]!))].sort((a, b) => a - b)
      let cut = xs[0]!, gap = -1
      for (let i = 1; i < xs.length; i++) if (xs[i]! - xs[i - 1]! > gap) { gap = xs[i]! - xs[i - 1]!; cut = (xs[i]! + xs[i - 1]!) / 2 }
      return [pts.filter((v) => v[0]! < cut), pts.filter((v) => v[0]! >= cut)]
    }
    const foot = (pts: number[][]) => {
      const low = Math.min(...pts.map((v) => v[1]!))
      const at = pts.filter((v) => v[1]! - low < 0.2)
      return [at.reduce((t, v) => t + v[0]!, 0) / at.length, at.reduce((t, v) => t + v[2]!, 0) / at.length]
    }
    const orig = split([...seen].map((v) => [q.getX(v), q.getY(v), q.getZ(v)]))
    const turned: number[][] = []
    for (let i = 0; i < p.count; i++) turned.push([p.getX(i), p.getY(i), p.getZ(i)])
    const copy = split(turned)
    expect(orig[0]!.length).toBeGreaterThan(0)
    expect(orig[1]!.length).toBeGreaterThan(0)
    // 사본의 두 그루가 원본의 두 그루와 **같은 자리**에 선다 (밑동 xz가 0.3칸 안)
    for (let k = 0; k < 2; k++) {
      const [ox, oz] = foot(orig[k]!), [cx, cz] = foot(copy[k]!)
      expect(Math.hypot(ox! - cx!, oz! - cz!), `그루 ${String(k)}`).toBeLessThan(0.3)
    }
  }, 60_000)
})

withData('props/index.json', 'props/492.bin', 'props/152.bin', 'props/548.bin')('실제 자료 — 눕힌 카드를 세운다 (묘비 · 석상 · 조각상)', () => {
  const load = async (id: number) => {
    const { loadPropMesh, loadPropSheet } = await import('../chunkMesh')
    const { installNodeAssets } = await import('../../data/romData.testkit')
    installNodeAssets()
    return { mesh: await loadPropMesh(id), sheet: await loadPropSheet(id) }
  }
  /** 맡은 삼각형의 정점 — 원본과 세운 것 */
  const cardOf = (geo: BufferGeometry, claims: Map<number, string>) => {
    const idx = geo.getIndex()!.array
    const p = geo.getAttribute('position')
    const vs = new Set<number>()
    for (const t of claims.keys()) for (let k = 0; k < 3; k++) vs.add(idx[t + k]!)
    return [...vs].map((v) => [p.getX(v), p.getY(v), p.getZ(v)] as const)
  }

  for (const [id, what, low, height] of [
    // 묘비는 땅에서 선다 · 석상은 받침 위(y 1.71)에서 선다 · 조각상은 받침 앞 아래에서
    [492, '묘비', 0.06, 1.02], [152, '체육관 석상', 1.71, 1.1], [548, '배틀타워 조각상', 0.81, 3.01],
  ] as const) {
    it(`${what} (소품 ${String(id)}) — 경첩은 제자리 · 판은 수직 · 높이는 판 길이`, async () => {
      const { mesh, sheet } = await load(id)
      const claims = standClaims(mesh, sheet, id, VISUAL_RECIPES, 'verified')
      expect(claims.size, '세울 판을 못 찾았다').toBe(2)
      const made = standProp(mesh, sheet, id, VISUAL_RECIPES, 'verified')!
      const before = cardOf(mesh.geometry, claims)
      const after = cardOf(made, claims)
      // 경첩(가장 낮은 모서리)은 안 움직인다
      const lo = Math.min(...before.map((v) => v[1]))
      expect(Math.min(...after.map((v) => v[1]))).toBeCloseTo(lo, 3)
      expect(lo).toBeCloseTo(low, 1)
      // 수직 — 세운 판의 정점이 한 수직 평면(z 한 값)에 선다. 원작 카드는 모두 x축 경첩이다
      const zs = after.map((v) => v[2])
      expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1e-3)
      // 높이 = 원래 판의 기운 길이
      expect(Math.max(...after.map((v) => v[1])) - lo).toBeCloseTo(height, 1)
      // 판이 아닌 것(받침)은 한 정점도 안 움직인다
      const p0 = mesh.geometry.getAttribute('position'), p1 = made.getAttribute('position')
      const card = new Set<number>()
      const idx = mesh.geometry.getIndex()!.array
      for (const t of claims.keys()) for (let k = 0; k < 3; k++) card.add(idx[t + k]!)
      for (let v = 0; v < p0.count; v++) {
        if (card.has(v)) continue
        expect(p1.getY(v)).toBe(p0.getY(v))
        expect(p1.getZ(v)).toBe(p0.getZ(v))
      }
      // 법선도 수평이 됐다 (다시 계산했다)
      const n = made.getAttribute('normal')
      for (const v of card) expect(Math.abs(n.getY(v))).toBeLessThan(1e-3)
    }, 60_000)
  }

  it('⚠️ 메운 판은 세운 카드를 빼고 센다 — 안 빼면 비석이 두 장이 된다', async () => {
    const { shellPaint, shellPlates } = await import('../shell')
    const plates = (m: ChunkMesh, sheet: TexSheet | null) => shellPlates(m, shellPaint(m, sheet))
    // 묘비는 카드 한 장이 전부라 메울 것이 없다 (빼기 전: 눕힌 카드 뒤에 수직 판 하나)
    const tomb = await load(492)
    expect(plates(tomb.mesh, tomb.sheet)).not.toBeNull()
    expect(plates(shellBody(tomb.mesh, tomb.sheet, 492, VISUAL_RECIPES, 'verified'), tomb.sheet)).toBeNull()
    // 조각상은 받침(y ≤ 1.16)의 메운 판만 남는다
    const statue = await load(548)
    const left = plates(shellBody(statue.mesh, statue.sheet, 548, VISUAL_RECIPES, 'verified'), statue.sheet)!
    const p = left.getAttribute('position')
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeLessThanOrEqual(1.17)
  }, 60_000)

  it('⚠️ 원본 몸통은 안 건드린다 — 복제해서 고친다', async () => {
    const { mesh, sheet } = await load(492)
    const y = [...(mesh.geometry.getAttribute('position').array as Float32Array)]
    standProp(mesh, sheet, 492, VISUAL_RECIPES, 'verified')
    expect([...(mesh.geometry.getAttribute('position').array as Float32Array)]).toEqual(y)
  }, 60_000)
})

withData('props/index.json', 'props/26.bin', 'props/26.png')('실제 자료 — 꿀나무 (소품 26)', () => {
  it('⚠️ 잎 카드 세 장을 입체 나무 하나로 — 그루터기는 둔다', async () => {
    const { loadPropMesh, loadPropSheet } = await import('../chunkMesh')
    const { installNodeAssets } = await import('../../data/romData.testkit')
    installNodeAssets()
    const mesh = await loadPropMesh(26)
    const sheet = await loadPropSheet(26)
    // 잎 뭉치 셋 × 삼각형 둘. 그루터기(땅에 깐 판)는 안 맡는다
    const claims = treeClaims(mesh, sheet, 26, VISUAL_RECIPES, 'verified')
    expect(claims.size).toBe(6)
    const stump = mesh.groups[0]!
    for (const t of claims.keys()) expect(t >= stump[1] && t < stump[1] + stump[2]).toBe(false)
    const tree = propTree(mesh, sheet, 26, VISUAL_RECIPES, 'verified')!
    // 크기 = 잎 카드 더미의 높이 (0.45 ~ 2.63)
    expect(tree.minY).toBeCloseTo(0.45, 1)
    expect(tree.maxY).toBeCloseTo(2.63, 1)
    // 밑동은 모델 한가운데 가까이 (그루터기 ±1 안)
    expect(Math.abs(tree.x)).toBeLessThan(0.1)
    expect(Math.abs(tree.z)).toBeLessThan(0.5)
    // 색은 그림에서 — 층마다 가장 많은 색 (노랑 · 황토 · 갈색) · 그루터기 갈색. 새 색을 안 짓는다
    expect(tree.leaf).toEqual([0xc6ad39, 0xad9439, 0x947b39])
    expect(tree.trunk).toBe(0x8c6331)
    // 메운 판도 잎 카드를 빼고 센다 — 안 빼면 입체 나무 뒤에 잎 그림 판이 선다
    const { shellPaint, shellPlates } = await import('../shell')
    const body = shellBody(mesh, sheet, 26, VISUAL_RECIPES, 'verified')
    const left = shellPlates(body, shellPaint(body, sheet))
    if (left !== null) {
      const p = left.getAttribute('position')
      for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeLessThan(0.3)
    }
  }, 60_000)
})
