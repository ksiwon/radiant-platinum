import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { SLOTS, type SlotId } from '../../engine/battle/events'
import type { BattleView } from '../../engine/battle/view'
import {
  CAPTURE_SEAL_TIME,
  CAPTURE_SHAKE_START,
  CAPTURE_THROW_TIME,
  ballPalette,
  ballShakeAngle,
  captureDuration,
  captureResolveAt,
  throwArc,
  trainerThrowOrigin,
  type Point3,
} from './battleBallMotion'

type BallShot = {
  id: number
  kind: 'send' | 'capture'
  slot: SlotId
  ball: number
  shakes: number
  caught: boolean
  replacement: boolean
  started: number
}

const SEND_THROW_TIME = 0.48
const SEND_RECALL_TIME = 0.3
const SEND_DURATION = 1.08
let nextShotId = 1

const SPARKS: readonly Point3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0.72, 0.72, 0],
  [-0.72, 0.72, 0],
  [0.72, -0.72, 0],
  [-0.72, -0.72, 0],
]

function nowSeconds(): number {
  return performance.now() / 1000
}

function shotDuration(shot: BallShot): number {
  return shot.kind === 'capture' ? captureDuration(shot.shakes, shot.caught) : SEND_DURATION
}

function BallModel({ ball }: { ball: number }) {
  const palette = useMemo(() => ballPalette(ball), [ball])
  return (
    <group scale={0.3}>
      <mesh castShadow>
        <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={palette.top}
          roughness={0.32}
          metalness={0.12}
          emissive={palette.accent}
          emissiveIntensity={0.08}
        />
      </mesh>
      <mesh castShadow>
        <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color={palette.bottom} roughness={0.4} metalness={0.06} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.93, 0.1, 8, 28]} />
        <meshStandardMaterial color="#17191c" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.96]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.12, 20]} />
        <meshStandardMaterial color="#15171a" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0, 1.04]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 20]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.accent}
          emissiveIntensity={0.28}
        />
      </mesh>
    </group>
  )
}

function Flash({ innerRef, color }: { innerRef: React.RefObject<Group | null>; color: string }) {
  return (
    <group ref={innerRef} visible={false}>
      <mesh>
        <sphereGeometry args={[0.6, 16, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.42} depthWrite={false} />
      </mesh>
      {SPARKS.map(([x, y, z], index) => (
        <mesh key={index} position={[x * 0.72, y * 0.72, z]}>
          <sphereGeometry args={[0.08, 8, 6]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function ShotVisual({
  shot,
  spotAt,
}: {
  shot: BallShot
  spotAt: (slot: SlotId) => [number, number]
}) {
  const ball = useRef<Group>(null)
  const flash = useRef<Group>(null)
  const recall = useRef<Group>(null)
  const [x, z] = spotAt(shot.slot)
  const target = useMemo<Point3>(() => [x, 1.2, z], [x, z])
  const source = trainerThrowOrigin(shot.kind === 'capture' ? 'p1a' : shot.slot)
  const resultAt = captureResolveAt(shot.shakes)

  useFrame(() => {
    const elapsed = nowSeconds() - shot.started
    const b = ball.current
    const burst = flash.current
    const beam = recall.current
    if (!b || !burst) return

    b.visible = elapsed >= 0 && elapsed <= shotDuration(shot)
    burst.visible = false
    if (beam) beam.visible = false

    if (shot.kind === 'send') {
      const begin = shot.replacement ? SEND_RECALL_TIME : 0
      if (beam && shot.replacement && elapsed < SEND_RECALL_TIME) {
        beam.visible = true
        const k = Math.max(0.05, elapsed / SEND_RECALL_TIME)
        beam.scale.setScalar(0.65 + Math.sin(k * Math.PI) * 0.5)
      }
      if (elapsed < begin) {
        b.visible = false
        return
      }
      const flight = Math.min(1, (elapsed - begin) / SEND_THROW_TIME)
      b.position.set(...throwArc(source, target, flight, 2.05))
      b.rotation.set(flight * Math.PI * 4, flight * Math.PI * 3, flight * Math.PI * 2)
      const landed = elapsed - begin - SEND_THROW_TIME
      if (landed >= 0) {
        const shrink = Math.max(0, 1 - landed / 0.16)
        b.scale.setScalar(shrink)
        burst.visible = landed < 0.34
        burst.position.set(x, 1.1, z)
        burst.scale.setScalar(0.35 + Math.min(1, landed / 0.34) * 1.5)
      }
      return
    }

    if (elapsed < CAPTURE_THROW_TIME) {
      const flight = elapsed / CAPTURE_THROW_TIME
      b.position.set(...throwArc(source, target, flight, 2.5))
    } else if (elapsed < CAPTURE_SEAL_TIME) {
      const drop = (elapsed - CAPTURE_THROW_TIME) / (CAPTURE_SEAL_TIME - CAPTURE_THROW_TIME)
      b.position.set(x, 1.2 - drop * 0.86, z)
    } else {
      b.position.set(x, 0.34, z)
    }
    b.scale.setScalar(1)
    b.rotation.x = elapsed * 5
    b.rotation.y = elapsed * 3
    b.rotation.z = ballShakeAngle(elapsed, shot.shakes)

    const sealedFor = elapsed - CAPTURE_THROW_TIME
    const resolvedFor = elapsed - resultAt
    if ((sealedFor >= 0 && sealedFor < 0.26) || (resolvedFor >= 0 && resolvedFor < 0.38)) {
      burst.visible = true
      burst.position.set(x, sealedFor < 0.26 ? 1.05 : 0.45, z)
      const life = sealedFor < 0.26 ? sealedFor / 0.26 : resolvedFor / 0.38
      burst.scale.setScalar(0.3 + life * (shot.caught ? 1.7 : 1.25))
      burst.rotation.y = elapsed * 4
    }
    if (!shot.caught && elapsed > resultAt + 0.18) b.visible = false
    if (shot.caught && elapsed > CAPTURE_SHAKE_START) {
      b.position.y += Math.max(0, Math.sin((elapsed - resultAt) * Math.PI) * 0.08)
    }
  })

  const flashColor = shot.kind === 'send' ? '#d8f5ff' : shot.caught ? '#ffe36d' : '#ff7d74'
  return (
    <group>
      <group ref={ball}>
        <BallModel ball={shot.ball} />
      </group>
      <Flash innerRef={flash} color={flashColor} />
      {shot.replacement && (
        <group ref={recall} position={[x, 1.1, z]} visible={false}>
          <mesh>
            <coneGeometry args={[0.85, 2.2, 18, 1, true]} />
            <meshBasicMaterial
              color="#8fe9ff"
              transparent
              opacity={0.2}
              depthWrite={false}
              side={2}
            />
          </mesh>
          <mesh position={[0, -1.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.65, 0.06, 8, 24]} />
            <meshBasicMaterial color="#b9f3ff" toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  )
}

export function BattleBallEffects({
  view,
  spotAt,
}: {
  view: BattleView | null
  spotAt: (slot: SlotId) => [number, number]
}) {
  const [shots, setShots] = useState<BallShot[]>([])
  const activeKeys = useRef<Record<SlotId, string | null> | null>(null)
  const seenBall = useRef(0)

  useEffect(() => {
    if (!view) {
      activeKeys.current = null
      return
    }
    const current: Record<SlotId, string | null> = {
      p1a: view.active.p1a?.key ?? null,
      p1b: view.active.p1b?.key ?? null,
      p2a: view.active.p2a?.key ?? null,
      p2b: view.active.p2b?.key ?? null,
    }
    const previous = activeKeys.current
    activeKeys.current = current
    const started = nowSeconds()
    const added = SLOTS.flatMap((slot): BallShot[] => {
      if (!current[slot] || current[slot] === previous?.[slot]) return []
      return [
        {
          id: nextShotId++,
          kind: 'send',
          slot,
          ball: 4,
          shakes: 0,
          caught: false,
          replacement: previous?.[slot] != null,
          started,
        },
      ]
    })
    if (added.length > 0) {
      setShots((old) =>
        [...old.filter((shot) => started - shot.started < shotDuration(shot)), ...added].slice(-12),
      )
    }
  }, [view])

  useEffect(() => {
    const event = view?.lastBall
    if (!event || event.seq === seenBall.current) return
    seenBall.current = event.seq
    const started = nowSeconds()
    const shot: BallShot = {
      id: nextShotId++,
      kind: 'capture',
      slot: event.slot,
      ball: event.ball,
      shakes: event.shakes,
      caught: event.caught,
      replacement: false,
      started,
    }
    setShots((old) =>
      [...old.filter((item) => started - item.started < shotDuration(item)), shot].slice(-12),
    )
  }, [view?.lastBall])

  return (
    <group>
      {shots.map((shot) => (
        <ShotVisual key={shot.id} shot={shot} spotAt={spotAt} />
      ))}
    </group>
  )
}
