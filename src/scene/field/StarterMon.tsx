import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { useMonBody } from '../monBody'
import { cinematicScale } from '../cinematicMotion'
import { starterScene } from './starterRefs'

/** StarterStage parent converts original DS units with this same scale. */
const STAGE_UNIT = 1 / 50

/** Selected starter's real 3D body, shown only while the yes/no prompt is open. */
export function StarterMon({ species, at }: { species: number; at: number }) {
  const group = useRef<Group>(null)
  const shown = useRef(0)
  /* The volumetric fallback below remains visible until the body arrives. */
  const body = useMonBody(species)

  useFrame(({ clock }, delta) => {
    const node = group.current
    const on = starterScene.confirming && starterScene.pick === at
    shown.current += ((on ? 1 : 0) - shown.current) * Math.min(1, delta * 7)
    if (!node) return
    node.visible = shown.current > 0.01
    const scale = body ? cinematicScale(body.tall) : 1
    node.scale.setScalar((scale / STAGE_UNIT) * shown.current * 0.78)
    node.position.y = -27 + Math.sin(clock.elapsedTime * 2.2 + at) * 1.2
  })

  const hue = (species * 47) % 360
  return (
    <group ref={group} visible={false} position={[0, -27, 36]}>
      {body ? (
        <primitive object={body.root} />
      ) : (
        <group position={[0, 0.7, 0]}>
          <mesh castShadow position={[0, 0.36, 0]}>
            <capsuleGeometry args={[0.42, 0.72, 7, 16]} />
            <meshStandardMaterial color={`hsl(${String(hue)} 48% 58%)`} roughness={0.78} />
          </mesh>
          <mesh castShadow position={[0, 1.02, 0]}>
            <sphereGeometry args={[0.36, 16, 11]} />
            <meshStandardMaterial color={`hsl(${String(hue)} 52% 66%)`} roughness={0.75} />
          </mesh>
        </group>
      )}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.65, 0.73, 48]} />
        <meshBasicMaterial color="#ffe9a8" transparent opacity={0.72} fog={false} />
      </mesh>
    </group>
  )
}
