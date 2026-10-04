// 턱 — BDSP 지역이 그린 턱 · 안 그린 턱 (docs/orders/BATTLE_FX_20261004.md §8)
//
// 잡는 것 둘: ① 안 그린 칸 표(`BDSP_BARE_LEDGES`)는 그 지역이 **서서 그려질 때만** 세운다 ② 실측 — 턱 341칸에 BDSP 지역 glb를
// 위에서 쏘아 보면 336칸은 낮은 절벽(`Cliff_04` · `Cliff_04B`)이 착지 쪽 땅보다 0.16 높이 서 있고, 평평한 다섯이 표와 같다
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { BDSP_BARE_LEDGES, bdspBareLedge } from './Ledges'
import { ledgeJump } from '../engine/actor/ledge'
import { heightField } from '../engine/map/height'
import { FIELD, ROOT, areaFields, fieldMeshes, loadHeight, outdoorGrid } from './fieldGlb.testkit'

describe('BDSP가 안 그린 턱 (`bdspBareLedge`)', () => {
  it('그 칸을 그리는 지역이 섰을 때만 세운다', () => {
    const asked: string[] = []
    expect(bdspBareLedge(314, 898, (k) => { asked.push(k); return true })).toBe(true)
    expect(asked).toEqual(['area001'])
    expect(bdspBareLedge(314, 898, () => false)).toBe(false)
    // 표 밖의 턱은 BDSP가 그린다
    expect(bdspBareLedge(216, 614, () => true)).toBe(false)
  })
})

const baked = ['models/field/index.json', 'data/matrices/0.bin', 'data/bdhc.bin']
  .every((p) => existsSync(resolve(ROOT, 'public', p)))

describe.skipIf(!baked)('턱 341칸과 구운 지역 (실측)', () => {
  heightField.data = loadHeight()
  const grid = outdoorGrid()
  const tiles: { x: number, z: number, dx: number, dz: number }[] = []
  for (let z = 0; z < grid.meta.tileHeight; z++) {
    for (let x = 0; x < grid.meta.tileWidth; x++) {
      const j = ledgeJump(grid.behavior(x, z))
      if (j) tiles.push({ x, z, dx: j[0], dz: j[1] })
    }
  }
  const roots = areaFields().map((f) => {
    const mine = tiles.filter((p) => f.box[0] - 2 <= p.x && p.x <= f.box[2] + 2 && f.box[1] - 2 <= p.z && p.z <= f.box[3] + 2)
    return mine.length === 0 ? new Group() : fieldMeshes(resolve(FIELD, `${f.name}.glb`),
      (b) => mine.some((p) => b.min.x <= p.x + 2 && b.max.x >= p.x - 1 && b.min.z <= p.z + 2 && b.max.z >= p.z - 1))
  })
  const rays = new Raycaster()
  /** 위에서 쏘아 맨 먼저 맞는 땅 · 절벽 — 풀 · 꽃 · 나무 잎은 건너뛴다 */
  const topAt = (x: number, z: number): { name: string, y: number } | null => {
    let best: { name: string, y: number } | null = null
    for (const root of roots) {
      rays.set(new Vector3(x, 100, z), new Vector3(0, -1, 0))
      for (const h of rays.intersectObject(root, true)) {
        const name = ((h.object as Mesh).material as MeshBasicMaterial).name
        if (/Grass_|Flower|Leaf|Tree|Shadow|Grad/.test(name) && !/Ground|Cliff/.test(name)) continue
        if (best === null || h.point.y > best.y) best = { name, y: h.point.y }
        break
      }
    }
    return best
  }
  /** 턱 칸 한가운데에서 뛰는 쪽으로 `t`칸 */
  const along = (t: { x: number, z: number, dx: number, dz: number }, k: number) => topAt(t.x + 0.5 + t.dx * k, t.z + 0.5 + t.dz * k)
  // 절벽은 칸 한가운데와 착지 쪽 +0.25에 걸친다 — 326칸은 −0.25부터, 열 칸(550~559, 532)은 한가운데부터다
  const lip = (t: (typeof tiles)[number]): boolean => [0, 0.25].every((k) => /_Cliff_04B?$/.test(along(t, k)?.name ?? ''))

  it('턱은 341칸이다 — 남 305 · 서 21 · 동 15', () => {
    expect(tiles).toHaveLength(341)
    expect(tiles.filter((t) => t.dz === 1)).toHaveLength(305)
    expect(tiles.filter((t) => t.dx === -1)).toHaveLength(21)
    expect(tiles.filter((t) => t.dx === 1)).toHaveLength(15)
  })

  it('336칸은 BDSP가 낮은 절벽을 구워 두었다 — 칸 한가운데가 착지 쪽 땅보다 0.16 높고 +0.75는 땅이다', () => {
    const drawn = tiles.filter(lip)
    expect(drawn).toHaveLength(336)
    for (const t of drawn) {
      // 착지 쪽 땅에서 잰다 — 원작 높이 자료는 턱 칸 몇에서 비어 있다(층이 둘인 칸)
      const top = along(t, 0)!.y - along(t, 0.75)!.y
      expect(top, `${String(t.x)},${String(t.z)}`).toBeGreaterThan(0.1)
      expect(top, `${String(t.x)},${String(t.z)}`).toBeLessThan(0.25)
      expect(along(t, 0.75)!.name, `${String(t.x)},${String(t.z)}`).not.toMatch(/_Cliff_04/)
      expect(bdspBareLedge(t.x, t.z, () => true)).toBe(false)
    }
  })

  it('평평한 다섯이 안 그린 칸 표와 같다 — 221번도로의 동쪽 턱 한 줄', () => {
    const bare = tiles.filter((t) => !lip(t))
    const key = (c: { x: number, z: number }): string => `${String(c.x)},${String(c.z)}`
    expect(bare.map(key).sort()).toEqual(BDSP_BARE_LEDGES.map(key).sort())
    for (const t of bare) {
      expect(t.dx).toBe(1)
      // 앞뒤 1.5칸까지 다 같은 높이의 맨땅이다
      const ys = [-1.5, -0.75, 0, 0.75, 1.5].map((k) => along(t, k)!)
      for (const h of ys) expect(h.name).toMatch(/_Ground_/)
      expect(Math.max(...ys.map((h) => h.y)) - Math.min(...ys.map((h) => h.y))).toBeLessThan(0.01)
    }
  })
}, 600_000)
