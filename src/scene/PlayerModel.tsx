// 플레이어 캐릭터 모델 (PLAN §4.3) — BDSP 풀비율 모델을 glb로 변환한 것
// 모델 전방은 +Z. playerSystem의 facing = atan2(vx, vz) 규약과 그대로 일치한다.
import { Suspense, useEffect, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Mesh, type MeshStandardMaterial, type Group } from 'three'
import { normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { createRig } from '../engine/actor/locomotion'
import { BikeModel } from './BikeModel'
import { FieldActionEffects } from './FieldActionEffects'
import { sceneRefs } from './sceneRefs'
import { useAssetUrl } from '../data/providers/useAssetUrl'

// 대체 복장용 메시 — 기본 복장과 겹쳐 z-fighting을 내므로 꺼둔다
import { useSaveStore } from '../state/saveStore'
import { playerModelPath } from './playerModelPath'
import { unifySkeletons } from './unifySkeleton'
const ALT_OUTFIT = ['hair2', 'shoes2']

export function PlayerModel() {
  const groupRef = useRef<Group>(null)
  const normRef = useRef<Group>(null)
  // 주소를 Provider에서 받는다 — 공개판에서는 OPFS Blob URL이다 (IMPORT.md §7).
  const gender = useSaveStore((state) => state.trainer.gender)
  const modelPath = playerModelPath(gender)
  // 세션 내내 사는 모델이라 참조를 안 놓는다 (`useAssetUrl` 머리말)
  const gltf = useLoader(GLTFLoader, useAssetUrl(modelPath))

  useEffect(() => {
    // ⚠️ **조각마다 뼈 수가 다르면 그 수만큼 셰이더가 갈린다** (`unifySkeleton`).
    // 주인공은 조각 열하나에 스킨 여섯이라 혼자서 프로그램을 여섯 개 쓴다.
    // 여기 씬은 `useLoader`가 캐시해 세션 내내 하나뿐이라 두 번 걸릴 일이 없다
    unifySkeletons(gltf.scene)
    gltf.scene.traverse((o) => {
      if (ALT_OUTFIT.some((n) => o.name.includes(n))) o.visible = false
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      // 알베도는 tools/extract/bdsp_bake_albedo.py가 이미 구워 넣었다 (BDSP 레이어 색상 →
      // 평범한 albedo 텍스처). 여기서는 원작 툰 룩에 맞게 반사만 눌러둔다.
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const std = m as MeshStandardMaterial
        std.roughness = 0.85
        std.metalness = 0.0
      }
    })
  }, [gltf])

  // 정규화는 머티리얼 처리 이후, 그리고 씬 등록 이전에 한 번
  useEffect(() => {
    if (!normRef.current) return
    const r = normalizeModel(normRef.current, gltf.scene, PLAYER_HEIGHT)
    if (import.meta.env.DEV) {
      console.info(
        `[model] ${modelPath} 원본 ${r.nativeHeight.toFixed(3)} → ${PLAYER_HEIGHT}m (×${r.scale.toFixed(4)})`,
      )
    }

    // 리그는 정규화 **이후**에 만든다. 본의 월드 회전에서 로컬 축을 뽑기 때문에
    // 래퍼 변환이 확정된 뒤라야 축이 맞는다.
    // bob은 본이 아니라 래퍼에 건다 — 스킨 바인드를 건드리지 않는다
    const rig = createRig(gltf.scene, normRef.current)
    sceneRefs.playerRig = rig
    if (import.meta.env.DEV && !rig) {
      console.warn('[model] 보행 리그를 만들지 못했다 — 필요한 본이 없다. 바인드 포즈로 둔다')
    }
    return () => { sceneRefs.playerRig = null }
  }, [gltf, modelPath])

  // ⚠️ **모델이 바뀔 때마다 다시 등록한다.** `useAssetUrl`은 `use(promise)`라
  // 서스펜드하는데, 오프닝에서 성별을 고르면 `modelPath`가 바뀌어 경계가 **한 번
  // 더** 서스펜드한다. 그 사이 폴백(`PlayerCapsule`)이 다시 붙었다 떨어지면서
  // 자리를 비우므로, 한 번만(`[]`) 거는 등록은 영영 안 돌아온다 — 엔진이 위치를
  // 쓸 곳이 없어져 **몸은 제자리에 선 채 팔다리만 움직인다**. 실측한 순서는
  // 캡슐 등록 38.0초 → 캡슐 해제(null) 38.6초 → 리그만 다시 섬 38.6초였다.
  useEffect(() => {
    const node = groupRef.current
    sceneRefs.player = node
    // 내가 넣은 것일 때만 뺀다 — 나보다 늦게 온 쪽의 등록을 지우지 않는다
    return () => { if (sceneRefs.player === node) sceneRefs.player = null }
  }, [gltf, modelPath])

  return (
    // 바깥 그룹은 엔진이 매 프레임 위치·방향을 쓴다. 안쪽 그룹은 정규화 전용이라 서로 간섭하지 않는다.
    <group ref={groupRef}>
      <group ref={normRef}>
        <primitive object={gltf.scene} />
      </group>
      {/* 자전거는 정규화 밖이다 — 번들 단위 그대로고 발밑이 원점이다 */}
      <Suspense fallback={null}><BikeModel /></Suspense>
      <FieldActionEffects bodyRef={normRef} />
    </group>
  )
}
