import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
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

/** Camera-facing 3D A prompt over the NPC currently reachable by the field talk rule. */
export function InteractionPrompt({ grid, layer }: { grid: MapGrid; layer: number }) {
  const root = useRef<Group>(null)

  useFrame(({ camera, clock }) => {
    const node = root.current
    if (!node) return
    const player = worldState.player
    const moving = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z) > 0.04
    if (moving || player.hop.active || player.riding || player.flying) {
      node.visible = false
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
      node.visible = false
      return
    }

    const ground = grid.heightAtWorld(actor.x + 0.5, actor.z + 0.5, layer) ?? 0
    node.visible = true
    node.position.set(
      actor.x + 0.5,
      ground + 2.05 + Math.sin(clock.elapsedTime * 4.2) * 0.09,
      actor.z + 0.5,
    )
    node.quaternion.copy(camera.quaternion)
  })

  return (
    <group ref={root} visible={false} scale={0.52}>
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
      <pointLight position={[0, 0, 0.35]} color="#b9e6ff" intensity={0.38} distance={2.2} />
    </group>
  )
}
