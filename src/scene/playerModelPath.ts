import type { AssetPath } from '../data/providers/assetProvider'
import { NPC_BUNDLE } from '../engine/actor/npcModels'

export type PlayerGender = 'boy' | 'girl'

/**
 * 세이브 성별에 대응하는 필드용 등신 모델.
 *
 * ⚠️ **둘 다 번들에서 굽는다.** 한동안 여자만 `models/dawn.glb`였는데, 그것은
 * 받아 온 `.dae`를 Blender로 물린 것이라 **단위가 달랐다** — 바인드 키가
 * `.dae` 2.5095, 번들 1.4725다. 남자는 이미 번들이었으므로 성별에 따라
 * 서로 다른 계통의 몸을 세우고 있었고, 자세 계산은 한 벌뿐이다.
 * 지금은 둘 다 `persons/battle`의 같은 계통이다
 */
export function playerModelPath(gender: PlayerGender): AssetPath {
  return `models/npc/${gender === 'boy' ? NPC_BUNDLE.hero : NPC_BUNDLE.heroine}.glb`
}
