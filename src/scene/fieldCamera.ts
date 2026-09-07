// 필드 카메라 **하나**. `Stage`가 `<Canvas camera={…}>`에 그대로 넘긴다.
//
// ⚠️ **왜 우리가 쥐는가.** R3F에게 맡기면 첫 화면이 통째로 안 나온다.
// R3F 9의 `configure`는 카메라를 `new PerspectiveCamera(75, 0, …)` — **aspect 0**
// 으로 만들고, 올바른 값은 나중에 스토어 구독이 크기 변화를 보고 `updateCamera()`로
// 넣는다. 그런데 `configure`는 맨 위에서 `store.getState()`를 **한 번 떠서** 그
// 사본의 `state.camera`를 본다. 우리 `gl` 팩토리는 비동기라 그것을 기다리는 동안
// `configure`가 한 번 더 들어오고, **그 사본에도 카메라가 아직 없다.**
//
// 실측(2026-09-07, `tools/e2e/_appshape41.mjs`의 `real` 변형 — 제품을 안 바꾸고
// 카메라만 들여다본다):
//
//     27214ms  configure가 카메라 85438d19를 만든다          aspect 0
//     27215ms  구독의 updateCamera가 **그것을** 고친다        aspect 1.5
//     27215ms  configure가 **둘째** 카메라 e40f26cc를 만든다  aspect 0
//     27236ms  three가 그리는 것은 e40f26cc다                 aspect 0
//
// 둘째가 스토어에 앉는 순간 크기는 이미 최종값이라 구독이 다시 안 울리고,
// `updateCamera`가 **영영 안 닿는다.** aspect가 0이면 `updateProjectionMatrix`의
// `width = height * aspect`가 0이 되어 `2·near/(right−left)`가 무한대가 되고,
// 모든 정점의 clip **x**가 무한대·NaN이 된다 — 드로우는 나가는데 래스터에 한
// 픽셀도 안 남는다. 창을 한 번 흔들면 그때 구독이 울려 고쳐지고, 그때부터
// 계속 정상이다. 이것이 §41에서 「크기가 한 번 바뀌기 전까지 안 나오던」 것이다.
//
// 카메라 **객체**를 주면 `configure`는 그것을 스토어에 넣기만 한다 — 두 번
// 들어와도 같은 객체다. 게다가 aspect가 처음부터 1이라 **퇴화한 투영이 아예
// 만들어질 수 없다** (REPAIR §41).
import { PerspectiveCamera } from 'three'
import { FIELD_FOV } from '../engine/actor/camera'

/**
 * 필드 카메라 하나를 만든다.
 *
 * ⚠️ **aspect를 0으로 두지 않는다.** 크기를 아직 모르는 순간에도 투영은
 * 유한해야 한다 — 실제 비율은 R3F가 창을 재서 넣어 준다
 */
export function makeFieldCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(FIELD_FOV, 1, 0.1, 200)
  camera.position.set(0, 6, 9)
  return camera
}

/** 이 앱의 필드 카메라. **세대가 올라도 같은 것을 쓴다** */
export const fieldCamera = makeFieldCamera()
