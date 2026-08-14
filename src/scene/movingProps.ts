// 장치가 움직이는 소품 (PARITY §7.12)
//
// 청크는 소품을 **배치 기록대로** 한 번 세우고 끝이다. 그런데 장치가 있는
// 맵에서는 소품이 움직인다 — 승강판이 올라가고, 물가시티의 물바닥이 오르내리고,
// 선단시티의 톱니가 돌고, 영원시티의 시곗바늘이 돈다.
//
// 꿀 나무도 같은 자리에 있다 (PARITY §6.6) — 여섯 시간이 지난 나무가 흔들린다.
//
// 그 소품들만 여기로 모은다. 규칙은 둘이다:
//
//   ① 배치 기록에 있으면 **청크가 안 그린다** (`isFeaturePlacement`)
//   ② 배치 기록에 없어도 여기서 세운다 — 원작이 손으로 싣는 자리가 셋 있다
//      (강철섬 B2F 승강판 · 물가시티 물바닥 · 연고시티 DP 승강판)
//
// 배치 기록의 y는 「처음 자리」 하나뿐이라, 여기로 안 옮기면 판이 올라가도
// 그림이 그 자리에 남는다.
import { platformLiftProp } from './platformLift'
import { pastoriaWaterProp } from './pastoriaGym'
import { sunyshoreProps } from './sunyshoreGym'
import { eternaProps } from './eternaGym'
import { canalaveProps } from './canalaveGym'
import { veilstoneProps } from './veilstoneGym'
import { honeyTreeProp } from './honeyTree'

/** 지금 움직이고 있는 소품 하나 */
export interface FeatureProp {
  /** React 열쇠. 장치마다 고정 문자열이면 된다 — 한 맵에 하나씩이다 */
  key: string
  /** 모델 번호. `from`이 어느 아카이브의 번호인지 정한다 */
  model: number
  /**
   * 어느 아카이브에서 오는가.
   *
   * `prop`은 맵 소품(`res/field/props/models`의 차례)이고, `fldeff`는
   * `/data/mmodel/fldeff.narc`다 — 장막시티 체육관의 샌드백·타이어가 그쪽이라
   * 원작도 소품이 아니라 따로 그리는 렌더러를 쓴다
   */
  from?: 'prop' | 'fldeff'
  x: number
  y: number
  z: number
  /** y축 회전(라디안). 바닥에 누운 톱니가 이쪽으로 돈다 */
  rotY?: number
  /** x축 회전(라디안). 벽에 붙은 톱니만 쓴다 */
  rotX?: number
  /** z축 회전(라디안). 밑동을 축으로 흔들리는 꿀 나무만 쓴다 */
  rotZ?: number
}

/**
 * 지금 세워야 할 것들. 프레임마다 부른다 — 값이 바뀌는 것이 곧 움직이는 것이다.
 *
 * 장치는 한 번에 하나만 사니까 대개 목록이 비었거나 하나다
 */
export function featureProps(): FeatureProp[] {
  const out: FeatureProp[] = []
  const lift = platformLiftProp()
  if (lift !== null) out.push({ key: '승강판', ...lift })
  const water = pastoriaWaterProp()
  if (water !== null) out.push({ key: '물바닥', ...water })
  out.push(...sunyshoreProps())
  out.push(...eternaProps())
  out.push(...canalaveProps())
  out.push(...veilstoneProps())
  // ⚠️ **꿀 나무는 흔들리지 않을 때도 여기서 세운다.** 청크는 소품 목록을
  // 들어설 때 한 번 만들고 끝이라, 배틀이 끝나 흔들림이 멎는 순간 목록에서
  // 빠지면 나무가 통째로 사라진다 — 스물한 맵에서는 늘 이쪽이 그린다
  const honey = honeyTreeProp()
  if (honey !== null) out.push({ key: '꿀나무', ...honey })
  return out
}

/**
 * 그 배치 기록을 장치가 가져갔는가.
 *
 * 청크가 소품 목록을 만들 때 묻는다. 참이면 청크는 안 그리고 `FeatureProps`가
 * 지금 자리에 세운다
 */
export function isFeaturePlacement(model: number, x: number, z: number): boolean {
  return featureProps().some(
    (p) => (p.from ?? 'prop') === 'prop' && p.model === model && p.x === x && p.z === z)
}
