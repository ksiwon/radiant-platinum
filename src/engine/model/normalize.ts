// 모델 정규화 레이어 (PLAN §4.3)
// 소스마다 스케일·원점·단위가 제각각이다 (BDSP 립은 2.51유닛, Pokemon-3D-api는 종마다 다름).
// glb 자체를 손대지 않고 래퍼 노드의 transform만 조정하므로, 원본 씬 그래프와 스킨 바인드가 온전히 남는다.
// 스킨드 메시는 아머처 스케일이 역바인드 행렬과 노드 스케일에 이중으로 실리므로,
// Blender 단계에서 스케일을 만지지 않고 여기서 한 번에 처리한다.
import { Box3, Vector3, type Object3D } from 'three'

/** 빛나의 목표 신장 (게임 단위 = 미터) */
export const PLAYER_HEIGHT = 1.5

/**
 * BDSP 번들 안 주인공(`pc0002_00`)의 키. **잰 값이다.**
 *
 * ⚠️ **`dawn.glb`의 키로는 이 자리를 못 채운다.** 주인공 모델만 `.dae`를 거쳐
 * 왔고(`dawn_to_glb.py`) 나머지 사람은 번들에서 바로 굽는다(`bdspGlb.py`) —
 * 단위가 서로 다르다. three가 재는 바인드 포즈 키가
 *
 *   dawn.glb        2.5095
 *   pc0002_00       1.4725   ← 같은 사람, 번들에서 바로 구운 것
 *   tr0046(신사)    1.7553
 *   tr1006(곤충소년) 1.2646
 *
 * 라, `dawn.glb`의 2.5095를 분모로 쓰면 배수가 0.598이 되어 **신사가 1.05m로
 * 선다.** 1.5m인 주인공보다 작다. 실제로 그렇게 서 있었다.
 *
 * 번들 쪽 숫자는 그대로 사람 키다(꼬맹이 0.98 · 일꾼 1.95). 그래서 여기를
 * 분모로 두면 BDSP 단위 하나가 우리 타일 1.019가 되고, 사람 사이 크기 차이는
 * 원작 그대로 남는다
 */
export const BDSP_PLAYER_HEIGHT = 1.4725

/** BDSP 번들 단위 → 게임 단위. NPC 모델은 이 배수 하나만 곱하면 된다 */
export const BDSP_TO_WORLD = PLAYER_HEIGHT / BDSP_PLAYER_HEIGHT

export interface NormalizeResult {
  /** 적용된 균등 스케일 배수 */
  scale: number
  /** 발밑을 원점에 맞추기 위한 y 오프셋 */
  feetOffset: number
  /** 정규화 전 원본 높이 (게임 단위) */
  nativeHeight: number
}

const box = new Box3()
const size = new Vector3()

/**
 * `model`을 감싼 `wrapper`의 스케일·위치를 조정해 목표 키에 맞추고 발밑을 원점에 정렬한다.
 * 바운딩박스는 렌더 포즈가 아니라 바인드 포즈 기준이므로 애니메이션 중에 호출해도 값이 흔들리지 않는다.
 */
export function normalizeModel(
  wrapper: Object3D,
  model: Object3D,
  targetHeight: number,
): NormalizeResult {
  // 이전 정규화 결과를 지우고 원본 크기를 다시 잰다 (핫리로드·모델 교체 대비)
  wrapper.scale.setScalar(1)
  wrapper.position.set(0, 0, 0)
  wrapper.updateMatrixWorld(true)

  box.setFromObject(model, true)
  box.getSize(size)

  const nativeHeight = size.y
  const scale = nativeHeight > 1e-6 ? targetHeight / nativeHeight : 1

  wrapper.scale.setScalar(scale)
  wrapper.position.y = -box.min.y * scale
  wrapper.updateMatrixWorld(true)

  return { scale, feetOffset: wrapper.position.y, nativeHeight }
}
