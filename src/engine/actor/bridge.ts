// 다리 위인가 밑인가 (PARITY §1.16) — `MapObject_DetermineElevatedBridgeStatus`
//
// **같은 칸이 두 층이다.** 자전거로드도 209번도로의 다리도, 위를 걸어 지나갈
// 수도 있고 밑을 지나갈 수도 있다. 칸 하나에 통행 허가도 거동값도 하나뿐인데
// 어떻게 가르는가 — **들어온 길이 가른다.**
//
//   다리 어귀(`BRIDGE_START`)를 밟으면 그때부터 「다리 위」다.
//   다리 칸에서 다리가 아닌 칸으로 내려서면 풀린다.
//
// 그래서 밑에서 다가온 사람은 어귀를 안 밟았으므로 계속 「밑」이고, 같은 칸을
// 지나가도 높이가 안 바뀐다. 원작이 이 한 값(`MAP_OBJ_STATUS_ON_ELEVATED_BRIDGE`)으로
// 자전거 내리기·낚시·자전거로드 강제 이동을 전부 가른다.
//
// ⚠️ **높이는 이 값이 안 정한다.** 층이 겹치는 자리에서 어느 판을 딛는지는
// 지금 높이가 정한다 (`map/height`의 `near`) — 그쪽이 이미 원작과 같다.

/** `TILE_BEHAVIOR_BRIDGE_START` — 다리로 올라서는 어귀 */
export const BRIDGE_START = 0x70
/** `TileBehavior_IsBridge` — 0x71부터 0x7d까지가 다리다 (어귀는 뺀다) */
const BRIDGE_FIRST = 0x71
const BRIDGE_LAST = 0x7d

/** 다리 어귀인가 (`TileBehavior_IsBridgeStart`) */
export function isBridgeStart(behavior: number): boolean {
  return behavior === BRIDGE_START
}

/** 다리 칸인가 (`TileBehavior_IsBridge`). 어귀는 아니다 */
export function isBridge(behavior: number): boolean {
  return behavior >= BRIDGE_FIRST && behavior <= BRIDGE_LAST
}

/**
 * 물 위에 놓인 다리 (`TileBehavior_IsBridgeOverWater`).
 *
 * ⚠️ **이 칸이 물인지 땅인지는 층이 정한다** (`MapObject_IsOnWater`) — 위를
 * 건너면 땅이고 밑을 지나면 물이다. 「다리 밑 통과」가 이 한 줄이다
 */
export function isBridgeOverWater(behavior: number): boolean {
  return behavior === 0x73 || behavior === 0x78 || behavior === 0x7c
}

/** 남북 자전거 다리 (`TileBehavior_IsBikeBridgeNorthSouth`) */
export function isBikeBridgeNorthSouth(behavior: number): boolean {
  return behavior >= 0x76 && behavior <= 0x79
}

/** 동서 자전거 다리 (`TileBehavior_IsBikeBridgeEastWest`) */
export function isBikeBridgeEastWest(behavior: number): boolean {
  return behavior >= 0x7a && behavior <= 0x7d
}

/** 어느 쪽이든 자전거 다리인가 */
export function isBikeBridge(behavior: number): boolean {
  return isBikeBridgeNorthSouth(behavior) || isBikeBridgeEastWest(behavior)
}

/**
 * 한 칸 밟았을 때 「다리 위」 상태가 어떻게 되는가
 * (`MapObject_DetermineElevatedBridgeStatus`).
 *
 * ⚠️ **어귀를 밟아야만 올라선다.** 다리 칸에 옆에서 들어서는 것으로는 안 오른다 —
 * 그게 「밑을 지나간다」의 전부다.
 *
 * ⚠️ **다리 칸에 있는 동안은 안 풀린다.** 어귀를 밟고 다리를 건너는 내내
 * 참이고, 다리가 아닌 칸을 밟는 순간 풀린다
 */
export function onBridgeAfterStep(was: boolean, behavior: number): boolean {
  if (isBridgeStart(behavior)) return true
  if (was && !isBridge(behavior)) return false
  return was
}

/**
 * 주인공이 지금 다리 **위**에 있는가.
 *
 * 원작은 이 값을 지도 객체마다 들고 있는데(`MAP_OBJ_STATUS_ON_ELEVATED_BRIDGE`),
 * 실제로 보는 자리가 전부 주인공이라 여기서는 하나만 둔다 — 자전거로드가
 * `actor/bike`에 하나 두는 것과 같은 자리다
 */
let elevated = false

export function onElevatedBridge(): boolean {
  return elevated
}

/** 밟은 칸의 거동값으로 상태를 굴린다. 이동 시스템이 프레임마다 부른다 */
export function trackBridge(behavior: number): void {
  elevated = onBridgeAfterStep(elevated, behavior)
}

/** 맵을 옮기면 풀린다 — 새 맵의 어귀를 다시 밟아야 한다 */
export function resetBridge(): void {
  elevated = false
}
