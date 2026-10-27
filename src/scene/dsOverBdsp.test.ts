import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, Group, InstancedMesh, BoxGeometry, Matrix4, MeshBasicMaterial } from 'three'
import { clipToBoxes, dsPropsOverBdsp, dsTerrainBoxes, landTouches, spotsInBoxes } from './dsOverBdsp'
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

  it('area012 — 하드마운틴 바깥 상자의 BDSP를 통째로 걷는다: 여럿 놓인 것은 자리로, 하나뿐인 큰 땅은 삼각형으로', () => {
    const root = new Group()
    const grassMat = new MeshBasicMaterial()
    grassMat.name = 'M_C_001_GimGrass_03'
    const grass = new InstancedMesh(new BoxGeometry(1, 1, 1), grassMat, 2)
    grass.setMatrixAt(0, new Matrix4().makeTranslation(750, 11, 240))
    grass.setMatrixAt(1, new Matrix4().makeTranslation(780, 11, 240))
    root.add(grass)
    // 땅 한 장 — 삼각형 둘: 하나는 상자 안(745, 240) · 하나는 상자 밖(745, 260)
    const ground = new BufferGeometry()
    ground.setAttribute('position', new BufferAttribute(new Float32Array([
      745, 11, 240, 746, 11, 240, 745, 11, 241,
      745, 5, 260, 746, 5, 260, 745, 5, 261,
    ]), 3))
    const groundMat = new MeshBasicMaterial()
    groundMat.name = 'M_C_001_Ground_04c'
    const land = new InstancedMesh(ground, groundMat, 1)
    land.setMatrixAt(0, new Matrix4())
    root.add(land)
    expect(applyLayoutFixes('area012', root)).toBe(2)
    const at = new Matrix4()
    grass.getMatrixAt(0, at)
    expect(at.elements[0]).toBe(0)
    grass.getMatrixAt(1, at)
    expect(at.elements[12]).toBe(780)
    expect(land.geometry).not.toBe(ground)
    expect(Array.from(land.geometry.getIndex()!.array)).toEqual([3, 4, 5])
  })

  it('하드마운틴 바깥 — 원작 소품 584 · 585와 상자 안 풀숲 포기만 세운다', () => {
    expect([...dsPropsOverBdsp(0)!]).toEqual([584, 585])
    expect(dsPropsOverBdsp(1)).toBeNull()
    const field = { spots: new Float32Array([750.5, 6, 240.5, 0.5, 310.5, 6, 230.5, 0.5, 750.5, 5, 252.5, 0.5]), colors: [0, 0] as const }
    expect(Array.from(spotsInBoxes(field, dsTerrainBoxes(0)!)!.spots)).toEqual([750.5, 6, 240.5, 0.5])
    expect(spotsInBoxes(null, dsTerrainBoxes(0)!)).toBeNull()
  })
})
