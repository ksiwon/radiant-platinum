// 워프가 끝나 새 맵에 설 때 주인공의 탈것을 정리한다 (`FieldSystem_InitFlagsWarp`, REPAIR §92)
//
// 규칙은 `engine/map/warpAvatar`에 있다. 여기서는 **어느 옮김이 워프인가**만 가른다 —
// `world.pending`으로 오는 옮김 가운데 깨어진 세계의 층 가기(승강 발판·폭포)만 워프가 아니다.
// 원작은 그 둘을 `FieldMap_ChangeZoneDistortionWorld`로 돌려 `UpdateGameDataDistortionWorld(…, TRUE)`
// 곧 `InitFlagsOnMapChange` 쪽을 탄다 — B4F 천장 물에서 폭포를 타고 B5F 웅덩이로 내려가는 동안
// 파도타기가 이어지는 것이 그 덕이다.
import type { PendingWarp } from '../engine/map/world'
import { mapById } from '../engine/map/world'
import { avatarAfterWarp } from '../engine/map/warpAvatar'
import { connectionOf } from '../engine/world/distortion'
import { worldState } from '../state/worldState'
import { distortionData, isDistortionFloor } from './distortionCore'

/**
 * 깨어진 세계의 층 가기인가 — 이웃 층(`sDistWorldMapConnectionList`의 앞뒤)으로 가는데 롬 칸 워프가 아니다.
 *
 * 스크립트 `Warp`(B7F ↔ 기라티나 방)는 층을 가도 워프다(`romWorld`). 그 둘은 이웃 표에도 없다
 */
export function isDistortionFloorChange(from: number, target: PendingWarp): boolean {
  if (target.romWorld === true) return false
  if (!isDistortionFloor(from) || !isDistortionFloor(target.to)) return false
  const data = distortionData()
  if (data === null) return false
  const conn = connectionOf(data, from)
  return conn !== null && (conn.prev === target.to || conn.next === target.to)
}

/** 워프라면 자전거·파도타기를 원작대로 내린다. 층 가기는 그대로 둔다 */
export function settleAvatarForWarp(from: number, target: PendingWarp): void {
  if (isDistortionFloorChange(from, target)) return
  const p = worldState.player
  const next = avatarAfterWarp(
    { surfing: p.surfing, cycling: p.cycling }, mapById(target.to)?.bike === 1)
  if (next.cycling !== p.cycling) {
    p.cycling = next.cycling
    p.pedalling = 0
  }
  p.surfing = next.surfing
}
