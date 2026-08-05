// 배틀 무대와 엔진 사이의 얇은 다리 (sceneRefs와 같은 역할).
//
// 카메라는 매 프레임 `EngineDriver`가 한 군데서 쓴다. 배틀 무대가 자기 useFrame에서
// 카메라를 옮기면 그 뒤에 도는 EngineDriver가 오버월드 값으로 도로 덮어쓴다 —
// R3F는 priority 오름차순으로 콜백을 돌리고 EngineDriver가 1이기 때문이다.
// 그래서 "지금 카메라를 누가 갖는가"를 여기 두고 EngineDriver가 물어본다.
import { Vector3 } from 'three'

export const battleStage = {
  /** 배틀 무대가 카메라를 가져갔는가 */
  active: false,
  position: new Vector3(),
  target: new Vector3(),
}

/**
 * 배틀 무대가 서는 자리. 오버월드에서 **멀리 떨어뜨린다.**
 *
 * 둘 다 씬에 올라간 채로 두고 카메라만 옮기는 방식이라, 가까이 두면 배틀 뒤로
 * 신오의 지형이 비친다. 신오는 y=0 평면이므로 아래로 크게 내리면 겹칠 일이 없다
 */
export const STAGE_ORIGIN = new Vector3(0, -500, 0)
