import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three'
import { applyLayoutFixes, LAYOUT_FIXES } from './bdspLayoutFixes'

/** area014의 부두 셋을 굽힌 그대로 흉내 낸다 — 판 다섯(622~626) · 서쪽 끝 판(621) · 말뚝 둘(621, 435·436) */
function fightArea(): Group {
  const root = new Group()
  const put = (material: string, at: [number, number][]): InstancedMesh => {
    const m = new MeshBasicMaterial()
    m.name = material
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), m, at.length)
    at.forEach(([x, z], i) => { mesh.setMatrixAt(i, new Matrix4().makeTranslation(x, 1, z)) })
    root.add(mesh)
    return mesh
  }
  put('M_C_001_Pier_01', [[622, 436], [625, 436], [623, 436], [626, 436], [624, 436]])
  put('M_C_001_Pier_01', [[628, 434], [621, 436]])
  put('M_C_001_BlockPale_01', [[621, 435], [621, 436]])
  return root
}

function placed(root: Group, material: string): string[] {
  const out: string[] = []
  const m = new Matrix4()
  root.traverse((o) => {
    if (!(o instanceof InstancedMesh) || (o.material as MeshBasicMaterial).name !== material) return
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); out.push(`${String(m.elements[12])},${String(m.elements[14])}`) }
  })
  return out.sort()
}

describe('BDSP 지역을 원작 칸에 맞춘다', () => {
  it('파이트에리어 — 부두가 원작 칸 617~623을 덮고, 말뚝이 원작 말뚝 칸(617)에 선다', () => {
    const root = fightArea()
    expect(applyLayoutFixes('area014', root)).toBe(LAYOUT_FIXES.area014!.length)
    const pier = placed(root, 'M_C_001_Pier_01')
    for (let x = 617; x <= 626; x++) expect(pier).toContain(`${String(x)},436`)
    expect(placed(root, 'M_C_001_BlockPale_01')).toEqual(['617,435', '617,436'])
  })

  it('고칠 것이 없는 지역은 그대로 둔다', () => {
    const root = fightArea()
    expect(applyLayoutFixes('area001', root)).toBe(0)
    expect(placed(root, 'M_C_001_BlockPale_01')).toEqual(['621,435', '621,436'])
  })

  it('못 찾은 인스턴스는 안 센다 — 굽기가 바뀌면 여기서 드러난다', () => {
    const root = new Group()
    expect(applyLayoutFixes('area014', root)).toBe(0)
  })
})
