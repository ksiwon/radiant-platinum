import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, type PointLight } from 'three'
import type { MapGrid } from '../engine/map/grid'
import { NO_SCRIPT, quarterOf, talkTile } from '../engine/map/world'
import { npcActors } from '../engine/actor/npcs'
import { worldState } from '../state/worldState'
import { promptNpcAt } from './promptTarget'

const FACING_STEP = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
] as const

/** 표식이 켜졌을 때의 점광 세기. 꺼진 동안에는 0으로 두고 **끄지는 않는다** */
const GLOW = 0.38

/** Camera-facing 3D A prompt over the NPC currently reachable by the field talk rule. */
export function InteractionPrompt({ grid, layer }: { grid: MapGrid; layer: number }) {
  const root = useRef<Group>(null)
  const art = useRef<Group>(null)
  const glow = useRef<PointLight>(null)

  useFrame(({ camera, clock }) => {
    const node = root.current
    if (!node) return
    /**
     * 표식을 보이고 감추는 자리.
     *
     * ⚠️ **빛까지 같이 감추면 안 된다.** 안 보이는 가지는 `_projectObject`가
     * 통째로 건너뛰므로 그 안의 점광이 **렌더 목록에서 빠진다.** 빛의 집합이
     * 바뀌면 `lightsNode`의 해시가 바뀌고, 그 해시는 모든 재질의 노드 캐시
     * 열쇠(`getDynamicCacheKey`)에 들어 있다 — 표식이 한 번 깜빡일 때마다
     * **씬에 있는 모든 셰이더가 다시 지어졌다.** 209번도로 실측으로 노드 상태
     * 224번 중 절반이 그 두 갈래로 갈려 있었다.
     *
     * 그래서 감추는 것은 **그림만**이고, 빛은 자리에 남긴 채 세기를 0으로
     * 내린다 (`MapStreamer`의 인물 키 라이트와 같은 방식이다).
     */
    const show = (on: boolean): void => {
      if (art.current) art.current.visible = on
      if (glow.current) glow.current.intensity = on ? GLOW : 0
    }
    const player = worldState.player
    const moving = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z) > 0.04
    if (moving || player.hop.active || player.riding || player.flying) {
      show(false)
      return
    }

    const step = FACING_STEP[quarterOf(player.facing)]!
    const front = {
      x: Math.floor(player.position.x) + step.x,
      z: Math.floor(player.position.z) + step.z,
    }
    const reach = talkTile(grid, front, step)
    const actor = promptNpcAt(npcActors.list, reach.x, reach.z, NO_SCRIPT, (npc) => npc.info.script)
    if (!actor) {
      show(false)
      return
    }

    const ground = grid.heightAtWorld(actor.x + 0.5, actor.z + 0.5, layer) ?? 0
    show(true)
    node.position.set(
      actor.x + 0.5,
      ground + 2.05 + Math.sin(clock.elapsedTime * 4.2) * 0.09,
      actor.z + 0.5,
    )
    node.quaternion.copy(camera.quaternion)
  })

  return (
    <group ref={root} scale={0.52}>
      <group ref={art} visible={false}>
      <mesh position={[0, 0, -0.025]}>
        <circleGeometry args={[0.48, 36]} />
        <meshStandardMaterial color="#18233b" emissive="#162748" emissiveIntensity={0.65} />
      </mesh>
      <mesh position={[0, 0, -0.015]}>
        <ringGeometry args={[0.4, 0.47, 36]} />
        <meshBasicMaterial color="#d8eeff" toneMapped={false} />
      </mesh>
      <group position={[0, -0.02, 0]}>
        <mesh position={[-0.12, 0, 0]} rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.11, 0.55, 0.07]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh position={[0.12, 0, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.11, 0.55, 0.07]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.03, 0]}>
          <boxGeometry args={[0.27, 0.09, 0.08]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      </group>
      </group>
      {/* 그림 밖에 둔다 — 위의 ⚠️ 참고. 세기만 오르내리고 자리는 늘 지킨다 */}
      <pointLight ref={glow} position={[0, 0, 0.35]} color="#b9e6ff" intensity={0} distance={2.2} />
    </group>
  )
}
