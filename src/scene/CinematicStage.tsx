import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, PointLight } from 'three'
import { type EvolutionPhase, type HatchPhase, useCinematicStore } from '../state/cinematicStore'
import { loadMonModel, makeBody, play, type MonBody } from './battle/monModel'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { cinematicScale, evolutionPose, hatchPose } from './cinematicMotion'

function Model({
  species,
  form,
  gender,
  shiny,
}: {
  species: number
  form: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
}) {
  const [body, setBody] = useState<MonBody | null>(null)

  useEffect(() => {
    let alive = true
    let made: MonBody | null = null
    setBody(null)
    void loadMonModel(species, form, { gender, shiny })
      .then((loaded) => {
        if (!alive || !loaded) return
        made = makeBody(loaded)
        play(made, 'wait')
        setBody(made)
      })
      .catch(() => {
        /* 아래 절차형 몸으로 떨어진다 */
      })
    return () => {
      alive = false
      made?.mixer.stopAllAction()
    }
  }, [species, form, gender, shiny])

  useFrame((_, delta) => {
    body?.mixer.update(delta)
  })

  if (!body) return <FallbackModel species={species} />
  return (
    <group scale={cinematicScale(body.tall)}>
      <primitive object={body.root} />
    </group>
  )
}

/** 설치본에 해당 종 GLB가 없을 때도 2D로 돌아가지 않는 입체 실루엣. */
function FallbackModel({ species }: { species: number }) {
  const hue = (species * 47) % 360
  const color = `hsl(${String(hue)} 48% 58%)`
  return (
    <group position={[0, 0.72, 0]}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <capsuleGeometry args={[0.48, 0.72, 8, 18]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
      <mesh castShadow position={[-0.28, 1.03, 0]} rotation={[0, 0, 0.42]}>
        <coneGeometry args={[0.2, 0.55, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.28, 1.03, 0]} rotation={[0, 0, -0.42]}>
        <coneGeometry args={[0.2, 0.55, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  )
}

function Egg({ shell }: { shell: boolean }) {
  const spots = useMemo(
    () =>
      [
        [-0.38, 0.18, 0.68],
        [0.41, 0.32, 0.63],
        [-0.22, 0.72, 0.58],
        [0.32, 0.86, 0.5],
        [0.02, -0.12, 0.75],
      ] as const,
    [],
  )
  return (
    <group visible={shell}>
      <mesh castShadow position={[0, 0.88, 0]} scale={[0.82, 1.08, 0.82]}>
        <sphereGeometry args={[0.82, 36, 28]} />
        <meshStandardMaterial color="#fff8dc" roughness={0.62} />
      </mesh>
      {spots.map((spot, i) => (
        <mesh key={i} position={spot} scale={[0.22, 0.16, 0.06]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#80b4d8' : '#e7a6b7'} roughness={0.72} />
        </mesh>
      ))}
    </group>
  )
}

interface Fragment {
  angle: number
  speed: number
  size: number
  lift: number
}

function HatchFragments({ active }: { active: boolean }) {
  const refs = useRef<Array<Mesh | null>>([])
  const started = useRef(performance.now() / 1000)
  const fragments = useMemo<Fragment[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        angle: i * 2.399963,
        speed: 0.85 + (i % 5) * 0.13,
        size: 0.07 + (i % 3) * 0.025,
        lift: 1.1 + (i % 4) * 0.21,
      })),
    [],
  )

  useEffect(() => {
    started.current = performance.now() / 1000
  }, [active])

  useFrame(() => {
    const elapsed = performance.now() / 1000 - started.current
    const t = Math.min(1.4, elapsed)
    refs.current.forEach((mesh, i) => {
      if (!mesh) return
      const bit = fragments[i]!
      mesh.visible = active && elapsed < 1.45
      mesh.position.set(
        Math.cos(bit.angle) * bit.speed * t,
        0.9 + bit.lift * t - 1.5 * t * t,
        Math.sin(bit.angle) * bit.speed * t,
      )
      mesh.rotation.set(t * (i + 2), t * (i + 1.3), t * 2.1)
    })
  })

  return (
    <group>
      {fragments.map((bit, i) => (
        <mesh
          key={i}
          ref={(node) => {
            refs.current[i] = node
          }}
          visible={false}
          scale={bit.size}
        >
          <tetrahedronGeometry />
          <meshStandardMaterial color={i % 3 === 0 ? '#80b4d8' : '#fff8dc'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

/** 진화·부화를 별도 Canvas 없이 보여 주는 공용 3D 무대. */
export function CinematicStage() {
  const scene = useCinematicStore((s) => s.scene)
  const phase = useCinematicStore((s) => s.phase)
  const before = useCinematicStore((s) => s.before)
  const after = useCinematicStore((s) => s.after)
  const beforeRef = useRef<Group>(null)
  const afterRef = useRef<Group>(null)
  const eggRef = useRef<Group>(null)
  const lightRef = useRef<PointLight>(null)
  const started = useRef(performance.now() / 1000)
  const elapsed = useRef(0)

  useEffect(() => {
    cinematicStage.active = true
    cinematicStage.position.set(
      CINEMATIC_ORIGIN.x,
      CINEMATIC_ORIGIN.y + 2.5,
      CINEMATIC_ORIGIN.z + 7,
    )
    cinematicStage.target.set(CINEMATIC_ORIGIN.x, CINEMATIC_ORIGIN.y + 1.25, CINEMATIC_ORIGIN.z)
    return () => {
      cinematicStage.active = false
    }
  }, [])

  useEffect(() => {
    started.current = performance.now() / 1000
  }, [scene, phase])

  useFrame(() => {
    elapsed.current = performance.now() / 1000 - started.current
    const oldBody = beforeRef.current
    const newBody = afterRef.current
    const egg = eggRef.current

    if (scene === 'evolution') {
      const pose = evolutionPose(phase as EvolutionPhase, elapsed.current)
      if (oldBody) {
        oldBody.visible = pose.beforeVisible
        oldBody.scale.setScalar(pose.beforeScale)
      }
      if (newBody) {
        newBody.visible = pose.afterVisible
        newBody.scale.setScalar(pose.afterScale)
      }
      if (egg) egg.visible = false
      if (lightRef.current) lightRef.current.intensity = pose.light
    } else {
      const pose = hatchPose(phase as HatchPhase, elapsed.current)
      if (egg) {
        egg.visible = pose.shellVisible
        egg.rotation.z = pose.rock
        egg.position.y = pose.lift
      }
      if (oldBody) oldBody.visible = false
      if (newBody) {
        newBody.visible = phase === 'born'
        newBody.scale.setScalar(phase === 'born' ? Math.min(1, 0.28 + elapsed.current * 1.8) : 0)
      }
      if (lightRef.current) lightRef.current.intensity = phase === 'born' ? 1.5 : 0.35
    }
  })

  const born = scene === 'hatch' && phase === 'born'
  return (
    <group position={CINEMATIC_ORIGIN}>
      <mesh position={[0, 3.1, -2.4]} scale={[18, 10, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#060914" fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6.5, 64]} />
        <meshStandardMaterial color="#121a31" roughness={0.92} fog={false} />
      </mesh>
      <hemisphereLight args={['#a9c9ff', '#241b38', 1.35]} />
      <directionalLight position={[-4, 7, 5]} intensity={2.1} color="#e6efff" castShadow />
      <pointLight ref={lightRef} position={[0, 2, 2.2]} color="#fff4bd" distance={8} />

      <group ref={beforeRef} position={[0, 0, 0]}>
        {before && (
          <Model
            species={before.species}
            form={before.form}
            gender={before.gender}
            shiny={before.shiny}
          />
        )}
      </group>
      <group ref={afterRef} position={[0, 0, 0]} visible={false}>
        {after && (
          <Model
            species={after.species}
            form={after.form}
            gender={after.gender}
            shiny={after.shiny}
          />
        )}
      </group>
      <group ref={eggRef} position={[0, 0, 0]}>
        <Egg shell={scene === 'hatch' && phase === 'shaking'} />
      </group>
      <HatchFragments active={born} />

      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.05, 1.12, 64]} />
        <meshBasicMaterial
          color={scene === 'evolution' ? '#9ec6ff' : '#fff0a8'}
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  )
}
