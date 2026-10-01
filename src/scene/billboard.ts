// 판때기를 카메라 쪽으로 세우는 자리와, 남는 칸을 감추는 자리 (REPAIR §9)
//
// 판때기를 쓰는 곳이 셋이다 — 사람(`NpcSprites`) · 머리 위 표시(`EmoteMarks`) ·
// 나무열매 밭(`BerryPatchProps`). 셋이 같은 열세 줄을 각자 들고 있었다.
import type { Camera, Object3D } from 'three'

/**
 * **판때기가 카메라를 통째로 본다** (원작 SBC의 `BB`).
 *
 * ⚠️ **좌우로만 돌리면 세로가 내려보는 각만큼 눌린다.** 실내 렌즈가 50.09도라
 * 키가 **cos 50.09 = 64%**로 찌그러졌고, 갤럭시단 집회장에서 조무래기 판때기가
 * 바닥에 누운 것처럼 보였다.
 *
 * ⚠️ **발은 안 뜬다.** 판의 원점이 아래 모서리라 X축 회전이 그 모서리를 축으로
 * 돈다. 도는 차례는 `YXZ`여야 한다 — 좌우를 먼저 돌고 그 자리에서 뒤로 눕는다.
 *
 * ⚠️ **1인칭(`upright`)은 좌우로만 돈다.** 눈이 판의 발보다 한 칸 넘게 높아서,
 * 한 칸 앞에 선 사람을 보면 판이 눈을 향해 **50도쯤 뒤로 눕는다** — 사람이
 * 바닥에 비스듬히 누운 그림이 된다. 1인칭에서 사람은 눈높이에서 보이므로
 * 세워 둔 채 돌리는 편이 맞고, 위의 64%가 눌리는 문제는 내려다보는 3인칭
 * 렌즈의 것이다
 */
export function faceCamera(mesh: Object3D, camera: Camera, upright = false): void {
  const toCamX = camera.position.x - mesh.position.x
  const toCamZ = camera.position.z - mesh.position.z
  const toCamY = camera.position.y - mesh.position.y
  mesh.rotation.set(
    upright ? 0 : -Math.atan2(toCamY, Math.hypot(toCamX, toCamZ)),
    Math.atan2(toCamX, toCamZ), 0, 'YXZ')
}

/**
 * 좌우로만 돈다 (원작 SBC의 `BBY`).
 *
 * 머리 위 표시가 이쪽이다 — 그림이 세로로 눌려도 읽히고, 뒤로 누우면 사람
 * 머리에 겹쳐 보인다
 */
export function faceCameraYaw(mesh: Object3D, camera: Camera): void {
  mesh.rotation.set(0, Math.atan2(
    camera.position.x - mesh.position.x,
    camera.position.z - mesh.position.z,
  ), 0)
}

/** 이번 프레임에 안 쓴 판때기를 감춘다 (판은 버리지 않고 다시 쓴다) */
export function hideRest(slots: readonly { mesh: Object3D }[], used: number): void {
  for (let i = used; i < slots.length; i++) {
    const slot = slots[i]
    if (slot !== undefined) slot.mesh.visible = false
  }
}
