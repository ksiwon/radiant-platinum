// 무대 재질 셋 · 배틀 종류별 물체 (`arenaCascade.ts`)
import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry, Texture } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { battleHides, battleShape, cascadeMaterial, cascadeOf, liveArenaMaterials } from './arenaCascade'

const CASCADE = { color: [0.11, 0.82, 1.5], layer: [0.033, 0.18, 1], layerUv: [1, 1, 0, 0], layerMap: true }

function floor(withMaps: boolean): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ name: 'M_CB_027_Floor_01' })
  m.userData = { cascade: CASCADE }
  if (withMaps) {
    m.map = new Texture()
    m.emissiveMap = new Texture()
    m.aoMap = new Texture()
    m.aoMap.channel = 1
  }
  return m
}

describe('배틀 종류 (`battleShape`)', () => {
  it('편이 서면 태그 · 둘씩이면 더블 · 아니면 싱글', () => {
    expect(battleShape(false, false)).toBe('single')
    expect(battleShape(true, false)).toBe('double')
    expect(battleShape(true, true)).toBe('tag')
  })
})

describe('배틀 종류별 물체 (`battleHides`)', () => {
  // 물 체육관 바닥 덮개 — 싱글 칸 P_001 · E_001, 더블 칸 P_002 · E_002, 태그 칸 P_003 · P_004
  const root = new Group()
  const cover = (name: string, listedIn: string[]): Mesh => {
    const m = new Mesh(new PlaneGeometry())
    m.name = name
    m.userData = { listedIn }
    root.add(m)
    return m
  }
  const p1 = cover('Cover_P_001', ['single'])
  const p2 = cover('Cover_P_002', ['double'])
  const p3 = cover('Cover_P_003', ['tag'])
  const floorMesh = new Mesh(new PlaneGeometry())
  root.add(floorMesh)
  it('적힌 배틀에서만 보인다 — 칸마다 제 배틀의 모양이다', () => {
    battleHides(root, 'single')
    expect([p1.visible, p2.visible, p3.visible]).toEqual([true, false, false])
    battleHides(root, 'double')
    expect([p1.visible, p2.visible, p3.visible]).toEqual([false, true, false])
    battleHides(root, 'tag')
    expect([p1.visible, p2.visible, p3.visible]).toEqual([false, false, true])
  })
  it('목록에 없는 물체는 손대지 않는다', () => {
    floorMesh.visible = true
    battleHides(root, 'single')
    expect(floorMesh.visible).toBe(true)
  })
})

describe('그림 셋 섞기 (`cascadeMaterial`)', () => {
  it('바탕 · 층 · 마스크가 다 있으면 노드 재질로 편다 — 재질 색 · 이름 · 값은 그대로', () => {
    const was = floor(true)
    was.color.setRGB(0.5, 0.6, 0.7)
    const m = cascadeMaterial(was)!
    expect(m).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(m.colorNode).not.toBeNull()
    expect(m.name).toBe(was.name)
    expect(m.color.toArray()).toEqual([0.5, 0.6, 0.7])
    expect(m.map).toBe(was.map)
    expect(cascadeOf(m)).toEqual(CASCADE)
  })
  it('그림이 빠졌으면 갈아 끼우지 않는다 — 굽은 그대로(바탕 그림만)', () => {
    expect(cascadeMaterial(floor(false))).toBeNull()
  })
  it('섞기 값이 없는 재질은 섞기 재질이 아니다', () => {
    expect(cascadeOf(new MeshStandardMaterial())).toBeNull()
  })
})

describe('무대 재질 펴기 (`liveArenaMaterials`)', () => {
  it('같은 재질을 나눠 쓰는 메시는 새 재질도 나눠 쓴다', () => {
    const shared = floor(true)
    const root = new Group()
    const a = new Mesh(new PlaneGeometry(), shared)
    const b = new Mesh(new PlaneGeometry(), shared)
    root.add(a, b)
    liveArenaMaterials(root)
    expect(a.material).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(a.material).toBe(b.material)
  })
  it('발광 세기(`extras.glow`)를 `emissiveIntensity`로 건다 — 들판 체육관 천장 링 5', () => {
    const ring = new MeshStandardMaterial({ name: 'M_CB_027_Facility_04', emissiveMap: new Texture() })
    ring.userData = { glow: 5, emitOn: 0.2 }
    const root = new Group()
    root.add(new Mesh(new PlaneGeometry(), ring))
    liveArenaMaterials(root)
    expect(ring.emissiveIntensity).toBe(5)
  })
})
