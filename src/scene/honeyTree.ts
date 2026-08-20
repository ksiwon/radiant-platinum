// 흔들리는 꿀 나무 (PARITY §6.6) — `DoTreeShakingAnimation`
//
// 여섯 시간이 지난 나무는 **말을 걸기 전부터 흔들리고 있다.** 그 흔들림이
// 무엇이 붙었는지의 유일한 힌트라(무리가 좋을수록 크게 흔든다) 화면에서
// 빠지면 규칙의 절반이 안 보인다.
//
// ⚠️ **원작의 애니를 그대로 못 튼다.** 원작은 소품 모델에 딸린 nsbca 세 벌 중
// 하나를 렌더 오브젝트에 얹는다(`MapPropAnimationManager_AddAnimationToRenderObj`).
// 우리 소품 파이프라인은 정지 메시만 굽는다 — 그래서 **세기만** 옮기고
// (`shakeAnimation`이 주는 0·1·2), 흔드는 모양은 우리가 만든다. 값 셋은
// 아래 `SWAY`에 적어 두었고 그것이 우리 것이라는 표시다.
//
// ⚠️ **안 흔들릴 때도 우리가 그린다.** 청크는 소품을 들어설 때 한 번 세우고
// 끝이라, 배틀이 끝나 목록에서 빠지면 나무가 사라진다 (`movingProps` 머리말)
import { propPlacement } from '../engine/map/propPlacement'
import { world as mapWorld } from '../engine/map/world'
import {
  honeyTreeOf, HONEY_TREE_MODEL, honeyTreeStatus, shakeAnimation, TREE_STATUS,
} from '../engine/world/honeyTree'
import { useSaveStore } from '../state/saveStore'

/**
 * 세기별 흔들림. **우리 값이다** — 원작 대응물이 nsbca라 옮길 수가 없다.
 *
 * 번호가 곧 세기라(0 작게 · 1 · 2 크게) 폭과 빠르기가 같이 오른다
 */
const SWAY: readonly { angle: number, speed: number }[] = [
  { angle: 0.022, speed: 5.5 },
  { angle: 0.045, speed: 7.0 },
  { angle: 0.075, speed: 8.5 },
]

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
  rotZ: number
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
  const shakes = tree === undefined ? 0 : shakeAnimation(tree.shakes)
  const ripe = tree !== undefined && honeyTreeStatus(tree) === TREE_STATUS.encounter
  const sway = ripe && shakes !== null && honeyShake.stopped !== at ? SWAY[shakes] : undefined

  return {
    model: HONEY_TREE_MODEL,
    x: placed.x, y: placed.y, z: placed.z,
    rotZ: sway === undefined
      ? 0
      : Math.sin(performance.now() / 1000 * sway.speed) * sway.angle,
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
