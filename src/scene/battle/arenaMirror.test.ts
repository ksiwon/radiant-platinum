// 무대 거울 바닥 (`arenaMirror.ts`)
import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry, Texture } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { isMirrorFloor, liveMirrors, MIRROR_FLOORS } from './arenaMirror'

function arena(name: string): { root: Group, floor: Mesh, wall: Mesh } {
  const root = new Group()
  const geo = new PlaneGeometry(10, 10).rotateX(-Math.PI / 2)
  const floor = new Mesh(geo, new MeshStandardMaterial({ name, map: new Texture() }))
  const wall = new Mesh(new PlaneGeometry(10, 4), new MeshStandardMaterial({ name: 'M_CB_038_Wall_01' }))
  root.add(floor, wall)
  return { root, floor, wall }
}

describe('무대 거울 바닥', () => {
  it('원작이 거울을 켠 재질 33개다', () => {
    expect(MIRROR_FLOORS.size).toBe(33)
    expect(isMirrorFloor(new MeshStandardMaterial({ name: 'M_CB_027_Floor_01' }))).toBe(true)
    expect(isMirrorFloor(new MeshStandardMaterial({ name: 'M_CB_027_Wall_01' }))).toBe(false)
  })

  it('거울 바닥만 노드 재질로 바꾸고 거울 자리를 무대에 단다 — 벽은 그대로', () => {
    const { root, floor, wall } = arena('M_B_038_Floor_23')
    const wallWas = wall.material
    expect(liveMirrors(root)).toBe(1)
    expect(floor.material).toBeInstanceOf(MeshStandardNodeMaterial)
    expect((floor.material as MeshStandardNodeMaterial).colorNode).not.toBeNull()
    expect(wall.material).toBe(wallWas)
    // 거울 자리(`reflector`의 target)가 무대 아래에 하나 붙는다
    expect(root.children.length).toBe(3)
  })

  it('같은 무대 파일의 두 번째 배틀 — 재질과 거울은 그대로 쓰고 거울 자리를 새 무대로 옮긴다', () => {
    const first = arena('M_CB_027_Floor_01')
    const shared = first.floor.material
    liveMirrors(first.root)
    const mirrored = first.floor.material
    const second = new Group()
    const again = new Mesh(new PlaneGeometry(10, 10).rotateX(-Math.PI / 2), shared)
    second.add(again)
    expect(liveMirrors(second)).toBe(1)
    expect(again.material).toBe(mirrored)
    expect(second.children.length).toBe(2)
    expect(first.root.children.length).toBe(2)
  })
})
