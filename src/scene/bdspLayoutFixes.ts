// BDSP 지역이 원작 칸과 어긋나게 지은 자리를 원작 칸에 맞춘다 (REPAIR §169)
//
// 걷는 칸 · 사람 · 워프는 원작 자료가 쥔다. BDSP가 그 자리를 다르게 지었으면 주인공이 BDSP 바다 위를 걷는다 — 고칠 쪽은 그림이다.
// BDSP 지역의 소품은 인스턴스(`EXT_mesh_gpu_instancing`)라 **인스턴스를 옮기고 더하는 것**만으로 맞춘다. 새 모델은 안 만든다.
//
// 예지호수근처(L03 · area009): BDSP가 고원을 안 지은 자리 — `dsOverBdsp` 머리말.
//
// 파이트에리어(C11 · area014): 원작 부두는 (617~623, 434·435) 두 줄이고(거동 0x71) 서쪽 끝 (617, 434·435)에 말뚝 둘이 선다.
// BDSP는 같은 부두를 **네 칸 동쪽** (621~627)에 짓고 말뚝 `BlockPale` 둘도 (621, 434·435)에 세웠다 — 원작 칸 617~620은 BDSP 바다라
// 주인공과 말뚝이 물 위에 섰다. 부두 판(`M_C_001_Pier_01` 1×2칸) 넷을 618~621에 더하고, 서쪽 끝 판(621)을 617로, `BlockPale` 둘을 네 칸 서쪽으로
// 옮긴다. 그러면 BDSP 말뚝이 원작 말뚝 칸에 서서(`ObjectProps`의 `bakedBollardAt`) 기믹 말뚝을 따로 안 세운다
import { InstancedMesh, Matrix4, Mesh, type Material, type Object3D } from 'three'

/** 인스턴스 하나를 고르는 자리 — 재질 이름과 그 인스턴스의 놓인 자리(월드 x, z) */
interface InstanceAt {
  material: string
  x: number
  z: number
}

interface LayoutFix {
  /** 이 인스턴스를 (x, z)로 옮긴다 */
  move?: { from: InstanceAt, to: readonly [number, number] }
  /** 이 인스턴스를 본떠 이 자리들에 더 세운다 */
  copy?: { from: InstanceAt, to: readonly (readonly [number, number])[] }
  /**
   * 이 재질의 인스턴스 가운데 놓인 자리가 상자(월드 x0 ≤ x < x1 · z0 ≤ z < z1) 안인 것을 **걷는다** (크기 0).
   * 그 자리를 원작 지형이 대신 쥘 때 쓴다 (`dsOverBdsp`)
   */
  hide?: { materials: readonly string[], box: readonly [number, number, number, number] }
}

/** 지역 이름 → 고칠 것 */
export const LAYOUT_FIXES: Readonly<Record<string, readonly LayoutFix[]>> = {
  // 예지호수근처(L03) 고원 — BDSP가 안 지은 자리에 깐 채움 나무를 걷고 원작 지형을 세운다 (`dsOverBdsp` 머리말)
  area009: [
    { hide: { materials: ['M_C_001_Tree_03b', 'M_C_001_TreeSeam_01'], box: [300, 218, 327, 243] } },
  ],
  area014: [
    { copy: { from: { material: 'M_C_001_Pier_01', x: 622, z: 436 }, to: [[618, 436], [619, 436], [620, 436], [621, 436]] } },
    { move: { from: { material: 'M_C_001_Pier_01', x: 621, z: 436 }, to: [617, 436] } },
    { move: { from: { material: 'M_C_001_BlockPale_01', x: 621, z: 435 }, to: [617, 435] } },
    { move: { from: { material: 'M_C_001_BlockPale_01', x: 621, z: 436 }, to: [617, 436] } },
  ],
}

/** 놓인 자리를 이만큼(칸) 안에서 같다고 본다 — 굽는 쪽이 정수 칸에 놓는다 */
const SAME = 0.01

function materialName(o: Mesh): string[] {
  return ((Array.isArray(o.material) ? o.material : [o.material]) as Material[]).map((m) => m.name)
}

/** 그 재질 · 그 자리의 인스턴스를 찾는다 */
function find(root: Object3D, at: InstanceAt): { mesh: InstancedMesh, index: number } | null {
  const m = new Matrix4()
  let hit: { mesh: InstancedMesh, index: number } | null = null
  root.traverse((o) => {
    if (hit !== null || !(o instanceof InstancedMesh) || !materialName(o).includes(at.material)) return
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m)
      if (Math.abs(m.elements[12]! - at.x) < SAME && Math.abs(m.elements[14]! - at.z) < SAME) { hit = { mesh: o, index: i }; return }
    }
  })
  return hit
}

/**
 * 그 지역의 고칠 것을 씬에 건다. 고친 수를 돌려준다 — 못 찾은 것은 안 센다(굽기가 바뀌면 시험이 잡는다).
 * 씬이 제자리(원점)에 놓인 채로, 다른 장치가 씬을 읽기 **전에** 부른다
 */
export function applyLayoutFixes(name: string, root: Object3D): number {
  const fixes = LAYOUT_FIXES[name]
  if (!fixes) return 0
  let done = 0
  const m = new Matrix4()
  for (const fix of fixes) {
    if (fix.hide) {
      const [x0, z0, x1, z1] = fix.hide.box
      const want = fix.hide.materials
      const gone = new Matrix4().makeScale(0, 0, 0)
      root.traverse((o) => {
        if (!(o instanceof InstancedMesh) || !materialName(o).some((n) => want.includes(n))) return
        let touched = false
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m)
          const x = m.elements[12]!, z = m.elements[14]!
          if (x >= x0 && x < x1 && z >= z0 && z < z1) { o.setMatrixAt(i, gone); touched = true; done++ }
        }
        if (touched) { o.instanceMatrix.needsUpdate = true; o.computeBoundingBox(); o.computeBoundingSphere() }
      })
    }
    if (fix.move) {
      const hit = find(root, fix.move.from)
      if (hit === null) continue
      hit.mesh.getMatrixAt(hit.index, m)
      m.elements[12] = fix.move.to[0]
      m.elements[14] = fix.move.to[1]
      hit.mesh.setMatrixAt(hit.index, m)
      hit.mesh.instanceMatrix.needsUpdate = true
      hit.mesh.computeBoundingBox()
      hit.mesh.computeBoundingSphere()
      done++
    }
    if (fix.copy) {
      const hit = find(root, fix.copy.from)
      if (hit === null) continue
      hit.mesh.getMatrixAt(hit.index, m)
      const more = new InstancedMesh(hit.mesh.geometry, hit.mesh.material, fix.copy.to.length)
      more.name = `${hit.mesh.name}+layout`
      more.castShadow = hit.mesh.castShadow
      more.receiveShadow = hit.mesh.receiveShadow
      fix.copy.to.forEach(([x, z], i) => {
        const one = m.clone()
        one.elements[12] = x
        one.elements[14] = z
        more.setMatrixAt(i, one)
      })
      more.position.copy(hit.mesh.position)
      more.quaternion.copy(hit.mesh.quaternion)
      more.scale.copy(hit.mesh.scale)
      more.computeBoundingBox()
      more.computeBoundingSphere()
      hit.mesh.parent?.add(more)
      done++
    }
  }
  return done
}
