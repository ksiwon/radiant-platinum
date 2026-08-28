// 사람 모델을 세우기 전 손질 — **세 화면이 같은 것을 쓴다** (REPAIR §9)
//
// 주인공은 세 자리에 선다: 오프닝(`IntroStage`) · 명예의 전당(`HallOfFameStage`) ·
// 필드(`PlayerModel`). 셋이 같은 스물세 줄을 각자 들고 있었고, **한쪽만 고치면
// 오프닝의 주인공과 전당의 주인공이 다르게 보인다** — 그리고 그것을 알아채는
// 자가 없다. 소품 재질이 두 벌이라 로토무 방 벽이 흰색으로 섰던 것과 같은 갈래다
// (`scene/propMeshes`가 그 자리의 답이었다).
//
// ⚠️ **셋이 이미 갈라져 있었다.** 필드만 `unifySkeletons`를 돌리고 있었다 —
// 오프닝과 전당은 조각마다 뼈대가 갈린 채로 서서 셰이더를 그만큼 더 굽고 있었다.
// 합치면서 그쪽에 맞춘다.
import { useEffect, useState } from 'react'
import { Mesh, MeshStandardMaterial, type Group, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { assets } from '../data/providers/assetProvider'
import { unifySkeletons } from './unifySkeleton'

/**
 * 오프닝과 전당이 같이 쓰는 받는 자.
 *
 * ⚠️ **둘이 각자 `new GLTFLoader()`를 들고 있었다.** 같은 것을 그리는데
 * 받는 자가 둘이면 한쪽에 변환기를 달아도 다른 쪽은 안 따라온다.
 * 필드 주인공은 R3F의 `useLoader`가 따로 든다 — 그쪽은 씨앗을 안 복제하고
 * 세션 내내 하나라 이 훅이 하는 일이 필요 없다
 */
const loader = new GLTFLoader()

/** 기본 복장과 겹쳐 z-fighting을 내는 대체 복장 조각 — 꺼 둔다 */
const ALT_OUTFIT = ['hair2', 'shoes2']

/**
 * 받아 온 사람 씬을 세울 수 있게 손질한다.
 *
 * ⚠️ **복제하기 전에 부른다.** `unifySkeletons`가 `skinIndex`를 고쳐 쓰는데
 * 복제본은 지오메트리를 **참조로** 물려받는다 (`unifySkeleton` 머리말).
 * 여기서 끈 `visible`과 손질한 재질은 복제본이 그대로 물려받는다
 */
export function preparePersonModel(scene: Object3D): void {
  // 조각마다 뼈 수가 다르면 그 수만큼 셰이더가 갈린다 (`unifySkeleton`)
  unifySkeletons(scene)
  scene.traverse((object: Object3D) => {
    if (ALT_OUTFIT.some((name) => object.name.includes(name))) object.visible = false
    if (!(object instanceof Mesh)) return
    object.castShadow = true
    // 알베도는 `tools/extract/bdsp_bake_albedo.py`가 이미 구워 넣었다
    // (BDSP 레이어 색상 → 평범한 albedo 텍스처). 여기서는 원작 툰 룩에 맞게
    // 반사만 눌러 둔다
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue
      material.roughness = 0.85
      material.metalness = 0
    }
  })
}

/**
 * 그 주소의 사람 모델을 받아 손질한 **복제본**. 아직 안 왔으면 `null`이다.
 *
 * 오프닝(`IntroStage`)과 명예의 전당(`HallOfFameStage`)이 같은 열세 줄을 각자
 * 들고 있었다 (REPAIR §9).
 *
 * ⚠️ **주소를 다 읽으면 놓는다.** 공개판은 OPFS Blob 주소라
 * 붙들고 있으면 그만큼 남는다 (IMPORT.md §7)
 */
export function usePersonModel(path: string): Group | null {
  const [model, setModel] = useState<Group | null>(null)

  useEffect(() => {
    let alive = true
    const provider = assets()
    void provider
      .objectUrl(path)
      .then(async (url) => {
        try {
          const gltf = await loader.loadAsync(url)
          if (!alive) return
          // ⚠️ **복제하기 전에 손질한다** — `unifySkeletons`가 지오메트리를
          // 고쳐 쓰고 복제본은 그것을 **참조로** 물려받는다
          preparePersonModel(gltf.scene)
          setModel(cloneSkinned(gltf.scene) as Group)
        } finally {
          provider.releaseObjectUrl(path)
        }
      })
      .catch(() => {
        /* 부르는 쪽이 사람 없이 그대로 돌아간다 */
      })
    return () => { alive = false }
  }, [path])

  return model
}
