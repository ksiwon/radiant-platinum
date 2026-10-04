// 흔들리는 꿀 나무 (PARITY §6.6) — `DoTreeShakingAnimation`
//
// 여섯 시간이 지난 나무는 **말을 걸기 전부터 흔들리고 있다.** 그 흔들림이
// 무엇이 붙었는지의 유일한 힌트라(무리가 좋을수록 크게 흔든다) 화면에서
// 빠지면 규칙의 절반이 안 보인다.
//
// **나무는 BDSP 꿀나무다** (`gimmick/obj0003_00` SweetTree · `engine/world/gimmicks`). 뼈 넷(`Root/Tree01/Tree02/Tree03`)에
// 클립 넷이 실려 있고, 원작(DS)이 소품 모델에 딸린 nsbca 세 벌 중 하나를 얹듯(`MapPropAnimationManager_AddAnimationToRenderObj`)
// 흔들림 세 단계(`shakeAnimation`의 0 · 1 · 2)에 `Move01` · `Move02` · `Move03`을 잇는다 — 셋의 흔들림 폭이 그 차례로 커진다
// (`HONEY_TREE_CLIPS` 머리말의 실측). 안 흔들릴 때는 쉼 자세 `Wait`이다.
//
// ⚠️ **자리는 원작 소품 자리에서 반 칸씩 옮긴다.** 원작 소품 자리(배치 기록)는 막힌 2×2칸의 한가운데(칸 모서리)다 — 스물한 맵에서
// 막힌 칸이 (x−1…x, z−1…z)다(`.audit/probe/gimmickHoney.mts`). BDSP 꿀나무는 줄기가 제 원점에서 (+0.5, +0.5)에 선다(줄기 밑동
// 정점 평균 0.49 · 0.51). 그래서 (−0.5, −0.5)를 옮겨 줄기를 2×2칸 한가운데에 세운다.
//
// 기믹 그룹이 없는 옛 설치본은 원작 소품(26번)이 흔들림 없이 선다.
//
// ⚠️ **안 흔들릴 때도 우리가 그린다.** 청크는 소품을 들어설 때 한 번 세우고
// 끝이라, 배틀이 끝나 목록에서 빠지면 나무가 사라진다 (`movingProps` 머리말)
import { propPlacement } from '../engine/map/propPlacement'
import { world as mapWorld } from '../engine/map/world'
import {
  honeyTreeOf, HONEY_TREE_MODEL, honeyTreeStatus, shakeAnimation, TREE_STATUS,
} from '../engine/world/honeyTree'
import { GIMMICK_MODELS, honeyTreeClip } from '../engine/world/gimmicks'
import { useSaveStore } from '../state/saveStore'

/** BDSP 꿀나무 원점 → 원작 소품 자리 (머리말) */
export const HONEY_TREE_SHIFT: readonly [number, number, number] = [-0.5, 0, -0.5]

/** 배틀이 끝나면 스크립트가 여기로 멈추라고 한다 (`HoneyTree_StopShaking`) */
export const honeyShake = {
  /** 지금 멈춰 둔 그루. 다른 나무로 가면 풀린다 */
  stopped: -1,
  stop(treeId: number): void { honeyShake.stopped = treeId },
}

interface HoneyTreeProp {
  model: number
  x: number
  y: number
  z: number
  /** BDSP 꿀나무와 틀 클립 (`FeatureProps`가 세운다) */
  gimmick: { name: string, clip: string, shift: readonly [number, number, number] }
}

/**
 * 지금 맵의 꿀 나무. 나무가 없는 맵이면 null.
 *
 * 흔들리는 조건은 원작과 같다 — 여섯 시간이 지났고(`TREE_STATUS_ENCOUNTER`)
 * 흔들림이 한 번 이상이다. 0번(아무것도 안 붙음)은 서 있기만 한다
 */
export function honeyTreeProp(): HoneyTreeProp | null {
  const at = honeyTreeOf(mapWorld.mapId)
  if (at < 0) return null
  const placed = honeyTreePlacement(mapWorld.mapId)
  if (placed === null) return null

  const tree = useSaveStore.getState().honeyTrees.trees[at]
  const shakes = tree === undefined ? null : shakeAnimation(tree.shakes)
  const ripe = tree !== undefined && honeyTreeStatus(tree) === TREE_STATUS.encounter
  const shake = ripe && honeyShake.stopped !== at ? shakes : null

  return {
    model: HONEY_TREE_MODEL,
    x: placed.x, y: placed.y, z: placed.z,
    gimmick: { name: GIMMICK_MODELS.honeyTree, clip: honeyTreeClip(shake), shift: HONEY_TREE_SHIFT },
  }
}

/**
 * 배치 기록에서 그 나무를 찾는다.
 *
 * 고르는 규칙은 `map/propPlacement`에 있다 — 신오 행렬 하나가 스무 그루를 같이
 * 담고 있는 것과, 제 행렬을 쓰는 맵의 표식이 −1인 것을 둘 다 봐야 한다.
 *
 * 맵마다 한 그루뿐이라 그 안에서는 모델 번호로 충분하다 — 스물한 맵을 다
 * 세어 봤고 두 그루인 곳이 없다 (`honeyTree.test.ts`)
 */
function honeyTreePlacement(mapId: number): { x: number, y: number, z: number } | null {
  const grid = mapWorld.grid
  if (grid === null) return null
  return propPlacement(grid.meta, mapId, HONEY_TREE_MODEL)
}

/** 맵을 옮기면 멈춤 표시가 풀린다 — 다음 나무는 다시 흔들려야 한다 */
export function resetHoneyShake(): void { honeyShake.stopped = -1 }
