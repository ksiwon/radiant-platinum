// 비전머신 장애물 (DATA.md §2.3)
//
// 베는 나무·깨는 바위·미는 바위는 지형이 아니라 **맵 객체**다. 원작
// `FieldMoves_SetUsableMoves`가 앞에 선 객체의 그림 번호로 어느 기술인지 가른다:
//
//   OBJ_EVENT_GFX_STRENGTH_BOULDER 84   괴력으로 민다
//   OBJ_EVENT_GFX_ROCK_SMASH       85   바위깨기로 깬다
//   OBJ_EVENT_GFX_CUT_TREE         86   거합베기로 벤다
//
// 번호는 `generated/object_events_gfx.txt`의 줄 번호다 — 우리 배치 자료에
// 84가 50개 · 85가 591개 · 86이 49개 들어 있다.
//
// ⚠️ **이것들이 길을 막아야 한다.** 안 막으면 통과해서 지나가 버리고, 그러면
// 비전머신이 여는 문이 처음부터 다 열려 있는 것이 된다.
import { npcActors, type NpcActor } from './npcs'

/** 그림 번호 → 어느 기술로 치우는가 */
export const OBSTACLE_MOVE: Readonly<Record<number, 'strength' | 'rockSmash' | 'cut'>> = {
  84: 'strength',
  85: 'rockSmash',
  86: 'cut',
}

/** `OBJ_EVENT_GFX_STRENGTH_BOULDER`. 유일하게 **치우는 게 아니라 미는** 장애물이다 */
export const STRENGTH_BOULDER = 84

export function isObstacle(sprite: number): boolean {
  return sprite in OBSTACLE_MOVE
}

/**
 * 그 칸을 막고 선 장애물.
 *
 * 사람은 여기서 안 본다. 원작은 사람도 막지만, 우리는 스크립트가 사람을 아직
 * 다 못 옮겨서 문 앞에 선 사람 하나가 건물을 통째로 잠글 수 있다 — 장애물만
 * 막는 것은 **덜 하는 것**이지 틀린 것이 아니다
 */
/**
 * 괴력으로 바위를 한 칸 민다.
 *
 * 원작은 괴력을 쓰는 것과 미는 것이 따로다 — 기술은 **허락만** 하고, 실제로
 * 미는 것은 걸어가서 하는 일이다(`MOVEMENT_ACTION_PUSH_*`). 그래서 이 함수는
 * 이동 시스템이 부른다.
 *
 * 갈 자리가 막혔거나 다른 장애물이 있으면 안 민다 — 원작도 그 자리에서 멈춘다
 */
export function pushBoulder(
  grid: { isBlockedAtWorld(x: number, z: number): boolean },
  boulder: NpcActor,
  step: { x: number; z: number },
): boolean {
  const tx = Math.round(boulder.x) + step.x
  const tz = Math.round(boulder.z) + step.z
  if (grid.isBlockedAtWorld(tx + 0.5, tz + 0.5)) return false
  if (obstacleAt(tx, tz) !== null) return false
  boulder.x = tx
  boulder.z = tz
  return true
}

export function obstacleAt(tx: number, tz: number): NpcActor | null {
  for (const actor of npcActors.list) {
    if (!actor.visible) continue
    if (!isObstacle(actor.gfx)) continue
    if (Math.round(actor.x) === tx && Math.round(actor.z) === tz) return actor
  }
  return null
}
