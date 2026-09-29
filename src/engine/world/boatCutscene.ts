// 배로 건너가기 (`ScrCmd_PlayBoatCutscene` → `FieldSystem_PlayBoatCutscene` · `cutscenes/boat_cutscene/*.c` · PARITY §1.26)
//
// 원작은 셋을 차례로 한다:
//
//   1 필드   운하시티를 떠날 때(북 → 남)와 선단시티를 떠날 때(서 → 동)만 — 그 자리의 배 소품(`regular_ship` 34 ·
//            `screw_steamship_spiral` 538)을 25칸 · 12칸 민다. 빠르기는 한 틱에 ¼유닛으로 24틱을 간 뒤 1¼유닛이다.
//            카메라는 주인공 자리에서 떨어져 배와 같이 가고(`Camera_TrackTarget`), 처음에 옆으로 2칸(x + 1유닛씩) ·
//            3칸(z + ½유닛씩) 비켜 선다. 운하는 14칸을 가면 다리 둘(`canalave_bridge_left` 31 · `_right` 32)이 한 번 들린다
//            — 다리가 다 들리고 배가 끝까지 가야 다음이다. 소리는 떠날 때 `SEQ_SE_DP_SHIP02`, 다리가 들릴 때 `SHIP03`
//   2 건너기 검게 6단계로 닫고(곡은 6틱에 잦아든다) 배 앱 — 고정 카메라 앞에서 배 모델이 90프레임 한 번 돈다
//            (`canalave_ship.c` · `snowpoint_ship.c`). 6단계로 밝아지며 `SEQ_SE_DP_SHIP01`, 첫 애니가 마지막 프레임에 닿으면
//            6단계로 닫는다
//   3 도착   맵을 갈고(`FieldTask_ChangeMapToLocation`) 맵 곡을 틀고 6단계로 밝힌다
//
// 여기는 1과 2의 차례를 한 틱씩 돈다 — 정수 셈은 원작 그대로 fx32(월드 유닛)다. 3은 워프가 한다(`MapStreamer`).
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)

const FX = 4096
/** 한 칸 = 16유닛 (`MAP_OBJECT_TILE_SIZE`) */
const TILE = 16 * FX

/** `BOAT_TRAVEL_DIR_*` (`constants/boat_cutscene.h`) */
export const BOAT_DIR = { southToNorth: 0, eastToWest: 1, westToEast: 2, northToSouth: 3 } as const

/** 필드에서 미는 배 소품 (`prop_models.naix`의 차례) */
export const SHIP_PROP = { canalave: 34, snowpoint: 538 } as const
export const BRIDGE_PROPS = [31, 32] as const

/** 소리 (`generated/sdat.txt`) */
export const BOAT_SE = { travel: 1756, depart: 1757, bridge: 1758 } as const

/** 필드에서 배를 미는 한 벌 (`BoatCutscene`) */
export interface BoatField {
  dir: number
  /** 0 다리 없이 · 1 다리와 함께 · 2 닫기 시작 (`BOAT_CUTSCENE_STATE_*`) */
  state: number
  speed: number
  speedTick: number
  traveled: number
  goal: number
  /** 다리가 들리는 거리 — 운하만 (없으면 null) · 들리기 시작했는가 */
  bridgeAt: number | null
  bridgeReached: boolean
  /** 카메라가 비켜 선 만큼 (`cameraAdjustment`) */
  pan: number
  /** 배 · 카메라가 처음 자리에서 옮긴 만큼 (x, z · fx32) */
  boat: [number, number]
  camera: [number, number]
}

/** 필드 장면이 있는 방향인가 (`moveBeforeFadeOut`) */
export const movesOnField = (dir: number): boolean => dir === BOAT_DIR.northToSouth || dir === BOAT_DIR.westToEast

/**
 * 필드 장면의 소품 찾기 칸 (`TerrainCollisionHitbox_Init(주인공 x, z, …)`) — 주인공 칸 기준 [x 옮김, z 옮김, 폭, 깊이].
 * 이 네모와 겹치는 배 소품을 민다
 */
export function shipHitbox(dir: number): [number, number, number, number] | null {
  if (dir === BOAT_DIR.northToSouth) return [1, -3, 3, 6]
  if (dir === BOAT_DIR.westToEast) return [-2, 2, 6, 3]
  return null
}

/** 세운다 (`FieldSystem_PlayBoatCutscene`) — 필드 장면이 없으면 곧바로 닫기다 */
export function boatFieldStart(dir: number): BoatField {
  const canalave = dir === BOAT_DIR.northToSouth
  return {
    dir,
    state: !movesOnField(dir) ? 2 : canalave ? 1 : 0,
    speed: FX / 4, speedTick: 0, traveled: 0,
    goal: (canalave ? 25 : 12) * TILE,
    bridgeAt: canalave ? 14 * TILE : null,
    bridgeReached: false, pan: 0,
    boat: [0, 0], camera: [0, 0],
  }
}

/** 이 틱에 밖으로 알릴 것 */
type BoatEvent = 'bridge' | 'fadeOut'

/** `BoatCutscene_PanStartingCamera` */
function pan(b: BoatField): void {
  if (b.dir === BOAT_DIR.northToSouth) {
    if (b.pan < TILE * 2) { b.camera[0] += FX; b.pan += FX }
  } else if (b.dir === BOAT_DIR.westToEast) {
    if (b.pan < TILE * 3) { b.camera[1] += FX / 2; b.pan += FX / 2 }
  }
}

/** `BoatCutscene_MoveBoatToGoal` — 끝까지 갔는가 */
function move(b: BoatField): boolean {
  const axis = b.dir === BOAT_DIR.southToNorth || b.dir === BOAT_DIR.northToSouth ? 1 : 0
  const sign = b.dir === BOAT_DIR.southToNorth || b.dir === BOAT_DIR.westToEast ? 1 : -1
  b.boat[axis]! += sign * b.speed
  b.camera[axis]! += sign * b.speed
  if (b.speed < FX) {
    if (++b.speedTick >= 24) { b.speed += FX; b.speedTick = 0 }
  }
  b.traveled += b.speed
  return b.goal <= b.traveled
}

/**
 * 한 틱 (`FieldSystem_PlayBoatCutsceneStep`의 앞 셋). `bridgeDone`은 다리 둘이 다 들렸는가
 * (`MapPropOneShotAnimationManager_IsAnimationLoopFinished`)
 */
export function boatFieldTick(b: BoatField, bridgeDone: boolean): BoatEvent[] {
  const out: BoatEvent[] = []
  if (b.state === 0) {
    pan(b)
    if (move(b)) b.state = 2
  } else if (b.state === 1) {
    pan(b)
    const goal = move(b)
    if (!b.bridgeReached) {
      // ⚠️ 원작은 인자를 뒤바꿔 넘긴다(`CheckBridgeReached(&bridgeDistance, &distanceTraveled, …)`) — 곧 「간 거리가
      // 14칸 이상이면」이다. 안 뒤바꾸면 첫 틱에 들린다
      if (b.bridgeAt !== null && b.bridgeAt <= b.traveled) { b.bridgeReached = true; out.push('bridge') }
    } else if (bridgeDone && goal) b.state = 2
  }
  if (b.state === 2) { b.state = 3; out.push('fadeOut') }
  return out
}

/** 배 앱이 쓰는 모델 (`narcMemberIndexes[travelDir]` · `data/demo`의 이름) */
export function boatTravelModel(dir: number): string {
  if (dir === BOAT_DIR.southToNorth) return 'shipToCanalave'
  if (dir === BOAT_DIR.northToSouth) return 'shipFromCanalave'
  if (dir === BOAT_DIR.eastToWest) return 'shipToSnowpoint'
  return 'shipFromSnowpoint'
}

/** 배 앱 (`BoatCutscene_*Ship_Main`) — 0 소리 · 1 닫을 때를 기다림 · 2 닫는 중 · 3 끝 */
export interface BoatTravel { state: number, frames: number[], counts: readonly number[] }

export function boatTravelStart(counts: readonly number[]): BoatTravel {
  return { state: 0, frames: counts.map(() => 0), counts }
}

/** 한 틱 — 알릴 것: 'se' · 'fadeOut'. `fadeDone`이 참이면 닫는 페이드가 끝났다 */
export function boatTravelTick(t: BoatTravel, fadeDone: boolean): ('se' | 'fadeOut' | 'done')[] {
  const out: ('se' | 'fadeOut' | 'done')[] = []
  if (t.state === 0) { out.push('se'); t.state = 1 } else if (t.state === 1) {
    if ((t.frames[0] ?? 0) + 1 === (t.counts[0] ?? 0)) { t.state = 2; out.push('fadeOut') }
  } else if (t.state === 2 && fadeDone) { t.state = 3; out.push('done'); return out }
  for (const [i, n] of t.counts.entries()) if (t.frames[i]! + 1 < n) t.frames[i]!++
  return out
}

/** 배로 건너가기가 밀 수 있는 소품인가 */
export const isShipProp = (model: number): boolean => model === SHIP_PROP.canalave || model === SHIP_PROP.snowpoint
