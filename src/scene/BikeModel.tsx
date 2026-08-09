// 자전거 (DATA.md §4.2.1) — BDSP의 `Characters/objects/ob1003_00`
//
// 타면 몸만 빨라지고 밑에 아무것도 없던 자리를 메운다. 자리를 맞출 것이 없다:
// 번들이 붙이는 자리로 적어 둔 `loc_attach`가 (0, 0, 0)이고 메시 바닥도 거기라,
// **주인공 그룹의 자식으로 원점에 놓으면 바퀴가 땅에 닿는다** (`actor/bike`).
//
// ⚠️ **안 탈 때도 씬에 남는다.** `visible`만 끈다 — 탈 때마다 glb를 받으면
// 첫 페달에서 몇 프레임 빈 채로 달린다.
import { useEffect, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Mesh, Quaternion, Vector3, type Group, type MeshStandardMaterial, type Object3D } from 'three'
import { BDSP_TO_WORLD } from '../engine/model/normalize'
import { BIKE } from '../engine/actor/bike'
import { sceneRefs } from './sceneRefs'
import { useAssetUrl } from '../data/providers/useAssetUrl'

/** 돌려야 하는 뼈들. 앞뒤 바퀴는 바퀴 반지름, 크랭크는 그 물린 비율로 돈다 */
const SPIN = ['FTire', 'BTire', 'Gear', 'LPedal1', 'RPedal1'] as const

const AXIS = new Vector3(1, 0, 0)
const turn = new Quaternion()

/** 굴러가는 것들을 위상만큼 돌린다. 페달은 반대편끼리 반 바퀴 어긋난다 */
export function spinBike(bike: Object3D, phase: number) {
  for (const name of SPIN) {
    const node = bike.getObjectByName(name)
    const rest = node?.userData.rest as Quaternion | undefined
    if (!node || !rest) continue
    // ⚠️ **페달 발판은 안 돌린다.** 크랭크가 돌아도 발판은 수평을 지킨다 —
    // 같이 돌리면 발이 뒤집힌 발판을 밟는다
    const angle = name === 'RPedal1' ? phase + Math.PI : phase
    node.quaternion.copy(rest).premultiply(turn.setFromAxisAngle(AXIS, -angle))
  }
}

export function BikeModel() {
  const groupRef = useRef<Group>(null)
  const gltf = useLoader(GLTFLoader, useAssetUrl('models/bike.glb'))

  useEffect(() => {
    gltf.scene.traverse((o) => {
      // 돌릴 뼈의 바인드 회전을 기억해 둔다. 매 프레임 여기서 다시 출발한다
      if ((SPIN as readonly string[]).includes(o.name)) o.userData.rest = o.quaternion.clone()
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const std = m as MeshStandardMaterial
        std.roughness = 0.55
        std.metalness = 0.0
      }
    })
  }, [gltf])

  useEffect(() => {
    const g = groupRef.current
    if (!g) return
    g.visible = false
    sceneRefs.bike = g
    return () => { sceneRefs.bike = null }
  }, [])

  return (
    <group ref={groupRef} scale={BDSP_TO_WORLD}>
      <primitive object={gltf.scene} />
    </group>
  )
}

/** 바퀴 반지름 (게임 단위). 페달 위상을 속도에서 만들 때 쓴다 */
export const BIKE_WHEEL_R = BIKE.wheel.r * BDSP_TO_WORLD
