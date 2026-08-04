// Phase 0 회색 박스 월드 — 지면 + 장애물 + 플레이어 캡슐
import { useEffect, useRef } from 'react'
import type { Group } from 'three'
import { sceneRefs } from './sceneRefs'

const OBSTACLES: [number, number, number][] = []
for (let i = 0; i < 24; i++) {
  const angle = (i / 24) * Math.PI * 2
  const r = 8 + (i % 5) * 2
  OBSTACLES.push([Math.cos(angle) * r, 0.75, Math.sin(angle) * r])
}

// 캐릭터 모델 로딩 중에만 쓰이는 Suspense 폴백.
// 그룹 원점은 발밑(y=0) — 실제 모델과 동일한 기준이라 드라이버가 오프셋을 몰라도 된다.
export function PlayerCapsule() {
  const groupRef = useRef<Group>(null)

  useEffect(() => {
    sceneRefs.player = groupRef.current
    return () => { sceneRefs.player = null }
  }, [])

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
        <meshStandardMaterial color="#e8b04b" emissive="#3a2c12" />
      </mesh>
    </group>
  )
}

export function GreyBox() {
  return (
    <group>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 8]} intensity={1.4} />

      {/* 지면 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#3b4254" />
      </mesh>

      {/* 장애물 */}
      {OBSTACLES.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#5b8266' : '#4a5570'} />
        </mesh>
      ))}
    </group>
  )
}
