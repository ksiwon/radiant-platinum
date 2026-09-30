import { describe, expect, it } from 'vitest'
import { AdditiveBlending, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { bdspLights, darknessAt, glowShare } from './bdspLights'

describe('BDSP 빛 재질 (docs/orders/VISUAL_20260930.md §2)', () => {
  it('낮은 어둠 0 · 해질녘 0.5 · 밤 1이다', () => {
    expect(darknessAt(12)).toBe(0)
    expect(darknessAt(18)).toBe(0.5)
    expect(darknessAt(21)).toBe(1)
    expect(darknessAt(2)).toBe(1)
  })

  it('입구 빛(0.4)은 해질녘부터, 간판 글씨(0.6)는 밤부터 켜진다', () => {
    expect(glowShare(0, 0.4)).toBe(0)
    expect(glowShare(0.5, 0.4)).toBeCloseTo(1)
    expect(glowShare(0.5, 0.6)).toBe(0)
    expect(glowShare(1, 0.6)).toBe(1)
  })

  it('⚠️ 입구 빛은 낮에 안 보인다 — 더해서 그리고 발광이 0이다', () => {
    const m = new MeshStandardMaterial({ name: 'M_C_001_PokeCenLight_01', color: 0x000000 })
    m.userData = { add: true, glow: 5.8, emitOn: 0.4 }
    const root = new Group()
    root.add(new Mesh(new BufferGeometry(), m))
    const lights = bdspLights(root)
    lights.update(12)
    expect(m.blending).toBe(AdditiveBlending)
    expect(m.depthWrite).toBe(false)
    expect(m.emissiveIntensity).toBe(0)
    lights.update(21)
    expect(m.emissiveIntensity).toBeCloseTo(5.8)
  })
})
