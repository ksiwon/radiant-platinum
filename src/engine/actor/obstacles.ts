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
import { distortionBridge } from '../world/distortion'
import { activeZone } from '../map/zone'
import { worldState } from '../../state/worldState'
import { isBridgeOverWater, onElevatedBridge } from './bridge'
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
  // 깨어진 세계의 바위는 옮기는 것이 아니라 **떨어뜨리는** 것이다 (PARITY §6.10).
  // 떨어지는 자리면 여기서 끝난다 — 막혔는지도 안 본다
  if (distortionBridge.dropBoulder?.(boulder, step) === true) return true
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

// ── 사람과 물체가 막는다 (`sub_02063F00`) ────────────────────────────────────
//
// 원작은 **모든** 맵 객체가 길을 막는다 — 자기 자신이 아니고, 서 있고
// (`MAP_OBJ_STATUS_0`), 숨지 않았으면(`MAP_OBJ_STATUS_18`) 전부다. 위의
// `obstacleAt`은 그중 비전기술로 치우는 셋만 봤다.
//
// ⚠️ **안 막으면 이야기 순서가 깨진다.** 210번도로의 골덕 넷(gfx 74, 숨김 플래그
// 432)이 통과되어 **비밀의약 없이 신수마을로 걸어 올라갔다.** 선단 체육관의
// 눈덩이 열아홉(gfx 118)도 안 막아서 미끄러져도 설 자리가 없었다 — 그
// 눈덩이의 스크립트 2037은 원작에서도 `End` 한 줄뿐이라 **미는 물체가 아니라
// 그냥 벽**이다. 그 벽이 곧 퍼즐인 이유는 `actor/ice`에 있다 (PARITY §1.29).
//
// ⚠️ **판정 모양은 원작에서 그대로 못 베낀다.** 원작은 칸에 잠긴 이동이라
// 「그 칸이냐」 한 줄이면 되지만 우리는 3D 자유 이동이라, 사람을 칸 전체로
// 막으면 옆을 스쳐 지날 때 걸린다. 그래서 사람은 원기둥이고 고정물만 칸 전체다.

/** 사람이 차지하는 반지름(타일) */
const PERSON_RADIUS = 0.4

/**
 * 주인공 상자의 대각 반지름 (`actor/player`의 `RADIUS` 0.3 × √2).
 *
 * 주인공은 점이 아니라 **네 귀퉁이**로 판정하므로, 몸 가운데가 아직 밖에 있어도
 * 귀퉁이가 이만큼 먼저 들어간다. 「이미 겹쳐 서 있다」를 잴 때 이 몫을 더해
 * **막히기 시작하는 거리보다 늘 넓게** 잡는다 — 좁으면 갇힌다
 */
const PLAYER_REACH = 0.45

/**
 * 이만큼 벌어지면 다른 층이다.
 *
 * 원작이 `|Δy| < 2`로 본다. 원작의 y는 층 번호고 우리 y는 **월드 높이**라
 * 단위가 다르지만, 겹치는 층 사이가 그보다 훨씬 벌어져 있어서 같은 수로 갈린다
 */
const FLOOR_GAP = 2

/**
 * 사람이 아니라 **물건**인 그림 번호 — 칸 전체를 막는다.
 *
 * 원작의 렌더러 표(`ov5_021FAF40.c`)에서 사람 렌더러(`Unk_ov5_021FAFD8`)가 아닌
 * 것 중, 배치표에 실제로 서 있는 것들이다. 갈래 넷이 그대로 옮겨져 있다 —
 * `Unk_ov5_021FB0A0`(바위·나무·볼·환풍구·문·벽화) · `Unk_ov5_021FB000`(간판
 * 여섯·책·사천왕 방문·로토무 방 벽) · `Unk_ov5_021FB050`(눈덩이) ·
 * `BerryPatchRenderer`(나무열매 밭).
 *
 * ⚠️ **주인공과 큰 전설은 여기 없다.** 그쪽도 사람 렌더러가 아니지만 배치로
 * 서는 물건이 아니거나(주인공) 움직이는 것(호수 삼신·디아루가·아르세우스)이라,
 * 원기둥 쪽이 맞는다
 */
const PROP_GFX: ReadonlySet<number> = new Set([
  84, 85, 86, 87, // 괴력바위 · 깰바위 · 벨나무 · 떨어진 볼
  91, 92, 93, 94, 95, 96, // 지도간판 · 우편함 · 게시판 · 화살표 · 체육관 · 트레이너팁
  100, // 나무열매 밭
  118, // 눈덩이
  174, 182, 183, 184, // 가방 · 환풍구 · 책 · 레지기가스 석상
  202, 203, 209, // 갤럭시단 문 · 벽화 · 사천왕 방문
  248, 249, 250, 251, 262, // 단원 넷·셋 · 벽화 조각 둘 · 로토무 방 벽
])

/**
 * 그 점을 이 객체가 덮는가. `grow`만큼 넓혀서 잰다.
 *
 * 고정물은 칸 전체(중심에서 ±0.5)고 사람은 반지름 `PERSON_RADIUS`짜리 원이다.
 * 좌표는 칸 번호라 몸 가운데가 +0.5에 있다
 */
function covers(actor: NpcActor, cx: number, cz: number, grow: number): boolean {
  const dx = cx - (actor.x + 0.5)
  const dz = cz - (actor.z + 0.5)
  if (PROP_GFX.has(actor.gfx)) {
    return Math.abs(dx) < 0.5 + grow && Math.abs(dz) < 0.5 + grow
  }
  return Math.hypot(dx, dz) < PERSON_RADIUS + grow
}

/**
 * 그 자리를 막고 선 사람·물체 (`sub_02063F00`).
 *
 * @param cx 재려는 자리 (월드 타일 좌표)
 * @param cz 같음
 * @param y  주인공이 선 높이. 다른 층 사람은 안 막는다
 */
export function solidNpcAt(cx: number, cz: number, y: number): NpcActor | null {
  const grid = activeZone.grid
  const p = worldState.player.position
  for (const actor of npcActors.list) {
    // 숨은 사람은 없는 것이다 (`MAP_OBJ_STATUS_18`) — `HideObject`로 숨긴 사람과
    // 숨김 플래그가 서 있는 사람이 여기로 온다
    if (!actor.visible) continue
    if (!covers(actor, cx, cz, 0)) continue
    // ⚠️ **이미 겹쳐 서 있으면 안 막는다.** 동행은 주인공이 **방금 떠난 칸**으로
    // 걸어 들어오는데(`actor/ambient`의 `stepFollow`) 그 칸이 아직 주인공 몸에
    // 걸쳐 있다. 이 줄이 없으면 그 순간 사방이 다 막혀 **못 움직인다** —
    // 스크립트가 사람을 주인공 위로 걸어 보내는 자리도 같다
    if (covers(actor, p.x, p.z, PLAYER_REACH)) continue
    if (grid !== null) {
      // ⚠️ **다리 밑을 지날 때는 다리 위의 사람이 안 막는다** (PARITY §1.16).
      // 사람은 늘 다리 **위**로 친다 (`actor/ambient`의 `terrainBlocks`)
      if (isBridgeOverWater(grid.behaviorAtWorld(actor.x + 0.5, actor.z + 0.5))
        && !onElevatedBridge()) continue
      // 깨어진 세계처럼 층이 겹치는 자리 — 발밑이 멀면 다른 층이다
      const ground = grid.heightAtWorld(actor.x + 0.5, actor.z + 0.5, y)
      if (ground !== null && Math.abs(ground - y) >= FLOOR_GAP) continue
    }
    return actor
  }
  return null
}
