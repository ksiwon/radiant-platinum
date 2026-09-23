// 내려가는 계단 우물 (파일럿 보고 ⑦ · `stairs.propStairs`)
import { describe, expect, it } from 'vitest'
import { propStairs } from './stairs'
import { VISUAL_RECIPES } from './recipes'
import { withData } from '../../data/romData.testkit'

const load = async (id: number) => {
  const { loadPropMesh, loadPropSheet } = await import('../chunkMesh')
  const { installNodeAssets } = await import('../../data/romData.testkit')
  installNodeAssets()
  return { mesh: await loadPropMesh(id), sheet: await loadPropSheet(id) }
}

describe('계단 레시피가 없을 때', () => {
  it('그림이 없으면 아무것도 안 만든다', async () => {
    const { BufferAttribute, BufferGeometry } = await import('three')
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    g.setIndex([0, 1, 2])
    expect(propStairs({ geometry: g, materials: [], groups: [] }, null, 156, VISUAL_RECIPES, 'candidate')).toBeNull()
  })
})

withData(
  'props/index.json', 'props/104.bin', 'props/105.bin', 'props/155.bin', 'props/156.bin',
  'props/104.png', 'props/105.png', 'props/155.png', 'props/156.png',
)('실제 자료 — 계단 소품 넷', () => {
  for (const id of [105, 156]) {
    it(`내려가는 계단 ${String(id)} — 비탈 넷과 우물 벽 여덟을 디딤 넷짜리 계단으로 바꾼다`, async () => {
      const { mesh, sheet } = await load(id)
      const made = propStairs(mesh, sheet, id, VISUAL_RECIPES, 'candidate')
      expect(made, '계단을 못 만들었다').not.toBeNull()
      // 그림에 그려진 디딤 수 — 6텍셀마다 되풀이되는 노란 디딤이 칸 0~24에 넷이다
      expect(made!.steps).toBe(4)
      // 비탈 삼각형 넷(#26~#29) + 우물 벽 여덟(#36~#41 · #44 · #45). 난간과 윗참은 안 맡는다
      const tris = [...made!.claims.keys()].map((o) => o / 3).sort((a, b) => a - b)
      expect(tris).toEqual([26, 27, 28, 29, 36, 37, 38, 39, 40, 41, 44, 45])
      // 원래 우물 상자 안에만 선다 — 바닥 위로도, 우물 밖으로도 안 나간다
      const p = made!.geometry.getAttribute('position')
      const src = mesh.geometry.getAttribute('position')
      const idx = mesh.geometry.getIndex()!.array
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
      for (const o of made!.claims.keys()) {
        for (let k = 0; k < 3; k++) {
          const v = idx[o + k]!
          const c = [src.getX(v), src.getY(v), src.getZ(v)]
          lo = lo.map((x, i) => Math.min(x, c[i]!)); hi = hi.map((x, i) => Math.max(x, c[i]!))
        }
      }
      for (let i = 0; i < p.count; i++) {
        const c = [p.getX(i), p.getY(i), p.getZ(i)]
        for (let a = 0; a < 3; a++) {
          expect(c[a]!).toBeGreaterThanOrEqual(lo[a]! - 1e-3)
          expect(c[a]!).toBeLessThanOrEqual(hi[a]! + 1e-3)
        }
      }
      // 디딤 넷 × (챌면 · 디딤 · 옆벽 둘) + 끝 벽 = 사각형 17
      expect(p.count).toBe(17 * 6)
      // 안으로 갈수록 어둡다 — 가장 밝은 정점이 가장 어두운 정점의 열 배가 넘는다
      const col = made!.geometry.getAttribute('color')
      let bright = 0, dark = Infinity
      for (let i = 0; i < col.count; i++) { bright = Math.max(bright, col.getX(i)); dark = Math.min(dark, col.getX(i)) }
      expect(bright / dark).toBeGreaterThan(10)
      // 원본 비탈과 같은 재질 칸 하나에 든다 — 새 재질이 없다
      expect(made!.geometry.groups.map((g) => g.materialIndex)).toEqual([0])
    })
  }

  for (const id of [104, 155]) {
    it(`올라가는 계단 ${String(id)}은 안 건드린다 — 같은 그림 · 같은 각이지만 비탈이 바닥 위에 있다`, async () => {
      const { mesh, sheet } = await load(id)
      expect(propStairs(mesh, sheet, id, VISUAL_RECIPES, 'candidate')).toBeNull()
    })
  }

  it('검수됐다 — 기본 게임(verified)에서 선다 · legacy에서는 안 선다', async () => {
    const { mesh, sheet } = await load(156)
    expect(propStairs(mesh, sheet, 156, VISUAL_RECIPES, 'verified')).not.toBeNull()
    expect(propStairs(mesh, sheet, 156, VISUAL_RECIPES, 'legacy')).toBeNull()
  })
})
