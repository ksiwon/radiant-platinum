// 원작에서 걷는 칸에 선 BDSP 나무 · 바위를 걷는다
//
// 걷는 칸은 원작 통행표가 쥔다. BDSP가 숲 · 바위를 원작과 다른 자리에 심었으면 주인공이 나무 몸통을 뚫고 지나간다 — 고칠 쪽은 그림이다
// (`bdspLayoutFixes`와 같은 원칙). 2026-10-27 점검(`.audit/holes-20261027/dun-509b.png`): 대습초원 입구(맵 509 · `d06r0206`)에서
// 원작 길 칸 (75, 111)에 선 주인공이 BDSP `Tree_05` 몸통 안에 반쯤 묻혔다.
//
// 고르는 법: 밑동 자리 네 점(아래 `TRUNK`)이 든 칸이 **모두** 원작에서 막히지 않았고, 그 칸들의 원작 높이가 밑동 높이와 1.5칸 안이면
// 걷는다(크기 0). 높이를 보는 것은 다리 밑 · 절벽 위처럼 칸은 열렸어도 다른 층에 선 나무를 남기기 위해서다.
//
// ⚠️ **밑동은 인스턴스 원점이 아니라 상자의 가운데다.** BDSP 나무 · 바위 메시는 원점이 발자국의 **모서리**(x 최소 · z 최대)에 있다 —
// 실측(2026-11-21 · 무쇠탄갱 B2F `d01r0102`): `Rock_04` 원점 (16, 9) · 상자 x 16.1~17.9 · z 7.1~9.0, `Rock_05` 원점 (17, 13) ·
// 상자 x 17~17.9 · z 12.1~12.9. 원점의 칸은 그 바위 **남쪽 옆 칸**이라, 원점으로 고르면 걷는 길 가에 선 나무 · 바위가 통째로 걷혔다 —
// 전 지역 · 전 던전에서 3,140개를 걷었고 그중 2,802개는 발자국이 전부 원작의 **막힌 칸** 위였다(201번도로 일대 `area001` 388그루 ·
// 영원의 숲 41 · 무쇠탄갱 B2F 18). 그 칸들은 막힌 채로 아무것도 안 그려져 「안 보이는 벽」이 됐다. 가운데로 고르면 지역 쪽이
// 87개다(같은 날 `.audit/tmp/auditTrees2.txt` — 원래 점검이 센 109와 차이 나는 것은 아래 「모두」 조건이 뺀 것이다).
//
// ⚠️ **넷이 모두 걷는 칸이어야 한다.** 2×2 나무는 가운데가 칸 모서리에 떨어져 밑동이 네 칸에 걸친다. 그중 하나라도 원작에서 막힌
// 칸이면 그 나무는 그 자리의 진짜 장애물이다 — 걷으면 그 막힌 칸이 다시 안 보이는 벽이 되고, 남기면 길 쪽 가장자리가 밑동에
// 조금 겹칠 뿐이다. 앞쪽이 나쁘다(읽히는 쪽이 이긴다). 그렇게 남는 것이 74개다(가운데 한 점만 볼 때 464 → 넷 다 볼 때 390)
import { Box3, InstancedMesh, Matrix4, Vector3, type Material, type Object3D } from 'three'

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
 * 밑동 자리 — 상자 가운데에서 이만큼(칸) 떨어진 네 점.
 *
 * 1×1 바위는 가운데가 칸 한가운데라 넷이 한 칸에 들고, 2×2 나무 · 바위는 가운데가 칸 모서리라 넷이 네 칸에 하나씩 든다
 */
const TRUNK: readonly (readonly [number, number])[] = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]

/**
 * 씬 안의 나무 · 바위 인스턴스 가운데 원작 걷는 칸에 선 것을 걷는다. 걷은 수를 돌려준다.
 * 씬이 **놓일 자리에 놓인 뒤** 부른다 — 월드 좌표로 칸을 고른다
 */
export function hideTreesOnPath(root: Object3D, grid: PathView): number {
  root.updateMatrixWorld(true)
  const m = new Matrix4()
  const base = new Vector3()
  const mid = new Vector3()
  const box = new Box3()
  const gone = new Matrix4().makeScale(0, 0, 0)
  let hidden = 0
  root.traverse((o) => {
    if (!(o instanceof InstancedMesh)) return
    const names = ((Array.isArray(o.material) ? o.material : [o.material]) as Material[]).map((x) => x.name)
    if (!names.some((n) => TREE_OR_ROCK.test(n))) return
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    const local = o.geometry.boundingBox
    if (!local) return
    let touched = false
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m)
      if (m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0) continue
      m.premultiply(o.matrixWorld)
      // 높이는 원점(밑동 바닥)으로, 칸은 상자 가운데로 본다
      base.setFromMatrixPosition(m)
      box.copy(local).applyMatrix4(m).getCenter(mid)
      const onPath = TRUNK.every(([dx, dz]) => {
        const tx = Math.floor(mid.x + dx)
        const tz = Math.floor(mid.z + dz)
        if (grid.isBlocked(tx, tz)) return false
        const floor = grid.heightAtWorld(tx + 0.5, tz + 0.5, base.y)
        return floor !== null && Math.abs(floor - base.y) <= SAME_FLOOR
      })
      if (!onPath) continue
      o.setMatrixAt(i, gone)
      touched = true
      hidden++
    }
    if (touched) { o.instanceMatrix.needsUpdate = true; o.computeBoundingBox(); o.computeBoundingSphere() }
  })
  return hidden
}
