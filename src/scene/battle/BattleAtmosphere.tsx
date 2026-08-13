import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type Group, type InstancedMesh, type Mesh } from 'three'
import type { Status } from '../../engine/pokemon/instance'
import type { BattleView, ViewMon } from '../../engine/battle/view'
import type { SideId, SlotId } from '../../engine/battle/events'

type WeatherKind = 'none' | 'rain' | 'snow' | 'sand' | 'sun'

export function battleWeatherKind(weather: string | null): WeatherKind {
  const id = (weather ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (id.includes('rain')) return 'rain'
  if (id.includes('hail') || id.includes('snow')) return 'snow'
  if (id.includes('sand')) return 'sand'
  if (id.includes('sun')) return 'sun'
  return 'none'
}

export function statusAuraColor(status: Status): string | null {
  switch (status) {
    case 'brn': return '#ff6a3d'
    case 'par': return '#ffe34c'
    case 'psn': case 'tox': return '#a766e8'
    case 'frz': return '#8cecff'
    case 'slp': return '#8ba0dd'
    default: return null
  }
}

export function visibleSideConditions(conditions: ReadonlyMap<string, number>): string[] {
  const known = new Set([
    'reflect', 'lightscreen', 'safeguard', 'mist',
    'spikes', 'toxicspikes', 'stealthrock',
  ])
  return [...conditions.keys()].filter((id) => known.has(id))
}

interface SpotProps {
  spotAt: (slot: SlotId) => [number, number]
}

const WEATHER_PARTICLES = 72

function Weather({ weather }: { weather: string | null }) {
  const meshRef = useRef<InstancedMesh>(null)
  const sunRef = useRef<Group>(null)
  const kind = battleWeatherKind(weather)
  const layout = useMemo(() => Array.from({ length: WEATHER_PARTICLES }, (_, index) => ({
    x: ((index * 37) % 101) / 101 * 22 - 11,
    y: ((index * 53) % 97) / 97 * 9 + 0.5,
    z: ((index * 71) % 103) / 103 * 18 - 9,
    spin: (index % 9) * 0.31,
  })), [])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (mesh) {
      mesh.visible = kind === 'rain' || kind === 'snow' || kind === 'sand'
      if (mesh.visible) {
        const dummy = new Object3D()
        const time = clock.elapsedTime
        for (let index = 0; index < layout.length; index += 1) {
          const p = layout[index]!
          if (kind === 'rain') {
            dummy.position.set(p.x + p.y * 0.18, ((p.y - time * 10) % 10 + 10) % 10, p.z)
            dummy.rotation.set(0, 0, -0.18)
            dummy.scale.set(0.025, 0.52, 0.025)
          } else if (kind === 'snow') {
            const fall = ((p.y - time * 1.2) % 10 + 10) % 10
            dummy.position.set(p.x + Math.sin(time + p.spin) * 0.5, fall, p.z)
            dummy.rotation.set(time * 0.7 + p.spin, time * 0.5, p.spin)
            dummy.scale.setScalar(0.085 + (index % 3) * 0.025)
          } else {
            const sweep = ((p.x + time * 5) % 22 + 22) % 22 - 11
            dummy.position.set(sweep, 0.15 + (index % 7) * 0.12, p.z + Math.sin(time + p.spin))
            dummy.rotation.set(p.spin, time * 2 + p.spin, p.spin * 0.5)
            dummy.scale.set(0.09, 0.025, 0.09)
          }
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
      }
    }
    if (sunRef.current) {
      sunRef.current.visible = kind === 'sun'
      sunRef.current.rotation.z = clock.elapsedTime * 0.12
    }
  })

  const color = kind === 'rain' ? '#8ad9ff' : kind === 'snow' ? '#eafcff' : '#d7b06b'
  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, WEATHER_PARTICLES]} frustumCulled={false}>
        {kind === 'snow' ? <octahedronGeometry args={[1, 0]} /> : <boxGeometry args={[1, 1, 1]} />}
        <meshBasicMaterial color={color} transparent opacity={kind === 'sand' ? 0.48 : 0.7} />
      </instancedMesh>
      <group ref={sunRef} visible={false} position={[0, 7.5, -5]}>
        <mesh>
          <sphereGeometry args={[1.15, 20, 12]} />
          <meshBasicMaterial color="#fff5a8" toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.65, 0.055, 8, 48]} />
          <meshBasicMaterial color="#ffd85c" transparent opacity={0.6} toneMapped={false} />
        </mesh>
        <pointLight color="#ffc95a" intensity={2.2} distance={18} decay={2} />
      </group>
    </group>
  )
}

function StatusAura({ mon, position }: { mon: ViewMon; position: [number, number] }) {
  const rootRef = useRef<Group>(null)
  const ringRef = useRef<Mesh>(null)
  const color = statusAuraColor(mon.status)
  const confused = mon.volatiles.has('confusion')
  const seeded = mon.volatiles.has('leechseed')
  const substitute = mon.volatiles.has('substitute')

  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    if (rootRef.current) rootRef.current.rotation.y = time * 1.6
    if (ringRef.current) {
      ringRef.current.position.y = 1.15 + Math.sin(time * 2.4) * 0.14
      ringRef.current.rotation.z = time * 1.8
    }
  })

  return (
    <group position={[position[0], 0, position[1]]}>
      {color && (
        <group ref={rootRef}>
          <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.72, 0.045, 7, 28]} />
            <meshBasicMaterial color={color} transparent opacity={0.72} toneMapped={false} />
          </mesh>
          {Array.from({ length: 6 }, (_, index) => {
            const angle = index / 6 * Math.PI * 2
            return (
              <mesh key={index} position={[Math.cos(angle) * 0.62, 0.35 + (index % 3) * 0.28, Math.sin(angle) * 0.62]}>
                <octahedronGeometry args={[0.1, 0]} />
                <meshBasicMaterial color={color} transparent opacity={0.68} toneMapped={false} />
              </mesh>
            )
          })}
          {mon.status === 'frz' && (
            <mesh position={[0, 0.75, 0]} scale={[0.72, 1.05, 0.72]}>
              <icosahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color="#b9f4ff" transparent opacity={0.26} roughness={0.08} />
            </mesh>
          )}
        </group>
      )}
      {confused && (
        <group position={[0, 1.7, 0]} rotation={[0.25, 0, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.55, 0.035, 6, 26]} />
            <meshBasicMaterial color="#fff080" toneMapped={false} />
          </mesh>
        </group>
      )}
      {seeded && (
        <group>
          <mesh position={[-0.35, 0.2, 0.15]} rotation={[0, 0, -0.8]}>
            <torusGeometry args={[0.4, 0.055, 6, 18, Math.PI * 1.45]} />
            <meshStandardMaterial color="#58a94a" roughness={0.8} />
          </mesh>
          <mesh position={[0.32, 0.18, -0.1]} rotation={[0, 1.1, 0.8]}>
            <torusGeometry args={[0.34, 0.05, 6, 18, Math.PI * 1.4]} />
            <meshStandardMaterial color="#72bf52" roughness={0.8} />
          </mesh>
        </group>
      )}
      {substitute && (
        <group position={[0.62, 0.25, 0.28]} scale={0.42}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <sphereGeometry args={[0.58, 14, 10]} />
            <meshStandardMaterial color="#78b86f" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.05, 0]} castShadow>
            <capsuleGeometry args={[0.36, 0.42, 5, 10]} />
            <meshStandardMaterial color="#68a85f" roughness={0.85} />
          </mesh>
          <mesh position={[-0.2, 0.65, 0.48]}><sphereGeometry args={[0.06, 8, 6]} /><meshBasicMaterial color="#17231a" /></mesh>
          <mesh position={[0.2, 0.65, 0.48]}><sphereGeometry args={[0.06, 8, 6]} /><meshBasicMaterial color="#17231a" /></mesh>
        </group>
      )}
      {mon.shiny && <ShinySparkles />}
    </group>
  )
}

function ShinySparkles() {
  const rootRef = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!rootRef.current) return
    rootRef.current.rotation.y = clock.elapsedTime * 1.9
    rootRef.current.position.y = 0.75 + Math.sin(clock.elapsedTime * 2.2) * 0.08
  })
  return (
    <group ref={rootRef}>
      {Array.from({ length: 7 }, (_, index) => {
        const angle = index / 7 * Math.PI * 2
        return (
          <mesh key={index} position={[Math.cos(angle) * 0.9, (index % 3) * 0.3, Math.sin(angle) * 0.9]} rotation={[0.7, angle, 0.4]}>
            <octahedronGeometry args={[0.11 + (index % 2) * 0.04, 0]} />
            <meshBasicMaterial color={index % 2 ? '#fff5a3' : '#9df5ff'} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

function Barrier({ side, conditions, spotAt }: {
  side: SideId
  conditions: ReadonlyMap<string, number>
} & SpotProps) {
  const rootRef = useRef<Group>(null)
  const slot = side === 'p1' ? 'p1a' : 'p2a'
  const [x, z] = spotAt(slot)
  const ids = visibleSideConditions(conditions)
  useFrame(({ clock }) => {
    if (rootRef.current) rootRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.7) * 0.08
  })
  const wall = ids.find((id) => id === 'reflect' || id === 'lightscreen' || id === 'safeguard' || id === 'mist')
  const spikes = ids.some((id) => id === 'spikes' || id === 'toxicspikes')
  const rocks = ids.includes('stealthrock')
  const wallColor = wall === 'reflect' ? '#dfb0ff' : wall === 'lightscreen' ? '#ffe98b' : '#9df4df'
  return (
    <group ref={rootRef} position={[x, 0, z]}>
      {wall && (
        <mesh position={[0, 1.15, side === 'p1' ? -0.65 : 0.65]}>
          <boxGeometry args={[2.8, 2.2, 0.035]} />
          <meshBasicMaterial color={wallColor} transparent opacity={0.2} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {spikes && Array.from({ length: 5 }, (_, index) => {
        const angle = index / 5 * Math.PI * 2
        return (
          <mesh key={index} position={[Math.cos(angle) * 1.05, 0.12, Math.sin(angle) * 0.65]}>
            <coneGeometry args={[0.12, 0.38, 5]} />
            <meshStandardMaterial color={ids.includes('toxicspikes') ? '#8747a8' : '#9ba0a7'} metalness={0.25} roughness={0.55} />
          </mesh>
        )
      })}
      {rocks && Array.from({ length: 4 }, (_, index) => {
        const angle = index / 4 * Math.PI * 2 + 0.5
        return (
          <mesh key={index} position={[Math.cos(angle) * 1.0, 0.55 + (index % 2) * 0.3, Math.sin(angle) * 0.75]} rotation={[angle, angle * 0.7, 0.4]}>
            <tetrahedronGeometry args={[0.24, 0]} />
            <meshStandardMaterial color="#8f8798" roughness={0.7} />
          </mesh>
        )
      })}
    </group>
  )
}

function FieldConditions({ field }: { field: ReadonlySet<string> }) {
  const rootRef = useRef<Group>(null)
  const trick = field.has('trickroom')
  const gravity = field.has('gravity')
  const magic = field.has('magicroom') || field.has('wonderroom')
  useFrame(({ clock }) => {
    if (rootRef.current) rootRef.current.rotation.y = clock.elapsedTime * 0.07
  })
  return (
    <group ref={rootRef}>
      {trick && (
        <mesh position={[0, 3.1, 0]}>
          <boxGeometry args={[11, 6, 9]} />
          <meshBasicMaterial color="#cc75ff" wireframe transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
      {gravity && (
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[5.2, 0.09, 8, 64]} />
          <meshBasicMaterial color="#7548b5" transparent opacity={0.48} toneMapped={false} />
        </mesh>
      )}
      {magic && (
        <mesh position={[0, 2.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[4.2, 0.055, 8, 56]} />
          <meshBasicMaterial color="#73e5ef" transparent opacity={0.38} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

export function BattleAtmosphere({ view, spotAt }: {
  view: BattleView | null
} & SpotProps) {
  if (!view) return null
  return (
    <group>
      <Weather weather={view.weather} />
      {Object.entries(view.active).map(([slot, mon]) => mon && (
        <StatusAura key={slot} mon={mon} position={spotAt(slot as SlotId)} />
      ))}
      <Barrier side="p1" conditions={view.sideConditions.p1} spotAt={spotAt} />
      <Barrier side="p2" conditions={view.sideConditions.p2} spotAt={spotAt} />
      <FieldConditions field={view.field} />
    </group>
  )
}
