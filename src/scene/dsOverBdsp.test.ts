import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, Group, InstancedMesh, BoxGeometry, Matrix4, MeshBasicMaterial } from 'three'
import { clipToBoxes, dsTerrainBoxes, landTouches } from './dsOverBdsp'
import { applyLayoutFixes } from './bdspLayoutFixes'

/** 삼각형 셋 — 상자 안 높은 것(고원) · 상자 안 낮은 것(BDSP 땅 높이) · 상자 밖 높은 것 */
function land(): BufferGeometry {
  const g = new BufferGeometry()
  const tri = (x: number, z: number, y: number): number[] => [x, y, z, x + 1, y, z, x, y, z + 1]
  // 청크 원점 (288, 224) 기준 — 월드 (305, 230) · (306, 231) · (290, 226)
  g.setAttribute('position', new BufferAttribute(new Float32Array([...tri(17, 6, 6), ...tri(18, 7, 2), ...tri(2, 2, 6)]), 3))
  g.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8])
  return g
}

describe('BDSP가 안 지은 원작 지형을 세운다', () => {
  it('예지호수근처 고원 — 상자 안 · BDSP 땅보다 높은 삼각형만 남는다', () => {
    const boxes = dsTerrainBoxes(0)!
    const clipped = clipToBoxes(land(), 288, 224, boxes)!
    expect(clipped.getIndex()!.count).toBe(3)
    expect(Array.from(clipped.getIndex()!.array)).toEqual([0, 1, 2])
  })

  it('원본 기하의 버퍼를 같이 쓰지 않는다 — 버려도 원본 지형이 안 비는다', () => {
    const g = land()
    const clipped = clipToBoxes(g, 288, 224, dsTerrainBoxes(0)!)!
    expect(clipped.getAttribute('position')).not.toBe(g.getAttribute('position'))
  })

  it('남는 것이 없으면 null · 다른 행렬은 상자가 없다', () => {
    expect(clipToBoxes(land(), 0, 0, dsTerrainBoxes(0)!)).toBeNull()
    expect(dsTerrainBoxes(1)).toBeNull()
  })

  it('상자에 걸치는 청크만 고른다', () => {
    const boxes = dsTerrainBoxes(0)!
    expect(landTouches(288, 224, boxes)).toBe(true)
    expect(landTouches(320, 192, boxes)).toBe(true)
    expect(landTouches(256, 224, boxes)).toBe(false)
    expect(landTouches(288, 256, boxes)).toBe(false)
  })

  it('area009 — 상자 안 채움 나무만 걷는다', () => {
    const root = new Group()
    const m = new MeshBasicMaterial()
    m.name = 'M_C_001_Tree_03b'
    const trees = new InstancedMesh(new BoxGeometry(1, 1, 1), m, 2)
    trees.setMatrixAt(0, new Matrix4().makeTranslation(312, 2, 233))
    trees.setMatrixAt(1, new Matrix4().makeTranslation(330, 2, 233))
    root.add(trees)
    expect(applyLayoutFixes('area009', root)).toBe(1)
    const at = new Matrix4()
    trees.getMatrixAt(0, at)
    expect(at.elements[0]).toBe(0)
    trees.getMatrixAt(1, at)
    expect(at.elements[12]).toBe(330)
  })
})
