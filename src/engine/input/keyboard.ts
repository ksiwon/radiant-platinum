// 입력 — 키 상태를 `worldState`에 합성하는 층 (PLAN §6.4).
//
// 키가 눌렸는지 자체는 `keys.ts`가 들고 있다. 나눈 이유는 §10.4 예산이다 —
// 이 모듈은 `worldState`를 통해 three를 값으로 끌어오므로 **타이틀 화면 쪽에서는
// 절대 잡으면 안 된다.** 그쪽이 필요한 것은 `setUiCapture` 하나뿐이고 그것은
// `keys.ts`에 있다.
import { worldState } from '../../state/worldState'
import { BINDINGS, held, isGameActive, isUiCaptured } from './keys'

export { attachKeyboard, setGameActive, setUiCapture, isUiCaptured } from './keys'

/** 매 fixedUpdate 직전에 호출 — 키 상태를 InputState로 합성 */
export const inputSystem = {
  fixedUpdate() {
    // ⚠️ **복원 중에는 키가 주인공까지 가면 안 된다.** 저장한 자리가 아직 안
    // 선 동안 걸으면, 갈아 끼우는 순간 **엉뚱한 데서 걷던 걸음**이 저장한 자리로
    // 옮겨진다 (`state/worldState`의 `restoring`이 까닭을 적는다)
    if (!isGameActive() || isUiCaptured() || worldState.restoring) {
      worldState.input.move.set(0, 0)
      worldState.input.run = false
      worldState.input.interact = false
      worldState.input.cancel = false
      return
    }
    const x = (held(BINDINGS.right) ? 1 : 0) - (held(BINDINGS.left) ? 1 : 0)
    const y = (held(BINDINGS.down) ? 1 : 0) - (held(BINDINGS.up) ? 1 : 0)
    worldState.input.move.set(x, y)
    if (worldState.input.move.lengthSq() > 1) worldState.input.move.normalize()
    worldState.input.run = held(BINDINGS.run)
    worldState.input.interact = held(BINDINGS.interact)
    worldState.input.cancel = held(BINDINGS.cancel)
  },
}
