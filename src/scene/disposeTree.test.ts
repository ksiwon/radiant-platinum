import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three'
import { disposeTree } from './disposeTree'

describe('치운 BDSP 층을 버린다 (disposeTree)', () => {
  it('형상 · 재질 · 그림을 버린다 — 나눠 쥔 것은 한 번씩', () => {
    const shared = new Texture()
    const glow = new Texture()
    const a = new MeshStandardMaterial({ map: shared })
    const b = new MeshStandardMaterial({ map: shared, emissiveMap: glow })
    const geometry = new BoxGeometry()
    const root = new Group()
    root.add(new Mesh(geometry, a), new Mesh(geometry, [a, b]))
    const spies = [shared, glow, a, b, geometry].map((x) => vi.spyOn(x, 'dispose'))
    disposeTree(root)
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1)
  })
})
