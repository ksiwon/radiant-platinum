// 지금 밀고 있는 방향
//
// 이동 시스템과 워프 감지가 같은 값을 봐야 한다. 이동 쪽에 두면 `map/world`가
// `actor/player`를 끌어오고, 그쪽은 다시 `map/world`를 끌어와 고리가 된다.
import { worldState } from '../../state/worldState'
import { moveByYaw } from './mouse'

/**
 * 지금 **밀고 있는** 월드 방향. 3인칭은 원작대로 방향키가 월드 축이고,
 * 1인칭은 시선이 기준이라 누른 방향을 yaw만큼 돌린다.
 *
 * ⚠️ 속도로는 이걸 못 안다 — 벽에 부딪히면 그 축의 속도를 0으로 지우기 때문에,
 * **문을 밀고 있는 동안 속도가 0이다.** 문 판정이 속도를 보면 영영 안 열린다
 */
export function pushDirection(): { x: number; z: number } {
  const input = worldState.input
  return worldState.camera.mode === 'first'
    ? moveByYaw(input.move.x, input.move.y, worldState.camera.yaw)
    : { x: input.move.x, z: input.move.y }
}
