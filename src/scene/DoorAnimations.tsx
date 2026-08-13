import { useMemo, useRef } from 'react'
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
  // ⚠️ **셀렉터 안에서 배열을 만들면 안 된다.** zustand 5는 `useSyncExternalStore`에
  // `Object.is`로만 견주므로 `Object.values`가 매번 새 배열을 돌려주면 스냅숏이
  // 늘 바뀐 것으로 보인다 — 무한 렌더로 `<Canvas>`가 통째로 죽어서 필드 화면이
  // 한 색으로 남았다. 바뀌지 않는 표를 받아 놓고 여기서 편다
  const table = useDoorVisualStore((state) => state.doors)
  const doors = useMemo(() => Object.values(table), [table])
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
