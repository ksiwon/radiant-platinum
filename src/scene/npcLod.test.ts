import { describe, expect, it } from 'vitest'
import {
  Bone, BufferAttribute, BufferGeometry, Group, Matrix4, MeshBasicMaterial, PerspectiveCamera, Skeleton,
  SkinnedMesh, Vector3,
} from 'three'
import { LOD_CAPACITY, LodStage, bakePose } from './npcLod'

/** 뼈 둘짜리 팔 — 끝 정점이 둘째 뼈에 반쯤 묶인다 */
function arm(): { root: Group, mesh: SkinnedMesh, elbow: Bone } {
  const root = new Group()
  root.position.set(0.3, 0, -0.2)
  root.rotation.y = 0.4
  const upper = new Bone(), elbow = new Bone()
  upper.position.set(0, 1, 0)
  elbow.position.set(0, 1, 0)
  upper.add(elbow)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 1, 0, 0, 2, 0, 0.2, 2.5, 0.1]), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 1, 0, 0, 0, 1, 0]), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1]), 2))
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0]), 4))
  g.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 0.5, 0.5, 0, 0, 1, 0, 0, 0]), 4))
  g.setIndex([0, 1, 2])
  const mesh = new SkinnedMesh(g, new MeshBasicMaterial())
  root.add(upper, mesh)
  root.updateMatrixWorld(true)
  mesh.bind(new Skeleton([upper, elbow]))
  return { root, mesh, elbow }
}

describe('bakePose', () => {
  it('굳힌 정점이 three의 스키닝(세계 좌표)과 같다', () => {
    const { root, mesh, elbow } = arm()
    elbow.rotation.z = 0.9
    elbow.position.y = 1.2
    const baked = bakePose(root)
    expect(baked).toHaveLength(1)
    const pos = baked[0]!.geometry.getAttribute('position')
    const v = new Vector3()
    for (let i = 0; i < 3; i++) {
      mesh.getVertexPosition(i, v)
      v.applyMatrix4(mesh.matrixWorld)
      expect(pos.getX(i)).toBeCloseTo(v.x, 4)
      expect(pos.getY(i)).toBeCloseTo(v.y, 4)
      expect(pos.getZ(i)).toBeCloseTo(v.z, 4)
    }
  })

  it('자세가 바뀌면 다른 정점이 나오고 uv · 인덱스는 같이 쓴다', () => {
    const { root, mesh, elbow } = arm()
    const a = bakePose(root)[0]!.geometry
    elbow.rotation.z = 1.2
    const b = bakePose(root)[0]!.geometry
    expect(b.getAttribute('position').getX(2)).not.toBeCloseTo(a.getAttribute('position').getX(2), 2)
    expect(b.getAttribute('uv')).toBe(mesh.geometry.getAttribute('uv'))
    expect(b.index).toBe(mesh.geometry.index)
    expect(b.getAttribute('skinIndex')).toBeUndefined()
  })

  it('법선이 단위 길이이고 뼈를 따라 돈다', () => {
    const { root, elbow } = arm()
    elbow.rotation.z = Math.PI / 2
    const n = bakePose(root)[0]!.geometry.getAttribute('normal')
    for (let i = 0; i < 3; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4)
  })

  it('숨긴 조각은 굽지 않는다', () => {
    const { root, mesh } = arm()
    mesh.visible = false
    expect(bakePose(root)).toHaveLength(0)
  })
})

describe('LodStage', () => {
  it('같은 자세의 사람이 한 번에 그려지고, 안 쓴 자세는 안 그린다', () => {
    const { root } = arm()
    const parent = new Group()
    const stage = new LodStage(parent)
    stage.add('t', { poses: [bakePose(root), bakePose(root)], cycle: 1, height: 1.5 })
    const cam = new PerspectiveCamera(60, 1, 0.1, 100)
    cam.updateMatrixWorld(true)
    stage.begin(cam)
    expect(stage.push('t', 0, new Matrix4())).toBe(true)
    expect(stage.push('t', 0, new Matrix4())).toBe(true)
    expect(stage.push('t', 1, new Matrix4())).toBe(true)
    stage.end()
    expect(stage.counts('t')).toEqual([2, 1])
    const meshes = parent.children as unknown as { count: number, visible: boolean }[]
    expect(meshes.map((m) => m.count)).toEqual([2, 1])
    stage.begin(cam)
    stage.end()
    expect(parent.children.every((c) => !c.visible)).toBe(true)
  })

  it('가득 차면 거절하고, 절두체 밖을 가른다', () => {
    const { root } = arm()
    const stage = new LodStage(new Group())
    stage.add('t', { poses: [bakePose(root)], cycle: 0, height: 1.5 })
    const cam = new PerspectiveCamera(60, 1, 0.1, 100)
    cam.position.set(0, 0, 0)
    cam.updateMatrixWorld(true)
    stage.begin(cam)
    expect(stage.inView(0, 0, -10, 1)).toBe(true)
    expect(stage.inView(0, 0, 10, 1)).toBe(false)
    for (let i = 0; i < LOD_CAPACITY; i++) expect(stage.push('t', 0, new Matrix4())).toBe(true)
    expect(stage.push('t', 0, new Matrix4())).toBe(false)
  })
})
