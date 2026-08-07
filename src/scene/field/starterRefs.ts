// 파트너 고르는 화면(UI)과 무대(3D) 사이의 얇은 다리.
//
// `sceneRefs`·`stageRefs`와 같은 역할이다. 화면은 React 상태로 단계를 굴리고
// 무대는 매 프레임 도는데, 그 사이를 상태로 이으면 프레임마다 다시 그리게 된다.
export const starterScene = {
  /** 가방이 열렸는가. 원작은 `psel_all` 마지막 프레임에서 갈린다 */
  opened: false,
  /** 카메라가 어느 자리인가 */
  camera: 'open' as 'open' | 'choose',
  /** `camera`가 `choose`로 바뀐 뒤 지난 시간(ms). 6프레임에 걸쳐 옮겨 간다 */
  cameraSince: 0,
  /** 커서가 떠 있는가. 원작은 글 두 줄을 다 찍은 뒤에 켠다 */
  cursorShown: false,
  /** 고른 자리 (0=왼쪽) */
  pick: 0,
}

/** 화면을 열 때마다 처음으로 되돌린다 — 두 번째 새 게임에서 이어지면 안 된다 */
export function resetStarterScene(): void {
  starterScene.opened = false
  starterScene.camera = 'open'
  starterScene.cameraSince = 0
  starterScene.cursorShown = false
  starterScene.pick = 0
}
