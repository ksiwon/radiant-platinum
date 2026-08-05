// 추적 카메라 (PLAN §6.2 필드 프리셋) — 3인칭과 1인칭.
//
// **조작이 갈린다.** 3인칭은 원작 그대로다: 카메라가 북쪽에 고정이고 방향키가
// 월드 축을 가리킨다. 1인칭은 마우스가 시선을 돌리고 그 시선이 이동의 기준이 된다
// (`input/mouse`, `actor/player`).
//
// 처음에는 1인칭도 월드 축으로 뒀었다. 격자와 어긋나 문을 못 들어갈까 봐였는데,
// 이동이 격자 고정이 아니라 연속이고 충돌을 축별로 보기 때문에 근거 없는 걱정이었다.
// 서쪽을 보면서 W를 눌렀는데 옆으로 걷는 쪽이 훨씬 나쁘다.
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
      // 시선은 마우스가 정한다. yaw 0이 북쪽(−Z)이고 오른쪽으로 돌면 커진다
      const flat = Math.cos(cam.pitch)
      const fx = Math.sin(cam.yaw) * flat
      const fz = -Math.cos(cam.yaw) * flat
      const fy = Math.sin(cam.pitch)
      // 눈은 수평으로만 앞으로 내민다. 위아래까지 따라가면 고개를 들 때 눈이
      // 뒤통수 밖으로 나가 제 모자가 화면에 걸린다
      goal.set(p.x + Math.sin(cam.yaw) * EYE_FORWARD, p.y + EYE_HEIGHT,
        p.z - Math.cos(cam.yaw) * EYE_FORWARD)
      look.set(goal.x + fx * LOOK_AHEAD, goal.y + fy * LOOK_AHEAD, goal.z + fz * LOOK_AHEAD)
    } else {
      goal.set(p.x, p.y + THIRD.height, p.z + THIRD.distance)
      look.copy(p)
    }

    const t = 1 - Math.exp(-(first ? FIRST_DAMPING : THIRD.damping) * delta)
    cam.position.lerp(goal, t)
    cam.target.lerp(look, t)
  },
}
