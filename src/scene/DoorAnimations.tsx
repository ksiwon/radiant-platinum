import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import type { MapGrid } from '../engine/map/grid'
import { type DoorVisual, useDoorVisualStore } from './doorVisualStore'

const DURATION = 200

function progress(door: DoorVisual): number {
  const t = Math.min(1, Math.max(0, (performance.now() - door.since) / DURATION))
  if (door.phase === 'opening') return t
  if (door.phase === 'closing') return 1 - t
  return door.phase === 'open' ? 1 : 0
}

function Door({ door, y }: { door: DoorVisual; y: number }) {
  const leaf = useRef<Group>(null)
  useFrame(() => {
    const group = leaf.current
    if (!group) return
    const t = progress(door)
    const eased = t * t * (3 - 2 * t)
    group.rotation.y = -eased * Math.PI * 0.52
  })
  return (
    <group position={[door.x + 0.5, y, door.z + 0.5]} rotation={[0, door.yaw, 0]}>
      {/* 기존 정적 문을 가리는 어두운 통로. 문짝이 돌면 실제 빈 공간이 남는다. */}
      <mesh position={[0, 0.92, -0.045]}>
        <planeGeometry args={[0.92, 1.84]} />
        <meshBasicMaterial color="#07090e" />
      </mesh>
      <mesh position={[-0.5, 0.94, 0]} castShadow>
        <boxGeometry args={[0.1, 1.98, 0.14]} />
        <meshStandardMaterial color="#473322" roughness={0.88} />
      </mesh>
      <mesh position={[0.5, 0.94, 0]} castShadow>
        <boxGeometry args={[0.1, 1.98, 0.14]} />
        <meshStandardMaterial color="#473322" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <boxGeometry args={[1.1, 0.1, 0.14]} />
        <meshStandardMaterial color="#473322" roughness={0.88} />
      </mesh>
      <group ref={leaf} position={[-0.43, 0, 0.035]}>
        <mesh position={[0.43, 0.92, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.84, 1.76, 0.09]} />
          <meshStandardMaterial color="#765334" roughness={0.82} metalness={0.02} />
        </mesh>
        <mesh position={[0.72, 0.9, 0.07]} castShadow>
          <sphereGeometry args={[0.055, 12, 8]} />
          <meshStandardMaterial color="#d3ad58" metalness={0.72} roughness={0.28} />
        </mesh>
      </group>
    </group>
  )
}

/** `LoadDoorAnimation`으로 지정한 타일 위에 실제 회전 문짝을 세운다. */
export function DoorAnimations({ grid }: { grid: MapGrid }) {
  const doors = useDoorVisualStore((state) => Object.values(state.doors))
  return (
    <group>
      {doors.map((door) => (
        <Door
          key={door.tag}
          door={door}
          y={grid.heightAtWorld(door.x + 0.5, door.z + 0.5, 0) ?? 0}
        />
      ))}
    </group>
  )
}
