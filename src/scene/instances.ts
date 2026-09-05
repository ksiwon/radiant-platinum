// 인스턴스 메시의 개수를 세우는 한 자리.
//
// ⚠️ **개수가 0이면 물체를 숨겨야 한다.** 안 숨기면 three가 그 메시를 렌더
// 목록에 넣고 백엔드가 **아무것도 안 그리는 드로우콜**을 한 번 친다.
//
// WebGL2에서는 조용해서 오래 안 보였다. WebGPU로 재기 시작하자마자 Dawn이
// 프레임마다 경고를 냈다 — 「Calling [RenderPassEncoder].Draw with an index
// count of 0 is unusual」. 실측(2026-09-05, 떡잎마을)으로 바위가 하나도 안 보이는
// 프레임에서 빈 드로우가 둘 났다.
//
// ⚠️ **경고만의 문제가 아니다.** 절두체로 걸러 내는 갈래(바위·나무)는 카메라가
// 도는 동안 0과 N을 오간다. 0인 프레임마다 파이프라인 상태를 세우고 버리는
// 값이 그대로 든다 — 맵에 그 갈래가 아예 없으면 **한 프레임도 빠짐없이** 그렇다.
import type { InstancedMesh } from 'three'

/**
 * `mesh.count`를 세우고, 0이면 숨긴다.
 *
 * @param mesh 인스턴스 메시
 * @param n 이번 프레임에 실제로 그릴 개수
 * @param touch 행렬을 고쳤으면 `instanceMatrix.needsUpdate`를 세운다.
 *   0개일 때는 올릴 것이 없으므로 건너뛴다 (버스를 헛돌리지 않는다)
 */
export function setInstances(mesh: InstancedMesh, n: number, touch = true): void {
  mesh.count = n
  mesh.visible = n > 0
  if (n > 0 && touch) mesh.instanceMatrix.needsUpdate = true
}
