// 소품의 십자 카드 (FP-07)
import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { crossCards, crossClaims } from './propPlan'
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
