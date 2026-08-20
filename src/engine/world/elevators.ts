// 승강기 (`overlay005/field_menu.c`의 `FieldMenu_GetFloorsAbove`)
//
// 백화점·TV국·전망대·리본신디케이트·연고시티의 두 집. **길을 막지는 않는다** —
// 층을 고르는 목록도 워프도 스크립트에 통째로 적혀 있어서, 이 값이 없어도
// 승강기는 돈다. 없으면 **「지금 몇 층인가」가 안 뜰 뿐**이다.
//
// ⚠️ **선 맵이 아니라 「특별한 자리」를 본다.** 승강기 방은 층마다 따로 있지
// 않고 하나를 돌려 쓴다 — 어느 층에서 탔는지는 들어가기 전에
// `SetSpecialLocation`이 적어 둔 맵이 말한다

/**
 * 그 맵 위에 몇 층이 더 있는가 (`FieldMenu_GetFloorsAbove`).
 *
 * 열여덟 자리다. 목록에 없으면 0이다 — 원작의 `default`가 그렇다
 */
const FLOORS_ABOVE: Readonly<Record<number, number>> = {
  103: 1, // 연고시티 남동쪽 집 1F
  104: 0, // 연고시티 남동쪽 집 2F
  164: 0, // 전망대
  150: 1, // 선단시티
  112: 1, // 연고시티 북동쪽 집 1F
  113: 0, // 연고시티 북동쪽 집 2F
  461: 1, // 리조트에어리어 리본신디케이트 1F
  462: 0, // 리조트에어리어 리본신디케이트 2F
  137: 4, // 장막시티 백화점 1F
  138: 3, // 장막시티 백화점 2F
  139: 2, // 장막시티 백화점 3F
  140: 1, // 장막시티 백화점 4F
  141: 0, // 장막시티 백화점 5F
  566: 5, // 장막시티 백화점 B1F
  11: 3, // 축복시티 TV국 1F
  12: 2, // 축복시티 TV국 2F
  13: 1, // 축복시티 TV국 3F
  14: 0, // 축복시티 TV국 4F
}

export function floorsAbove(map: number): number {
  return FLOORS_ABOVE[map] ?? 0
}

/**
 * 층 이름의 글 번호 (`StringTemplate_SetFloorNumber`).
 *
 * `TEXT_BANK_MENU_ENTRIES`(361)의 자리다 — 0이 B1F이고 1~5가 1F~5F다.
 * ⚠️ **0을 지하로 쓴다.** 원작이 `floor == 0`만 따로 갈라 B1F로 보내고
 * 나머지는 `1F − 1`에 더한다
 */
export function floorTextIndex(floor: number): number {
  return floor === 0 ? 121 : 116 + floor - 1
}
