import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshStandardMaterial, Quaternion, Vector3, type Group, type Mesh } from 'three'
import { CAST_FRAMES, REEL_FRAMES, type FishingPhase } from '../engine/actor/fishing'
import { worldState, type FieldActionFxKind } from '../state/worldState'
import { tickFlyTransition } from './flyTransition'
import { fishing } from './fishingSystem'
import { loadMonModel, makeBody, play, type MonBody } from './battle/monModel'

interface Props {
  /** 정규화된 주인공 본체. 서핑 중 탈것 위로 살짝 들어 올린다. */
  bodyRef: RefObject<Group | null>
}

const Y_AXIS = new Vector3(0, 1, 0)
const start = new Vector3()
const end = new Vector3()
const direction = new Vector3()
const turn = new Quaternion()

const FIELD_COLORS: Readonly<Record<FieldActionFxKind, string>> = {
  cut: '#8df06c',
  rockSmash: '#e49c62',
  strength: '#f3c45b',
  surf: '#65d5ff',
  waterfall: '#8de6ff',
  rockClimb: '#d8a06a',
}

function unitProgress(frames: number, total: number): number {
  return Math.max(0, Math.min(1, frames / total))
}

/** 낚싯대가 단계마다 따라갈 각도. 렌더러와 무관하게 검증할 수 있다. */
export function fishingRodPitch(phase: FishingPhase, frames: number): number {
  if (phase === 'cast') {
    const t = unitProgress(frames, CAST_FRAMES)
    return 0.25 + Math.sin(t * Math.PI) * 0.9 + t * 0.8
  }
  if (phase === 'wait' || phase === 'bite') return 1.05
  if (phase === 'reel') return 1.05 - unitProgress(frames, REEL_FRAMES) * 0.8
  return 0.25
}

function alignCylinder(mesh: Mesh, from: Vector3, to: Vector3): void {
  direction.subVectors(to, from)
  const length = direction.length()
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.scale.set(1, length, 1)
  if (length > 0.0001) {
    turn.setFromUnitVectors(Y_AXIS, direction.multiplyScalar(1 / length))
    mesh.quaternion.copy(turn)
  }
}

/**
 * 필드 행동을 화면 위 기호가 아니라 플레이어와 같은 3D 공간에 그린다.
 * 실제 규칙은 기존 시스템에 남고, 이 컴포넌트는 짧은 시각 피드백만 소비한다.
 */
export function FieldActionEffects({ bodyRef }: Props) {
  const surfRef = useRef<Group>(null)
  const surfFallbackRef = useRef<Group>(null)
  const surfModelHostRef = useRef<Group>(null)
  const surfBodyRef = useRef<MonBody | null>(null)
  const flyRef = useRef<Group>(null)
  const flyFallbackRef = useRef<Group>(null)
  const flyModelHostRef = useRef<Group>(null)
  const flyBodyRef = useRef<MonBody | null>(null)
  const flyWingLeftRef = useRef<Mesh>(null)
  const flyWingRightRef = useRef<Mesh>(null)
  const flyRingRef = useRef<Mesh>(null)
  const waveARef = useRef<Mesh>(null)
  const waveBRef = useRef<Mesh>(null)
  const fishingRef = useRef<Group>(null)
  const rodRef = useRef<Group>(null)
  const lineRef = useRef<Mesh>(null)
  const bobberRef = useRef<Group>(null)
  const biteRef = useRef<Group>(null)
  const actionRef = useRef<Group>(null)
  const actionRingRef = useRef<Mesh>(null)
  const actionParticlesRef = useRef<Group>(null)
  const lastActionRef = useRef<FieldActionFxKind | null>(null)
  const actionMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: FIELD_COLORS.cut,
        emissive: FIELD_COLORS.cut,
        emissiveIntensity: 0.35,
      }),
    [],
  )
  const particles = useMemo(() => Array.from({ length: 12 }, (_, index) => index), [])

  useEffect(
    () => () => {
      actionMaterial.dispose()
    },
    [actionMaterial],
  )

  useEffect(() => {
    let alive = true
    void loadMonModel(400).then((loaded) => {
      if (!alive || !loaded || !surfModelHostRef.current) return
      const body = makeBody(loaded)
      body.root.scale.setScalar(0.76 / Math.max(0.1, body.tall))
      body.root.position.set(0, 0.08, -0.12)
      body.root.rotation.y = Math.PI
      surfModelHostRef.current.add(body.root)
      surfBodyRef.current = body
      if (surfFallbackRef.current) surfFallbackRef.current.visible = false
      play(body, 'wait')
    })
    return () => {
      alive = false
      const body = surfBodyRef.current
      if (body) {
        body.mixer.stopAllAction()
        body.root.removeFromParent()
      }
      surfBodyRef.current = null
    }
  }, [])

  useEffect(() => {
    let alive = true
    void loadMonModel(398).then((loaded) => {
      if (!alive || !loaded || !flyModelHostRef.current) return
      const body = makeBody(loaded)
      body.root.scale.setScalar(1.35 / Math.max(0.1, body.tall))
      body.root.position.set(0, -0.18, 0)
      flyModelHostRef.current.add(body.root)
      flyBodyRef.current = body
      if (flyFallbackRef.current) flyFallbackRef.current.visible = false
      play(body, 'wait')
    })
    return () => {
      alive = false
      const body = flyBodyRef.current
      if (body) {
        body.mixer.stopAllAction()
        body.root.removeFromParent()
      }
      flyBodyRef.current = null
    }
  }, [])

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime
    const surfing = worldState.player.surfing
    const flyPose = tickFlyTransition(delta)
    if (flyRef.current) {
      flyRef.current.visible = flyPose.visible
      flyRef.current.position.y = flyPose.birdLift
      flyRef.current.rotation.z = Math.sin(time * 3.2) * 0.035
    }
    if (flyWingLeftRef.current) flyWingLeftRef.current.rotation.z = 0.35 + flyPose.wing
    if (flyWingRightRef.current) flyWingRightRef.current.rotation.z = -0.35 - flyPose.wing
    if (flyRingRef.current) {
      flyRingRef.current.visible = flyPose.visible
      flyRingRef.current.scale.setScalar(0.4 + flyPose.ring * 1.6)
      flyRingRef.current.rotation.z = time * 1.8
    }
    const flyBody = flyBodyRef.current
    if (flyBody && flyPose.visible) flyBody.mixer.update(delta)

    const surf = surfRef.current
    if (surf) surf.visible = surfing
    const body = bodyRef.current
    if (body) {
      const targetY = flyPose.visible ? flyPose.playerLift : surfing ? 0.43 : 0
      body.position.y += (targetY - body.position.y) * Math.min(1, delta * 9)
    }
    const surfBody = surfBodyRef.current
    if (surfBody && surfing) surfBody.mixer.update(delta)
    if (waveARef.current) {
      const phase = (time * 0.85) % 1
      waveARef.current.scale.setScalar(0.75 + phase * 0.65)
      waveARef.current.rotation.z = time * 0.35
    }
    if (waveBRef.current) {
      const phase = (time * 0.85 + 0.5) % 1
      waveBRef.current.scale.setScalar(0.75 + phase * 0.65)
      waveBRef.current.rotation.z = -time * 0.3
    }

    const state = fishing.state
    const showingRod = state !== null && state.phase !== 'message' && state.phase !== 'done'
    if (fishingRef.current) fishingRef.current.visible = showingRod
    if (state && showingRod) {
      const pitch = fishingRodPitch(state.phase, state.frames)
      if (rodRef.current) rodRef.current.rotation.x = pitch
      const castT = state.phase === 'cast' ? unitProgress(state.frames, CAST_FRAMES) : 1
      const reelT = state.phase === 'reel' ? unitProgress(state.frames, REEL_FRAMES) : 0
      const travel = Math.max(0, castT - reelT)
      const bobberZ = 0.35 + travel * 1.38
      const bobberY = 0.2 + Math.sin(castT * Math.PI) * 0.65 + reelT * 0.5
      if (bobberRef.current) {
        bobberRef.current.position.set(0.38, bobberY, bobberZ)
        bobberRef.current.rotation.y = time * 1.5
      }
      if (lineRef.current) {
        start.set(0.38, 1.02 + Math.cos(pitch) * 0.88, 0.02 + Math.sin(pitch) * 0.88)
        end.set(0.38, bobberY + 0.08, bobberZ)
        alignCylinder(lineRef.current, start, end)
      }
      if (biteRef.current) {
        biteRef.current.visible = state.phase === 'bite'
        biteRef.current.position.y = 1.05 + Math.sin(time * 13) * 0.08
      }
    }

    const fx = worldState.player.fieldAction
    if (fx.kind !== null) {
      fx.elapsed += delta
      if (fx.elapsed >= fx.duration) {
        fx.kind = null
        fx.elapsed = 0
        fx.duration = 0
      }
    }
    const kind = fx.kind
    if (actionRef.current) actionRef.current.visible = kind !== null
    if (kind === null) return
    if (lastActionRef.current !== kind) {
      actionMaterial.color.set(FIELD_COLORS[kind])
      actionMaterial.emissive.set(FIELD_COLORS[kind])
      lastActionRef.current = kind
    }
    const progress = fx.duration > 0 ? unitProgress(fx.elapsed, fx.duration) : 1
    if (actionRingRef.current) {
      actionRingRef.current.scale.setScalar(0.25 + progress * 1.35)
      actionRingRef.current.rotation.z = time * 2.7
    }
    const cloud = actionParticlesRef.current
    if (cloud) {
      cloud.rotation.y = time * (kind === 'cut' ? 4 : 1.8)
      cloud.position.y = kind === 'waterfall' || kind === 'rockClimb' ? progress * 1.1 : 0
      for (let index = 0; index < cloud.children.length; index += 1) {
        const particle = cloud.children[index]!
        const angle = (index / cloud.children.length) * Math.PI * 2 + progress * 2.5
        const radius = 0.18 + progress * (0.65 + (index % 3) * 0.08)
        particle.position.set(
          Math.cos(angle) * radius,
          0.15 + Math.sin(progress * Math.PI) * (0.35 + (index % 2) * 0.2),
          Math.sin(angle) * radius,
        )
        particle.rotation.set(time * 3 + index, time * 2, angle)
      }
    }
  })

  return (
    <>
      <group ref={surfRef} visible={false} position={[0, -0.03, 0]}>
        <group ref={flyRef} visible={false}>
          <group ref={flyModelHostRef} />
          <group ref={flyFallbackRef} position={[0, -0.18, 0]}>
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
              <capsuleGeometry args={[0.28, 0.9, 7, 16]} />
              <meshStandardMaterial color="#6e7481" roughness={0.82} />
            </mesh>
            <mesh castShadow position={[0, 0.18, 0.52]}>
              <sphereGeometry args={[0.26, 16, 11]} />
              <meshStandardMaterial color="#e5e0d4" roughness={0.75} />
            </mesh>
            <mesh castShadow position={[0, 0.17, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.1, 0.3, 10]} />
              <meshStandardMaterial color="#e4be54" roughness={0.62} />
            </mesh>
            <mesh ref={flyWingLeftRef} position={[-0.58, 0.02, 0]} castShadow>
              <boxGeometry args={[0.95, 0.08, 0.42]} />
              <meshStandardMaterial color="#3f4653" roughness={0.86} />
            </mesh>
            <mesh ref={flyWingRightRef} position={[0.58, 0.02, 0]} castShadow>
              <boxGeometry args={[0.95, 0.08, 0.42]} />
              <meshStandardMaterial color="#3f4653" roughness={0.86} />
            </mesh>
            <mesh position={[0, -0.05, -0.62]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.25, 0.7, 4]} />
              <meshStandardMaterial color="#f1eee5" roughness={0.82} />
            </mesh>
          </group>
          <mesh ref={flyRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]}>
            <torusGeometry args={[0.62, 0.035, 8, 36]} />
            <meshBasicMaterial color="#d7f4ff" transparent opacity={0.68} depthWrite={false} />
          </mesh>
          {[-1, 0, 1].map((offset) => (
            <mesh
              key={offset}
              position={[offset * 0.5, -0.2, -0.35 + Math.abs(offset) * 0.18]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <torusGeometry args={[0.24 + Math.abs(offset) * 0.08, 0.018, 6, 24]} />
              <meshBasicMaterial color="#a7eaff" transparent opacity={0.46} depthWrite={false} />
            </mesh>
          ))}
        </group>
        <group ref={surfModelHostRef} />
        <group ref={surfFallbackRef} position={[0, 0.16, -0.08]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.24, 0.48, 6, 12]} />
            <meshStandardMaterial color="#8b6b4d" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.12, 0.35]} castShadow>
            <sphereGeometry args={[0.25, 14, 10]} />
            <meshStandardMaterial color="#a98762" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.2, 0.54]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.12, 0.28, 10]} />
            <meshStandardMaterial color="#463326" roughness={0.9} />
          </mesh>
        </group>
        <mesh ref={waveARef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <torusGeometry args={[0.52, 0.035, 8, 32]} />
          <meshStandardMaterial color="#7ce8ff" emissive="#3fc9ff" emissiveIntensity={0.45} />
        </mesh>
        <mesh ref={waveBRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <torusGeometry args={[0.38, 0.022, 8, 28]} />
          <meshStandardMaterial color="#d2f8ff" emissive="#64ddff" emissiveIntensity={0.35} />
        </mesh>
      </group>

      <group ref={fishingRef} visible={false}>
        <group ref={rodRef} position={[0.38, 1.02, 0.02]}>
          <mesh position={[0, 0.44, 0]} castShadow>
            <cylinderGeometry args={[0.018, 0.028, 0.88, 8]} />
            <meshStandardMaterial color="#7b4e2d" roughness={0.68} />
          </mesh>
          <mesh position={[0, 0.05, 0.045]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.065, 0.018, 8, 16]} />
            <meshStandardMaterial color="#d7b65b" metalness={0.35} roughness={0.45} />
          </mesh>
        </group>
        <mesh ref={lineRef}>
          <cylinderGeometry args={[0.006, 0.006, 1, 5]} />
          <meshStandardMaterial color="#eefaff" roughness={0.45} />
        </mesh>
        <group ref={bobberRef}>
          <mesh castShadow>
            <sphereGeometry args={[0.075, 12, 8]} />
            <meshStandardMaterial color="#fff7e4" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.04, 0]}>
            <sphereGeometry args={[0.077, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#ef5252" roughness={0.58} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.075, 0]}>
            <torusGeometry args={[0.12, 0.015, 7, 20]} />
            <meshStandardMaterial color="#81e9ff" emissive="#39cfff" emissiveIntensity={0.5} />
          </mesh>
          <group ref={biteRef} position={[0, 1.05, 0]} visible={false}>
            <mesh position={[0, 0.2, 0]} castShadow>
              <boxGeometry args={[0.09, 0.36, 0.09]} />
              <meshStandardMaterial color="#ffe44f" emissive="#ffb52f" emissiveIntensity={0.65} />
            </mesh>
            <mesh castShadow>
              <sphereGeometry args={[0.07, 10, 8]} />
              <meshStandardMaterial color="#ffe44f" emissive="#ffb52f" emissiveIntensity={0.65} />
            </mesh>
          </group>
        </group>
      </group>

      <group ref={actionRef} visible={false} position={[0, 0.25, 0.82]}>
        <mesh ref={actionRingRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.045, 8, 28]} />
          <primitive object={actionMaterial} attach="material" />
        </mesh>
        <group ref={actionParticlesRef}>
          {particles.map((index) => (
            <mesh key={index} scale={index % 3 === 0 ? 0.13 : 0.09} castShadow>
              {index % 2 === 0 ? (
                <octahedronGeometry args={[1, 0]} />
              ) : (
                <boxGeometry args={[1.2, 0.35, 0.35]} />
              )}
              <primitive object={actionMaterial} attach="material" />
            </mesh>
          ))}
        </group>
      </group>
    </>
  )
}
