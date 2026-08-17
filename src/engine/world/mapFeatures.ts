// 맵마다 움직이는 장치 (`dynamic_map_features.c`)
//
// 원작에는 「그 맵에만 있는 장치」를 담는 자리가 하나 있다. 열한 갈래이고
// **한 번에 하나만** 산다 — 맵에 들어설 때 스크립트가 `InitPersistedMapFeaturesForX`로
// 어느 갈래인지 못 박고, 그 뒤로 통행 판정·프레임 갱신·정리가 전부 그 갈래로 간다.
//
// 갈래마다 하는 일이 셋이다:
//
//   `Init`           맵에 들어설 때 세운다 (소품·높이판·사람)
//   `CheckCollision` 맵 격자 **위에** 얹는 통행 판정. 참을 내면 격자를 안 본다
//   `Free`           맵을 떠날 때
//
// 여기는 그 자리 하나와, 지금 어느 갈래인지, 그리고 통행 판정을 넘기는
// 다리만 둔다. 갈래의 알맹이는 각자의 파일에 있다.
//
// ⚠️ **없으면 체육관 넷과 리그가 통째로 막힌다.** 리그의 승강판(⑦)이 없으면
// 사천왕에게 못 올라가고, 들판·물가·영원 체육관은 장치가 곧 길이다

/** `enum DynamicMapFeatureID` */
export const MAP_FEATURE = {
  none: 0,
  pastoriaGym: 1,
  hearthomeGym: 2,
  canalaveGym: 3,
  veilstoneGym: 4,
  sunyshoreGym: 5,
  greatMarsh: 6,
  platformLift: 7,
  eternaGym: 8,
  distortionWorld: 9,
  villa: 10,
} as const

export type MapFeatureId = typeof MAP_FEATURE[keyof typeof MAP_FEATURE]

let active: MapFeatureId = MAP_FEATURE.none

/** `PersistedMapFeatures_InitWithID` — 갈래를 못 박는다 */
export function setMapFeature(id: MapFeatureId): void {
  active = id
}

/** `PersistedMapFeatures_GetID` */
export function mapFeature(): MapFeatureId {
  return active
}

/** 맵을 떠나면 없어진다 (`DynamicMapFeatures_Free`) */
export function clearMapFeature(): void {
  active = MAP_FEATURE.none
}

/**
 * 장치가 맵 격자 위에 얹는 것들.
 *
 * 씬 쪽 모듈이 스스로 꽂는다 — 엔진이 씬을 들여오면 three가 딸려 오기
 * 때문이다 (`distortionBridge`와 같은 자리다)
 */
export const mapFeatureBridge: {
  /**
   * 그 칸이 막혔는가 (`DynamicMapFeatures_CheckCollision`).
   *
   * ⚠️ **세 값이다.** `true`면 막혔고 `false`면 **격자를 볼 것 없이 뚫렸고**
   * `null`이면 이 장치가 안 보는 칸이라 평소 판정으로 내려간다. 원작이
   * `BOOL` 둘(반환값과 `*isColliding`)로 같은 셋을 낸다
   */
  blocked: ((tileX: number, tileZ: number, height: number) => boolean | null) | null
} = { blocked: null }
