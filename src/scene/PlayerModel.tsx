// 플레이어 캐릭터 모델 (PLAN §4.3) — BDSP 풀비율 모델을 glb로 변환한 것
// 모델 전방은 +Z. playerSystem의 facing = atan2(vx, vz) 규약과 그대로 일치한다.
import { useEffect, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Color, Mesh, MeshStandardMaterial, type Group } from 'three'
import { normalizeModel } from '../engine/model/normalize'
import { sceneRefs } from './sceneRefs'

/** 빛나의 목표 신장 (게임 단위 = 미터) */
const PLAYER_HEIGHT = 1.5

// BDSP는 _col 텍스처가 알베도가 아니라 그레이스케일 음영 맵이고, 실제 색은
// Unity 머티리얼의 SkinColor / PrimaryColor / SecondaryColor 값에 있다 (dae 익스포트에 실리지 않음).
// _msk가 이 세 색을 칠할 영역을 고르고, _col은 그 위에 음영만 곱한다.
// 아래는 그 팔레트를 확보하기 전까지 쓰는 임시값 — 모델이 순백으로 보이는 것만 막는다.
// TODO(§4.3): BDSP .mat에서 세 색을 추출하거나, _msk 기반으로 알베도를 베이크
const PROVISIONAL_PALETTE: Record<string, string> = {
  face: '#f6d5bc',
  body: '#f6d5bc',
  hair: '#1c2440',
  hat: '#f2f2f4',
  wear: '#2a2d38',
  shoes: '#e05a7a',
  bag: '#e8c04b',
  metal: '#c9ccd4',
  acce: '#e05a7a',
}

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
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const std = m as MeshStandardMaterial
        const tint = PROVISIONAL_PALETTE[std.name]
        if (tint) std.color = new Color(tint)
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
