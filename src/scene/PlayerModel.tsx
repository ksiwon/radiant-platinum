// 플레이어 캐릭터 모델 (PLAN §4.3) — BDSP 풀비율 모델을 glb로 변환한 것
// 모델 전방은 +Z. playerSystem의 facing = atan2(vx, vz) 규약과 그대로 일치한다.
import { useEffect, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Mesh, type MeshStandardMaterial, type Group } from 'three'
import { normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { createRig } from '../engine/actor/locomotion'
import { sceneRefs } from './sceneRefs'

// 대체 복장용 메시 — 기본 복장과 겹쳐 z-fighting을 내므로 꺼둔다
const ALT_OUTFIT = ['hair2', 'shoes2']

export function PlayerModel() {
  const groupRef = useRef<Group>(null)
  const normRef = useRef<Group>(null)
  const gltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}models/dawn.glb`)

  useEffect(() => {
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
        `[model] dawn.glb 원본 ${r.nativeHeight.toFixed(3)} → ${PLAYER_HEIGHT}m (×${r.scale.toFixed(4)})`,
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
  }, [gltf])

  useEffect(() => {
    sceneRefs.player = groupRef.current
    return () => { sceneRefs.player = null }
  }, [])

  return (
    // 바깥 그룹은 엔진이 매 프레임 위치·방향을 쓴다. 안쪽 그룹은 정규화 전용이라 서로 간섭하지 않는다.
    <group ref={groupRef}>
      <group ref={normRef}>
        <primitive object={gltf.scene} />
      </group>
    </group>
  )
}
