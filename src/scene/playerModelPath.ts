import type { AssetPath } from '../data/providers/assetProvider'

export type PlayerGender = 'boy' | 'girl'

/** 세이브 성별에 대응하는 필드용 등신 모델. */
export function playerModelPath(gender: PlayerGender): AssetPath {
  return gender === 'boy' ? 'models/npc/hero.glb' : 'models/dawn.glb'
}
