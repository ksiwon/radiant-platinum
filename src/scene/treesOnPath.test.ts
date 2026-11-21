import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, type BufferGeometry } from 'three'
import { hideTreesOnPath, type PathView } from './treesOnPath'

/** 칸 (10, 10)만 걷는 칸 · 높이 0. 다리 칸 (12, 10)은 걷는 칸인데 높이 5 */
const grid: PathView = {
  isBlocked: (tx, tz) => !((tx === 10 || tx === 12) && tz === 10),
  heightAtWorld: (x) => (Math.floor(x) === 12 ? 5 : 0),
}

function forest(
  material: string, at: [number, number, number][], geometry: BufferGeometry = new BoxGeometry(1, 1, 1),
): { root: Group, mesh: InstancedMesh } {
  const root = new Group()
  const m = new MeshBasicMaterial()
  m.name = material
  const mesh = new InstancedMesh(geometry, m, at.length)
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

  /**
   * BDSP 바위 · 나무처럼 원점이 발자국의 **모서리**(x 최소 · z 최대)에 있는 메시. 크기 `n`칸 정사각형이다 —
   * 무쇠탄갱 B2F `Rock_04`가 원점 (16, 9) · 상자 x 16.1~17.9 · z 7.1~9.0이다
   */
  const cornered = (n: number): BufferGeometry => new BoxGeometry(n, 1, n).translate(n / 2, 0.5, -n / 2)

  it('원점이 걷는 칸 가에 걸쳐도 발자국이 막힌 칸이면 남긴다 — 밑동은 상자 가운데다', () => {
    // 원점 (10, 11)의 칸은 막힌 (10, 11)이지만 발자국은 x 10~11 · z 10~11 = 걷는 칸 (10, 10)이다 — 걷는다
    const open = forest('M_C_001_Rock_05', [[10, 0, 11]], cornered(1))
    expect(hideTreesOnPath(open.root, grid)).toBe(1)
    // 원점 (11, 11) — 칸 (11, 11)이 원점의 칸이고, 발자국은 막힌 칸 (11, 10)
    const wall = forest('M_C_001_Rock_05', [[11, 0, 11]], cornered(1))
    expect(hideTreesOnPath(wall.root, { ...grid, isBlocked: (tx, tz) => !(tx === 11 && tz === 11) })).toBe(0)
    expect(scaleOf(wall.mesh, 0)).toBe(1)
  })

  it('2×2 밑동이 걸친 네 칸이 모두 걷는 칸일 때만 걷는다 — 하나라도 막혔으면 그 자리의 장애물이다', () => {
    // 걷는 칸은 x 20~21 · z 20~21의 네 칸, 그리고 (22, 20)
    const room: PathView = {
      isBlocked: (tx, tz) => !((tx === 20 || tx === 21) && (tz === 20 || tz === 21)) && !(tx === 22 && tz === 20),
      heightAtWorld: () => 0,
    }
    // 첫째는 네 칸 위 · 둘째는 x 21~22 · z 20~21 — (22, 21)이 막혔다
    const { root, mesh } = forest('M_C_001_Tree_05', [[20, 0, 22], [21, 0, 22]], cornered(2))
    expect(hideTreesOnPath(root, room)).toBe(1)
    expect(scaleOf(mesh, 0)).toBe(0)
    expect(scaleOf(mesh, 1)).toBe(1)
  })
})
