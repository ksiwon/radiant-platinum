import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type Group, type InstancedMesh } from 'three'
import { worldState } from '../state/worldState'
import { distortionActive } from './distortion'

const SHARDS = 24

interface Shard {
  x: number
  y: number
  z: number
  scale: number
  tilt: number
}

/** 매번 같은 공허를 만들되 규칙적으로 보이지 않게 분산한다. */
export function distortionShardLayout(count = SHARDS): Shard[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963
    const radius = 5 + (index % 6) * 1.7
    return {
      x: Math.cos(angle) * radius,
      y: ((index * 7) % 11) - 5,
      z: Math.sin(angle) * radius,
      scale: 0.18 + (index % 4) * 0.08,
      tilt: angle * 0.57,
    }
  })
}

/** 왜곡세계 안에서만 플레이어를 따라오는 입체 공허 파편과 중력 링. */
export function DistortionAmbience() {
  const rootRef = useRef<Group>(null)
  const shardsRef = useRef<InstancedMesh>(null)
  const innerRingRef = useRef<Group>(null)
  const outerRingRef = useRef<Group>(null)
  const layout = useMemo(() => distortionShardLayout(), [])

  useEffect(() => {
    const mesh = shardsRef.current
    if (!mesh) return
    const dummy = new Object3D()
    for (let index = 0; index < layout.length; index += 1) {
      const shard = layout[index]!
      dummy.position.set(shard.x, shard.y, shard.z)
      dummy.rotation.set(shard.tilt, shard.tilt * 0.7, -shard.tilt * 0.45)
      dummy.scale.set(shard.scale * 0.45, shard.scale * 2.6, shard.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [layout])

  useFrame(({ clock }) => {
    const root = rootRef.current
    if (!root) return
    const active = distortionActive()
    root.visible = active
    if (!active) return
    const p = worldState.player.position
    root.position.copy(p)
    root.rotation.y = clock.elapsedTime * 0.035
    if (innerRingRef.current) {
      innerRingRef.current.rotation.x = clock.elapsedTime * 0.11
      innerRingRef.current.rotation.z = clock.elapsedTime * 0.07
    }
    if (outerRingRef.current) {
      outerRingRef.current.rotation.y = -clock.elapsedTime * 0.08
      outerRingRef.current.rotation.z = clock.elapsedTime * 0.045
    }
  })

  return (
    <group ref={rootRef} visible={false}>
      <instancedMesh ref={shardsRef} args={[undefined, undefined, layout.length]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#704fa8"
          emissive="#361c68"
          emissiveIntensity={0.75}
          roughness={0.5}
          metalness={0.12}
        />
      </instancedMesh>
      <group ref={innerRingRef} rotation={[0.4, 0, 0.7]}>
        <mesh>
          <torusGeometry args={[7.5, 0.045, 6, 72]} />
          <meshBasicMaterial color="#986eff" transparent opacity={0.28} depthWrite={false} fog={false} />
        </mesh>
      </group>
      <group ref={outerRingRef} rotation={[1.1, 0.2, 0]}>
        <mesh>
          <torusGeometry args={[11.5, 0.035, 6, 88]} />
          <meshBasicMaterial color="#55c9e8" transparent opacity={0.18} depthWrite={false} fog={false} />
        </mesh>
      </group>
      <pointLight color="#7e55c7" intensity={0.75} distance={16} decay={2} />
    </group>
  )
}
