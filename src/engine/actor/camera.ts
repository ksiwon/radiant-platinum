// 추적 카메라 (PLAN §6.2 필드 프리셋) — 3인칭과 1인칭.
//
// 조작은 두 시점이 같다. 원작처럼 방향키가 **월드 축**을 가리키고 캐릭터가
// 그쪽을 본다. 1인칭은 그 시선 위에 눈을 얹은 것뿐이라 이동 코드가 안 갈린다 —
// 마우스로 도는 카메라를 붙이면 격자 이동과 어긋나서 문 하나를 못 들어간다.
//
// 두 시점 다 크리티컬 댐프드로 따라간다. 즉시 붙이면 계단에서 화면이 튄다.
import { Vector3 } from 'three'
import { worldState } from '../../state/worldState'

const THIRD = { distance: 8, height: 4, damping: 5 }

/**
 * 1인칭 눈높이(미터).
 *
 * 모델을 1.5m로 정규화해 두었고(`PlayerModel.PLAYER_HEIGHT`) 눈은 정수리에서
 * 한 뼘쯤 아래다. 머리 위에서 내려다보면 문틀이 눈에 안 들어온다
 */
const EYE_HEIGHT = 1.38
/** 눈이 앞으로 나온 만큼. 0이면 제 뒤통수 안쪽에서 보게 된다 */
const EYE_FORWARD = 0.12
/** 1인칭이 더 빨리 붙는다 — 시선이 곧 머리라 늦게 따라오면 멀미가 난다 */
const FIRST_DAMPING = 12
/** 시선이 닿는 거리. 목표점을 너무 가까이 두면 고개가 파르르 떨린다 */
const LOOK_AHEAD = 6

const goal = new Vector3()
const look = new Vector3()

export const cameraSystem = {
  update(delta: number) {
    const cam = worldState.camera
    const p = worldState.player.position
    const first = cam.mode === 'first'

    if (first) {
      // 모델 전방이 +Z고 facing = atan2(vx, vz)다. 같은 규약으로 앞을 만든다
      const fx = Math.sin(worldState.player.facing)
      const fz = Math.cos(worldState.player.facing)
      goal.set(p.x + fx * EYE_FORWARD, p.y + EYE_HEIGHT, p.z + fz * EYE_FORWARD)
      look.set(p.x + fx * LOOK_AHEAD, p.y + EYE_HEIGHT, p.z + fz * LOOK_AHEAD)
    } else {
      goal.set(p.x, p.y + THIRD.height, p.z + THIRD.distance)
      look.copy(p)
    }

    const t = 1 - Math.exp(-(first ? FIRST_DAMPING : THIRD.damping) * delta)
    cam.position.lerp(goal, t)
    cam.target.lerp(look, t)
  },
}
