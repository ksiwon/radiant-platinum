import { afterEach, describe, expect, it, vi } from 'vitest'
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

  describe('닫은 그림을 텍스처에 남기지 않는다', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('ImageBitmap을 닫고 1×1로 바꾼다 — 닫힌 채 올라가면 detached 경고가 뜬다', () => {
      class FakeBitmap { close = vi.fn() }
      class FakeData { constructor(public width: number, public height: number) {} }
      vi.stubGlobal('ImageBitmap', FakeBitmap)
      vi.stubGlobal('ImageData', FakeData)
      const bitmap = new FakeBitmap()
      const map = new Texture(bitmap as unknown as HTMLImageElement)
      const root = new Group()
      root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map })))
      disposeTree(root)
      expect(bitmap.close).toHaveBeenCalledTimes(1)
      expect(map.image).not.toBe(bitmap)
      expect(map.image).toMatchObject({ width: 1, height: 1 })
    })
  })
})
