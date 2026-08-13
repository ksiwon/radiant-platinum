// 장치가 얹는 통행 판정 (`DynamicMapFeatures_CheckCollision`)
//
// 맵 격자 **위에** 한 겹 더 있는 판정이다. 장치가 갈래마다 자기 규칙을 내고,
// 참을 내면 격자를 볼 것도 없이 그것이 답이다.
//
// 여기 하나로 모으는 이유는 원작이 그렇기 때문이다 — 갈래 열하나가 한 표에
// 담겨 있고 한 번에 하나만 산다.
import { activeZone } from '../engine/map/zone'
import { heightCameFromPlate } from '../engine/map/dynamicHeight'
import { MAP_FEATURE, mapFeature, mapFeatureBridge } from '../engine/world/mapFeatures'
import { TILE_DYNAMIC_HEIGHT_COLLISION } from '../engine/world/pastoriaGym'
import { pastoriaBlockedAt } from './pastoriaGym'
import { sunyshoreBlockedAt } from './sunyshoreGym'
import { eternaBlockedAt } from './eternaGym'
import { canalaveBlockedAt } from './canalaveGym'
import { veilstoneBlockedAt } from './veilstoneGym'

/**
 * 그 칸이 막혔는가.
 *
 * @returns `null`이면 이 장치가 안 보는 칸이라 평소 판정으로 내려간다
 */
function featureBlocked(tileX: number, tileZ: number, height: number): boolean | null {
  const grid = activeZone.grid
  if (grid === null) return null
  const behavior = grid.behavior(tileX, tileZ)

  // ⚠️ **딛는 높이가 판에서 왔을 때만 막는 칸이 있다**
  // (`TILE_BEHAVIOR_DYNAMIC_HEIGHT_COLLISION`). 물가시티 체육관의 물이 그것이다 —
  // 물이 바닥까지 내려가면 구워진 높이가 이겨서 그 칸을 걸어 지나갈 수 있고,
  // 물이 오르면 판이 이겨서 막힌다. 원작은 이걸 장치 표가 아니라 엔진 쪽
  // (`TerrainCollisionManager_WillPlayerCollide`)에 두었고, 격자가 안 막은
  // 칸에만 얹는다
  if (behavior === TILE_DYNAMIC_HEIGHT_COLLISION && !grid.isBlocked(tileX, tileZ)) {
    // 구워진 높이는 판을 걷어 낸 값이라야 한다 — `heightAtWorld`는 이미 판을
    // 얹은 답이므로 여기서 다시 물으면 늘 판이 이긴다
    const baked = grid.bakedHeightAtWorld(tileX + 0.5, tileZ + 0.5, height)
    if (heightCameFromPlate(baked, tileX, tileZ, height)) return true
  }

  switch (mapFeature()) {
    case MAP_FEATURE.pastoriaGym:
      return pastoriaBlockedAt(behavior)
    case MAP_FEATURE.sunyshoreGym:
      return sunyshoreBlockedAt(tileX, tileZ)
    case MAP_FEATURE.eternaGym:
      return eternaBlockedAt(tileX, tileZ)
    case MAP_FEATURE.canalaveGym:
      return canalaveBlockedAt(tileX, tileZ, height)
    case MAP_FEATURE.veilstoneGym:
      return veilstoneBlockedAt(tileX, tileZ)
    default:
      return null
  }
}

mapFeatureBridge.blocked = featureBlocked
