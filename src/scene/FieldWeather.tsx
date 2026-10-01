import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, InstancedMesh, Object3D, PointLight } from 'three'
import { worldState } from '../state/worldState'
import { lookForward } from '../engine/input/mouse'
import {
  type FieldWeatherKind, weatherCapacity, weatherCount, weatherLayout, weatherProfile, wrapAround,
} from './weatherVisual'

/**
 * 입자 하나. 자리는 **단위 값**으로 둔다 — 가로·세로는 −1~1, 높이는 0~1.
 * 상자 크기는 시점마다 달라서(`weatherLayout`) 그릴 때 곱한다
 */
interface Particle {
  x: number
  y: number
  z: number
  phase: number
  speed: number
  size: number
}

function unit(i: number, salt: number): number {
  const x = Math.sin((i + 1) * (12.9898 + salt * 31.7)) * 43758.5453
  return x - Math.floor(x)
}

function weatherParticle(i: number): Particle {
  return {
    x: unit(i, 1) * 2 - 1,
    y: unit(i, 2),
    z: unit(i, 3) * 2 - 1,
    phase: unit(i, 4) * Math.PI * 2,
    speed: 0.72 + unit(i, 5) * 0.62,
    size: 0.65 + unit(i, 6) * 0.7,
  }
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size
}

/**
 * 맵 헤더의 원작 날씨 번호를 플레이어 주변의 실제 3D 입자로 그린다.
 *
 * 1인칭이면 상자를 줄여 시선 앞으로 밀고 빗방울을 늘린다 (`FIRST_LAYOUT`).
 * 인스턴스는 두 시점 중 큰 쪽으로 잡아 두고 `mesh.count`로 줄인다 — 시점을
 * 바꿀 때마다 메시를 다시 만들지 않는다
 */
export function FieldWeather({ kind }: { kind: FieldWeatherKind }) {
  const profile = weatherProfile(kind)
  const root = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  const flash = useRef<PointLight>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const capacity = profile ? weatherCapacity(profile) : 0
  const particles = useMemo(
    () => Array.from({ length: capacity }, (_, i) => weatherParticle(i)),
    [capacity],
  )

  useFrame(({ clock }) => {
    const view = worldState.camera.mode
    const { range, height, ahead, dropWidth, dropLength } = weatherLayout(view)
    const player = worldState.player.position
    // 1인칭은 상자 중심을 시선 앞으로 민다. 입자는 월드 격자에 고정이다 (`wrapAround`)
    const forward = lookForward(worldState.camera.yaw)
    const cx = view === 'first' ? player.x + forward.x * ahead : player.x
    const cz = view === 'first' ? player.z + forward.z * ahead : player.z
    const group = root.current
    if (group) group.position.set(cx, player.y, cz)
    const instanced = mesh.current
    if (instanced && profile) {
      const time = clock.elapsedTime
      const count = Math.min(weatherCount(profile, view), particles.length)
      const drop = profile.shape === 'drop'
      for (let i = 0; i < count; i++) {
        const p = particles[i]!
        const y = p.y * height
        const falling = profile.fall >= 0
          ? height - wrap(time * profile.fall * p.speed + (height - y), height)
          : wrap(y - time * profile.fall * p.speed, height)
        const wind = time * profile.drift * p.speed
        const swirl = profile.shape === 'flake' || profile.shape === 'orb'
          ? Math.sin(time * 1.7 + p.phase) * 1.35
          : 0
        const sway = Math.cos(time * 1.1 + p.phase) * (profile.shape === 'grain' ? 1.2 : 0.3)
        // 3인칭은 예전 그대로 플레이어에 붙은 상자다. 1인칭은 고개를 돌릴 때
        // 빗발이 같이 미끄러지지 않게 월드 좌표에서 접는다
        const x = view === 'first'
          ? wrapAround(p.x * range + wind + swirl, cx, range)
          : wrap(p.x * range + wind + swirl + range, range * 2) - range
        const z = view === 'first'
          ? wrapAround(p.z * range + sway, cz, range)
          : p.z * range + sway
        dummy.position.set(x, falling - 2, z)
        dummy.rotation.set(0, p.phase + time * 0.4, drop ? -0.17 : time + p.phase)
        const size = p.size * (drop ? 1 : profile.shape === 'orb' ? 1.7 : 0.9)
        if (drop) dummy.scale.set(size * dropWidth, size * dropLength, size * dropWidth)
        else dummy.scale.setScalar(size)
        dummy.updateMatrix()
        instanced.setMatrixAt(i, dummy.matrix)
      }
      instanced.count = count
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
