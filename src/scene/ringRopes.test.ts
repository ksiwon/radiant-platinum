import { describe, expect, it } from 'vitest'
import type { ChunkMeta } from './chunkMesh'
import { quadOrder, RING_ROPES, ringSideRopes } from './ringRopes'

/** 링 하나 — 앞 줄 판(z 11.2)과 뒤 줄 판(z 16.32) · x 13.38~18.63 · y 0.94~1.94, 그리고 누운 옆줄 띠 하나 */
function ring(): { position: Float32Array, uv: Float32Array, color: Float32Array, indices: number[], meta: ChunkMeta } {
  const quad = (z: number): number[] => [13.38, 0.94, z, 18.63, 0.94, z, 18.63, 1.94, z, 13.38, 1.94, z]
  const flat = [13.19, 1.25, 15, 13.66, 1.25, 15, 13.66, 1.25, 16.5, 13.19, 1.25, 16.5]
  const position = new Float32Array([...quad(11.2), ...quad(16.32), ...flat])
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1])
  const color = new Float32Array(36).fill(1)
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]
  const meta = {
    verts: 12, indices: indices.length,
    materials: [{ tex: RING_ROPES.rope }, { tex: RING_ROPES.flat }],
    submeshes: [[0, 0, 12], [1, 12, 6]],
  } as unknown as ChunkMeta
  return { position, uv, color, indices, meta }
}

describe('링 옆줄', () => {
  it('앞뒤 줄 판을 본떠 x 끝 두 자리에 z 방향 판을 세우고, 누운 띠는 안 그린다', () => {
    const r = ring()
    const { sills, drop } = ringSideRopes(r.position, r.uv, r.color, r.indices, r.meta)
    expect(sills).toHaveLength(2)
    expect([...drop]).toEqual([1])
    for (const s of sills) {
      expect(s.submesh).toBe(0)
      const xs = new Set([0, 1, 2, 3].map((i) => s.position[i * 3]))
      expect(xs.size).toBe(1)
      const zs = [0, 1, 2, 3].map((i) => s.position[i * 3 + 2]!)
      expect(Math.min(...zs)).toBeCloseTo(11.2)
      expect(Math.max(...zs)).toBeCloseTo(16.32)
      const ys = [0, 1, 2, 3].map((i) => s.position[i * 3 + 1]!)
      expect(Math.min(...ys)).toBeCloseTo(0.94)
      expect(Math.max(...ys)).toBeCloseTo(1.94)
    }
    expect(sills.map((s) => s.position[0]).sort()).toEqual([Math.fround(13.38), Math.fround(18.63)].sort())
  })

  it('링 줄이 없는 청크는 그대로 둔다', () => {
    const r = ring()
    const meta = { ...r.meta, materials: [{ tex: 'other' }, { tex: RING_ROPES.flat }] } as unknown as ChunkMeta
    const { sills, drop } = ringSideRopes(r.position, r.uv, r.color, r.indices, meta)
    expect(sills).toHaveLength(0)
    expect(drop.size).toBe(0)
  })

  it('옆줄 판은 링 바깥을 본다', () => {
    const p = [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0]
    const normalX = (o: number[]): number => {
      const [a, b, c] = o as [number, number, number]
      const uy = p[b * 3 + 1]! - p[a * 3 + 1]!, uz = p[b * 3 + 2]! - p[a * 3 + 2]!
      const vy = p[c * 3 + 1]! - p[a * 3 + 1]!, vz = p[c * 3 + 2]! - p[a * 3 + 2]!
      return Math.sign(uy * vz - uz * vy)
    }
    expect(normalX(quadOrder(p, 1))).toBe(1)
    expect(normalX(quadOrder(p, -1))).toBe(-1)
  })
})
