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

  it('⚠️ 검은 더하기 판은 발광이 0인 동안 안 그린다 — 낮 들판시티 잔디 위 연한 판 (정반사 F0가 더해졌다)', () => {
    const m = new MeshStandardMaterial({ name: 'M_C_001_PokeCenLight_01', color: 0x000000 })
    m.userData = { add: true, glow: 5.8, emitOn: 0.4 }
    const root = new Group()
    root.add(new Mesh(new BufferGeometry(), m))
    const lights = bdspLights(root)
    // 첫 `update` 전에도 낮 판이 서지 않는다
    expect(m.visible).toBe(false)
    lights.update(12)
    expect(m.visible).toBe(false)
    lights.update(21)
    expect(m.visible).toBe(true)
    lights.update(9)
    expect(m.visible).toBe(false)
  })

  it('발광 없는 검은 더하기 판(`OutLight`)은 늘 안 그리고, 바탕이 있는 더하기 판(`WindowTrans`)은 늘 그린다', () => {
    const out = new MeshStandardMaterial({ name: 'M_C_001_OutLight_01', color: 0x000000 })
    out.userData = { add: true }
    const glass = new MeshStandardMaterial({ name: 'M_C_001_WindowTrans_01', color: 0x40fff8 })
    glass.userData = { add: true }
    const root = new Group()
    root.add(new Mesh(new BufferGeometry(), out), new Mesh(new BufferGeometry(), glass))
    const lights = bdspLights(root)
    for (const hour of [12, 18, 21]) {
      lights.update(hour)
      expect(out.visible, String(hour)).toBe(false)
      expect(glass.visible, String(hour)).toBe(true)
    }
  })
})
