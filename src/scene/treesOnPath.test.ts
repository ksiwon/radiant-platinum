import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three'
import { hideTreesOnPath, type PathView } from './treesOnPath'

/** 칸 (10, 10)만 걷는 칸 · 높이 0. 다리 칸 (12, 10)은 걷는 칸인데 높이 5 */
const grid: PathView = {
  isBlocked: (tx, tz) => !((tx === 10 || tx === 12) && tz === 10),
  heightAtWorld: (x) => (Math.floor(x) === 12 ? 5 : 0),
}

function forest(material: string, at: [number, number, number][]): { root: Group, mesh: InstancedMesh } {
  const root = new Group()
  const m = new MeshBasicMaterial()
  m.name = material
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), m, at.length)
  at.forEach(([x, y, z], i) => { mesh.setMatrixAt(i, new Matrix4().makeTranslation(x, y, z)) })
  root.add(mesh)
  return { root, mesh }
}

const scaleOf = (mesh: InstancedMesh, i: number): number => {
  const m = new Matrix4()
  mesh.getMatrixAt(i, m)
  return m.elements[0]!
}

describe('원작 걷는 칸에 선 BDSP 나무 · 바위를 걷는다', () => {
  it('밑동이 걷는 칸 · 같은 층이면 걷고, 막힌 칸 · 다른 층은 남긴다', () => {
    const { root, mesh } = forest('M_C_001_Tree_05', [[10.5, 0, 10.5], [11.5, 0, 10.5], [12.5, 0, 10.5]])
    expect(hideTreesOnPath(root, grid)).toBe(1)
    expect(scaleOf(mesh, 0)).toBe(0)
    expect(scaleOf(mesh, 1)).toBe(1)
    // 다리 칸(높이 5) 밑 땅(0)에 선 나무
    expect(scaleOf(mesh, 2)).toBe(1)
  })

  it('나무 · 바위가 아닌 재질은 안 본다', () => {
    const { root, mesh } = forest('M_C_001_Pier_01', [[10.5, 0, 10.5]])
    expect(hideTreesOnPath(root, grid)).toBe(0)
    expect(scaleOf(mesh, 0)).toBe(1)
  })

  it('놓인 자리(씬 위치)를 더해 칸을 고른다 — 던전은 원점을 옮긴 뒤 부른다', () => {
    const { root, mesh } = forest('M_C_001_Rock_04', [[0.5, 0, 0.5]])
    root.position.set(10, 0, 10)
    expect(hideTreesOnPath(root, grid)).toBe(1)
    expect(scaleOf(mesh, 0)).toBe(0)
  })
})
