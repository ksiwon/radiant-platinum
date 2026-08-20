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
    const node = groupRef.current
    sceneRefs.player = node
    // ⚠️ **내가 넣은 것일 때만 뺀다.** 폴백은 붙었다 떨어지기를 되풀이하는데
    // (모델을 갈아 끼우면 경계가 다시 서스펜드한다), 무조건 `null`로 지우면
    // 그때 이미 등록을 마친 **진짜 모델의 자리를 대신 비워 버린다** —
    // 그러면 몸이 제자리에 선 채 팔다리만 움직인다 (`PlayerModel` 참고)
    return () => { if (sceneRefs.player === node) sceneRefs.player = null }
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
