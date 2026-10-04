// BDSP 볼 모델 받기 — `data/fx/ball/<볼 번호>.glb` (`import/bdsp/fx.ts`가 `ob02nn_00`을 클립째 굽는다).
//
// 시퀀스가 번호로 부르는 클립 · 로케이터 · 붙은 이펙트의 이름표는 `data/fx/index.json`의 `ballModel`이다
// (`fxIndex`). 장면은 볼마다 한 번 받아 캐시에 두고, 쓰는 자리마다 뼈째 복제한다 — 같은 볼 둘이 한 뼈대를 나눠
// 쓰면 같은 자세로 함께 움직인다(`monModel`의 `MonBody` 머리말과 같은 까닭).
import { LoadingManager, type AnimationClip, type Group } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { unifySkeletons } from '../../unifySkeleton'
import { assets, onProviderSwap } from '../../../data/providers/assetProvider'
import { fxIndex } from './moveSeq'
import type { BallMeta } from '../../../engine/battle/fx/ballPlans'

const loader = new GLTFLoader(new LoadingManager())

export interface BallModel {
  scene: Group
  clips: readonly AnimationClip[]
  meta: BallMeta
}

const cache = new Map<number, Promise<BallModel | null>>()

onProviderSwap(() => { cache.clear() })

/** 볼 표 (클립 · 로케이터 · 붙은 이펙트). 옛 판 묶음이면 `null` */
export async function ballMeta(): Promise<BallMeta | null> {
  return (await fxIndex())?.ballModel ?? null
}

/** 종의 내보내기 착지 갈래 (`MoveType`) — 0 땅 · 1 뜬다 · 2 큰 날개 */
export async function moveTypeOf(species: number): Promise<number> {
  return (await fxIndex())?.moveType?.[String(species)] ?? 0
}

/** 볼 모델 한 벌. 묶음에 없으면 `null` — 그때 시퀀스는 볼 없이 빛 · 몸만 튼다 */
export function loadBallModel(ball: number): Promise<BallModel | null> {
  const id = Number.isInteger(ball) && ball >= 1 && ball <= 16 ? ball : 4
  let got = cache.get(id)
  if (!got) {
    got = (async () => {
      const idx = await fxIndex()
      const table = idx?.ballModel
      const file = table?.files[String(id)]
      if (!table || !file) return null
      const path = `data/fx/${file}`
      const provider = assets()
      if (!(await provider.exists(path))) return null
      const url = await provider.objectUrl(path)
      try {
        const gltf = await loader.loadAsync(url)
        // 복제 전에 한 번 — 조각마다 뼈 수가 다르면 그 수만큼 셰이더가 갈린다 (`scene/unifySkeleton`)
        unifySkeletons(gltf.scene)
        gltf.scene.traverse((o) => {
          o.castShadow = true
          // 스킨 경계구가 뼈 이동(떨어짐 0.5m)을 못 따라가 잘린다 — 볼 한두 개라 컬링을 끈다 (`monModel`과 같은 까닭)
          o.frustumCulled = false
        })
        return { scene: gltf.scene, clips: gltf.animations, meta: table }
      } finally {
        provider.releaseObjectUrl(path)
      }
    })().catch(() => null)
    cache.set(id, got)
  }
  return got
}

/** 쓰는 자리마다 뼈째 복제한다 */
export function cloneBall(model: BallModel): Group {
  return cloneSkinned(model.scene) as Group
}
