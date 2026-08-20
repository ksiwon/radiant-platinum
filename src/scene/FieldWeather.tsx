import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, InstancedMesh, Object3D, PointLight } from 'three'
import { worldState } from '../state/worldState'
import { type FieldWeatherKind, weatherProfile } from './weatherVisual'

interface Particle {
  x: number
  y: number
  z: number
  phase: number
  speed: number
  size: number
}

const RANGE = 22
const HEIGHT = 18

function unit(i: number, salt: number): number {
  const x = Math.sin((i + 1) * (12.9898 + salt * 31.7)) * 43758.5453
  return x - Math.floor(x)
}

function weatherParticle(i: number): Particle {
  return {
    x: (unit(i, 1) * 2 - 1) * RANGE,
    y: unit(i, 2) * HEIGHT,
    z: (unit(i, 3) * 2 - 1) * RANGE,
    phase: unit(i, 4) * Math.PI * 2,
    speed: 0.72 + unit(i, 5) * 0.62,
    size: 0.65 + unit(i, 6) * 0.7,
  }
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size
}

/** 맵 헤더의 원작 날씨 번호를 플레이어 주변의 실제 3D 입자로 그린다. */
export function FieldWeather({ kind }: { kind: FieldWeatherKind }) {
  const profile = weatherProfile(kind)
  const root = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  const flash = useRef<PointLight>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const particles = useMemo(
    () => Array.from({ length: profile?.count ?? 0 }, (_, i) => weatherParticle(i)),
    [profile?.count],
  )

  useFrame(({ clock }) => {
    const group = root.current
    if (group) group.position.copy(worldState.player.position)
    const instanced = mesh.current
    if (instanced && profile) {
      const time = clock.elapsedTime
      particles.forEach((p, i) => {
        const falling = profile.fall >= 0
          ? HEIGHT - wrap(time * profile.fall * p.speed + (HEIGHT - p.y), HEIGHT)
          : wrap(p.y - time * profile.fall * p.speed, HEIGHT)
        const wind = time * profile.drift * p.speed
        const swirl = profile.shape === 'flake' || profile.shape === 'orb'
          ? Math.sin(time * 1.7 + p.phase) * 1.35
          : 0
        dummy.position.set(
          wrap(p.x + wind + swirl + RANGE, RANGE * 2) - RANGE,
          falling - 2,
          p.z + Math.cos(time * 1.1 + p.phase) * (profile.shape === 'grain' ? 1.2 : 0.3),
        )
        dummy.rotation.set(0, p.phase + time * 0.4, profile.shape === 'drop' ? -0.17 : time + p.phase)
        const size = p.size * (profile.shape === 'drop' ? 1 : profile.shape === 'orb' ? 1.7 : 0.9)
        dummy.scale.setScalar(size)
        dummy.updateMatrix()
        instanced.setMatrixAt(i, dummy.matrix)
      })
      instanced.instanceMatrix.needsUpdate = true
    }

    const light = flash.current
    if (light) {
      const pulse = Math.sin(clock.elapsedTime * 0.73) * Math.sin(clock.elapsedTime * 2.31)
      light.intensity = kind === 'storm' && pulse > 0.985 ? 18 : 0
      light.position.set(0, 12, 0)
    }
  })

  if (!profile && kind !== 'storm') return null
  return (
    <group ref={root}>
      {profile && (
        <instancedMesh ref={mesh} args={[undefined, undefined, particles.length]} frustumCulled={false}>
          {profile.shape === 'drop' ? (
            <cylinderGeometry args={[0.012, 0.018, 0.82, 4]} />
          ) : profile.shape === 'flake' ? (
            <octahedronGeometry args={[0.075, 0]} />
          ) : profile.shape === 'orb' ? (
            <sphereGeometry args={[0.075, 10, 8]} />
          ) : (
            <tetrahedronGeometry args={[0.055, 0]} />
          )}
          <meshBasicMaterial
            color={profile.color}
            transparent
            opacity={profile.opacity}
            depthWrite={false}
            fog={false}
          />
        </instancedMesh>
      )}
      <pointLight ref={flash} color="#dce9ff" distance={70} decay={1.4} intensity={0} />
    </group>
  )
}
