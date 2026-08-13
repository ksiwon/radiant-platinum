// 되돌림동굴 (PARITY §6.10) — `ScrCmd_InitTurnbackCave`
//
// 길이 없는 동굴이다. 방마다 문이 넷 있는데 **들어온 문 말고는 전부 같은
// 곳으로 이어진다** — 어느 쪽으로 나가든 다음 방이 하나로 정해져 있고, 그
// 방을 굴려서 고른다. 기둥을 셋 다 보면 그때부터 기라티나 방이 나온다.
//
// ⚠️ **방을 서른 개 돌면 입구로 뱉어낸다.** 기둥을 못 찾으면 처음부터다.

/** 방마다의 문 수. 들어온 문 하나를 빼고 셋을 고쳐 쓴다 */
export const TURNBACK_WARP_COUNT = 4

/** 기둥 하나마다 딸린 방 수 (`pillarRooms`가 여섯씩 세 뭉치다) */
export const ROOMS_PER_PILLAR = 6

/** 여기까지 돌면 입구로 돌아간다 */
export const MAX_ROOMS_VISITED = 30

/** 기둥을 이만큼 보면 기라티나가 있는 방이 열린다 */
export const PILLARS_FOR_GIRATINA = 3

/** `MAP_HEADER_TURNBACK_CAVE_*` (`generated/map_headers.txt`의 줄 −1) */
export const TURNBACK_MAP = {
  entrance: 268,
  pillarRoom: 269,
  giratinaRoom: 270,
} as const

/**
 * 기둥 방 열여덟 (`pillarRooms`).
 *
 * ⚠️ **표가 두 토막이다.** 앞의 셋(기둥 1의 방 1~3)만 269~271 자리에 있고,
 * 나머지 열다섯은 맵 표의 **한참 뒤**(518~532)에 따로 붙어 있다. 줄 번호가
 * 이어질 것으로 보고 세면 넷째 방부터 통째로 딴 데를 가리킨다
 */
export const PILLAR_ROOMS: readonly number[] = [
  271, 272, 273, 518, 519, 520,
  521, 522, 523, 524, 525, 526,
  527, 528, 529, 530, 531, 532,
]

/**
 * 다음 방 (`ScrCmd_InitTurnbackCave`).
 *
 * 차례가 원작 그대로다 — 기둥 셋이 먼저고, 그다음이 서른 방, 마지막이 굴리기
 */
export function turnbackDestination(
  pillarsSeen: number, roomsVisited: number, rng: () => number,
): number {
  if (pillarsSeen >= PILLARS_FOR_GIRATINA) return TURNBACK_MAP.giratinaRoom
  if (roomsVisited >= MAX_ROOMS_VISITED) return TURNBACK_MAP.entrance
  const at = Math.floor(rng() * ROOMS_PER_PILLAR) + pillarsSeen * ROOMS_PER_PILLAR
  return PILLAR_ROOMS[at] ?? TURNBACK_MAP.entrance
}

/**
 * 들어온 문이 몇 번인가. **서 있는 칸으로 역산한다.**
 *
 * 원작이 그렇다 — 어느 워프로 왔는지를 따로 안 들고 있고, 도착한 x·z를 보고
 * 넷 중 하나를 고른다. ⚠️ x가 11이 아니면 z를 아예 안 본다
 */
export function turnbackEntryWarp(x: number, z: number): number {
  if (x === 11) {
    if (z === 1) return 0
    if (z === 20) return 2
    return 5
  }
  return x === 20 ? 1 : 3
}
