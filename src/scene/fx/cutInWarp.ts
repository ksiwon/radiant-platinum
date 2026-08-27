// 조우 컷인이 화면 그림 자체를 미는 자리 (`engine/battle/encounterCutIn`)
//
// 컷인 셋 중 둘이 **화면을 밀어서** 만들어진다:
//
//   풀숲  가로 조각을 홀짝으로 반대로 민다 (`ScreenSliceEffect_HBlankCallback`)
//   물    주사선마다 사인만큼 민다 (`ScreenShakeEffect_Start`)
//
// 원작은 주사선마다 BG 오프셋을 갈아 끼우고 창으로 잘라 내는데, 우리 화면은
// 3D 한 장이라 **후처리에서 UV를 미는 것**이 같은 일이다. 밀려 나가 빈 자리는
// 원작이 창 밖으로 잘라 검게 두므로 여기서도 검게 둔다.
//
// ⚠️ **덜 도는 동안에는 항등이어야 한다.** 컷인은 한 판에 서른여덟 프레임만
// 도는 연출인데 이 노드는 **모든 프레임**에 든다 — 값이 0일 때 UV가 조금이라도
// 움직이면 게임 내내 화면이 미세하게 흔들린다. 그래서 조각도 물결도 0을
// 곱해서 끄고, 자르는 값도 0일 때 1이 되게 둔다.
//
// ⚠️ **후처리가 없는 길에서는 이 연출이 안 보인다** (`post.ts`의 두 단계 물러남).
// 그때도 번쩍임·조리개·카메라는 그대로 도므로 전환 자체는 성립한다.
import { float, floor, mod, PI2, sin, step, uniform, uv, vec2 } from 'three/tsl'
import { cutInFrame } from '../../engine/battle/encounterCutIn'

/** 0으로 나누는 것을 막는 아주 작은 수. 띠 높이가 0일 때만 쓰인다 */
const TINY = 1e-6

/**
 * 미는 UV(`uv`)와 자르는 값(`inside`), 그리고 프레임마다 부를 `sync`를 낸다.
 *
 * ⚠️ **돌려주는 것에 타입을 세우지 않는다.** TSL은 연산마다 다른 구체 노드
 * 타입을 내서(`vec2()`와 `.mul()`의 결과가 다른 클래스다) 인터페이스로 못 박으면
 * 식을 조금만 고쳐도 타입이 안 맞는다. 쓰는 쪽은 `.sample(…)`·`.mul(…)`만 부른다.
 *
 * 조각의 부호는 **띠 번호의 홀짝**이다 — 원작이 `(vCount / pixelsPerSlice) % 2`로
 * 가르는 그 줄이다. 짝수 띠가 +, 홀수 띠가 −로 밀린다
 */
export function cutInWarp() {
  const band = uniform(0)
  const offset = uniform(0)
  const amplitude = uniform(0)
  const cycles = uniform(0)

  const base = uv()
  // 띠 번호의 홀짝 → +1 / −1. 띠 높이가 0이면 번호가 터지므로 아래끝을 둔다.
  // 그때는 `offset`도 0이라 곱해서 0이 된다
  const parity = floor(base.y.div(band.max(float(TINY))))
  const sign = mod(parity, float(2)).mul(float(-2)).add(float(1))
  const slice = offset.mul(sign)
  const ripple = amplitude.mul(sin(base.y.mul(cycles).mul(float(PI2))))
  const x = base.x.add(slice).add(ripple)

  return {
    uv: vec2(x, base.y),
    // 0~1 밖이면 0이다. `step`이 경계에서 1을 내므로 값이 0일 때 항등이다
    inside: step(float(0), x).mul(step(x, float(1))),
    sync() {
      const at = cutInFrame.now
      band.value = at?.slice?.band ?? 0
      offset.value = at?.slice?.offset ?? 0
      amplitude.value = at?.ripple?.amplitude ?? 0
      cycles.value = at?.ripple?.cycles ?? 0
    },
  }
}
