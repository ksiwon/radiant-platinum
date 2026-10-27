// 원작에서 걷는 칸에 선 BDSP 나무 · 바위를 걷는다
//
// 걷는 칸은 원작 통행표가 쥔다. BDSP가 숲 · 바위를 원작과 다른 자리에 심었으면 주인공이 나무 몸통을 뚫고 지나간다 — 고칠 쪽은 그림이다
// (`bdspLayoutFixes`와 같은 원칙). 2026-10-27 점검(`.audit/holes-20261027/dun-509b.png`): 대습초원 입구(맵 509 · `d06r0206`)에서
// 원작 길 칸 (75, 111)에 선 주인공이 BDSP `Tree_05` 몸통 안에 반쯤 묻혔다. 정적 점검으로 몸통 밑동이 원작 걷는 칸에 선 나무 · 바위가
// 지역 쪽 109그루(파이트에리어 37 · 예지호수근처 39 · 리조트에리어 11 …) · 던전 쪽 대습초원 · 상호교류광장에서 나왔다.
//
// 고르는 법: 인스턴스 자리(모델 원점이 밑동 한가운데다)가 든 칸이 원작에서 막히지 않았고, 그 칸의 원작 높이가 밑동 높이와 1.5칸 안이면
// 걷는다(크기 0). 높이를 보는 것은 다리 밑 · 절벽 위처럼 칸은 열렸어도 다른 층에 선 나무를 남기기 위해서다
import { InstancedMesh, Matrix4, Vector3, type Material, type Object3D } from 'three'

/** 걸을 수 있는가 · 그 칸의 원작 높이 — `MapGrid`가 이것을 갖는다 */
export interface PathView {
  isBlocked(tx: number, tz: number): boolean
  heightAtWorld(x: number, z: number, near?: number): number | null
}

/** 나무 · 바위 재질 — `M_C_001_Tree_05` · `M_C_001_Rock_04` 꼴 */
const TREE_OR_ROCK = /_(Tree|Rock)_\d/

/** 밑동과 원작 높이가 이만큼(칸) 안이면 같은 층으로 본다 */
const SAME_FLOOR = 1.5

/**
 * 씬 안의 나무 · 바위 인스턴스 가운데 원작 걷는 칸에 선 것을 걷는다. 걷은 수를 돌려준다.
 * 씬이 **놓일 자리에 놓인 뒤** 부른다 — 월드 좌표로 칸을 고른다
 */
export function hideTreesOnPath(root: Object3D, grid: PathView): number {
  root.updateMatrixWorld(true)
  const m = new Matrix4()
  const p = new Vector3()
  const gone = new Matrix4().makeScale(0, 0, 0)
  let hidden = 0
  root.traverse((o) => {
    if (!(o instanceof InstancedMesh)) return
    const names = ((Array.isArray(o.material) ? o.material : [o.material]) as Material[]).map((x) => x.name)
    if (!names.some((n) => TREE_OR_ROCK.test(n))) return
    let touched = false
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m)
      if (m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0) continue
      p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld)
      const tx = Math.floor(p.x)
      const tz = Math.floor(p.z)
      if (grid.isBlocked(tx, tz)) continue
      const floor = grid.heightAtWorld(tx + 0.5, tz + 0.5, p.y)
      if (floor === null || Math.abs(floor - p.y) > SAME_FLOOR) continue
      o.setMatrixAt(i, gone)
      touched = true
      hidden++
    }
    if (touched) { o.instanceMatrix.needsUpdate = true; o.computeBoundingBox(); o.computeBoundingSphere() }
  })
  return hidden
}
