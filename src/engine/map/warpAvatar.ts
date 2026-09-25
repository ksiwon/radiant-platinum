// 워프로 맵을 옮기면 주인공이 무엇으로 다니는가 (`FieldSystem_InitFlagsWarp`, REPAIR §92)
//
// 원작 `field_map_change_flags.c` 90–94줄:
//
//     if (playerState == PLAYER_AVATAR_CYCLING && MapHeader_IsBikeAllowed(mapHeaderID) == FALSE) {
//         playerState = PLAYER_AVATAR_WALKING;
//     } else if (playerState == PLAYER_AVATAR_SURFING) {
//         playerState = PLAYER_AVATAR_WALKING;
//     }
//
// 이 함수는 **워프**(`FieldMapChange_UpdateGameData(…, noWarp = FALSE)`)에서만 돈다 — 문·계단·
// 스크립트 `Warp`·공중날기·전멸이 다 그 길이다. 걸어서 맵 경계를 넘는 것(`InitFlagsOnMapChange`)과
// 깨어진 세계의 승강 발판·폭포가 층을 가는 것(`FieldMapChange_UpdateGameDataDistortionWorld(…, TRUE)`)은
// 이 줄을 안 지난다. 이어하기도 안 지난다 — 세이브의 `playerState`로 선다(REPAIR §87).

/** 주인공이 무엇으로 다니는가 — 걷기는 둘 다 거짓이다 */
interface AvatarState {
  surfing: boolean
  cycling: boolean
}

/**
 * 워프가 끝난 자리에서의 상태.
 *
 * 자전거는 **도착한 맵이 막을 때만** 내린다(`isBikeAllowed`). 파도타기는 도착한 맵과
 * 상관없이 **늘** 풀린다 — 워프 칸은 뭍이다
 */
export function avatarAfterWarp(now: AvatarState, bikeAllowed: boolean): AvatarState {
  if (now.cycling && !bikeAllowed) return { surfing: now.surfing, cycling: false }
  if (now.surfing) return { surfing: false, cycling: now.cycling }
  return now
}
