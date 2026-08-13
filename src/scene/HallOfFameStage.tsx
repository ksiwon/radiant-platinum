import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { assets } from '../data/providers/assetProvider'
import { type HallOfFameStagePhase, useHallOfFameStageStore } from '../state/hallOfFameStageStore'
import { loadMonModel, makeBody, play, type MonBody } from './battle/monModel'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { cinematicScale } from './cinematicMotion'
import { playerModelPath } from './playerModelPath'

const PARTY_POSITIONS = [
  [0, 0, -1.45],
  [-1.75, 0, -0.35],
  [1.75, 0, -0.35],
  [-2.65, 0, 1.25],
  [0, 0, 1.25],
  [2.65, 0, 1.25],
] as const

const CONFETTI_COLORS = ['#ff5f6d', '#ffd86f', '#6fd0ff', '#8bff9b', '#d99bff']
const ALT_OUTFIT = ['hair2', 'shoes2']
const playerLoader = new GLTFLoader()

function FallbackMon({ species }: { species: number }) {
  const hue = (species * 47) % 360
  const color = `hsl(${String(hue)} 48% 58%)`
  return (
    <group position={[0, 0.75, 0]}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <capsuleGeometry args={[0.46, 0.72, 8, 18]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.4, 18, 12]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
    </group>
  )
}

function HallMon({
  species,
  form,
  gender,
  shiny,
  position,
  visible,
  selected,
  phase,
}: {
  species: number
  form: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
  position: readonly [number, number, number]
  visible: boolean
  selected: boolean
  phase: HallOfFameStagePhase
}) {
  const group = useRef<Group>(null)
  const [body, setBody] = useState<MonBody | null>(null)
  const shown = useRef(0)

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
        /* 절차형 몸을 쓴다 */
      })
    return () => {
      alive = false
      made?.mixer.stopAllAction()
    }
  }, [species, form, gender, shiny])

  useEffect(() => {
    shown.current = 0
  }, [visible, phase])

  useFrame((state, delta) => {
    body?.mixer.update(delta)
    const node = group.current
    if (!node) return
    shown.current += ((visible ? 1 : 0) - shown.current) * Math.min(1, delta * 5.5)
    const appear = shown.current
    node.visible = appear > 0.01
    const base = body ? cinematicScale(body.tall) : 1
    node.scale.setScalar(base * appear * (selected ? 1.06 : 0.9))
    node.position.set(
      position[0],
      position[1] + Math.sin(state.clock.elapsedTime * 1.7 + species) * 0.025,
      position[2],
    )
  })

  return (
    <group ref={group} visible={false} position={position}>
      {body ? <primitive object={body.root} /> : <FallbackMon species={species} />}
      {selected && visible && (
        <>
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.72, 0.83, 48]} />
            <meshBasicMaterial color="#ffe68a" transparent opacity={0.82} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 1.5, 1]} color="#fff0a8" intensity={0.9} distance={4.5} />
        </>
      )}
    </group>
  )
}

function HallPlayer({ gender, visible }: { gender: 'boy' | 'girl'; visible: boolean }) {
  const wrapper = useRef<Group>(null)
  const [model, setModel] = useState<Group | null>(null)

  useEffect(() => {
    let alive = true
    const path = playerModelPath(gender)
    const provider = assets()
    void provider
      .objectUrl(path)
      .then(async (url) => {
        try {
          const gltf = await playerLoader.loadAsync(url)
          if (!alive) return
          const root = cloneSkinned(gltf.scene) as Group
          root.traverse((object: Object3D) => {
            if (ALT_OUTFIT.some((name) => object.name.includes(name))) object.visible = false
            if (!(object instanceof Mesh)) return
            object.castShadow = true
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            for (const material of materials) {
              if (!(material instanceof MeshStandardMaterial)) continue
              material.roughness = 0.85
              material.metalness = 0
            }
          })
          setModel(root)
        } finally {
          provider.releaseObjectUrl(path)
        }
      })
      .catch(() => {
        /* 플레이어만 없는 채로 포켓몬 장면은 계속 돈다 */
      })
    return () => {
      alive = false
    }
  }, [gender])

  useLayoutEffect(() => {
    if (wrapper.current && model) normalizeModel(wrapper.current, model, PLAYER_HEIGHT)
  }, [model])

  return (
    <group position={[0, 0, -2.85]} visible={visible}>
      <group ref={wrapper}>{model && <primitive object={model} />}</group>
      {visible && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.52, 0.6, 48]} />
          <meshBasicMaterial color="#9ed8ff" transparent opacity={0.72} />
        </mesh>
      )}
    </group>
  )
}

function SpotBeams() {
  return (
    <group>
      {[-3.8, -2.25, -0.75, 0.75, 2.25, 3.8].map((x, index) => (
        <group key={x} position={[x, 4.2, 0]} rotation={[0, 0, (x / 3.8) * 0.12]}>
          <mesh position={[0, -2.1, 0]}>
            <coneGeometry args={[1.05, 4.2, 20, 1, true]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? '#8fc5ff' : '#c5a8ff'}
              transparent
              opacity={0.055}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <pointLight
            position={[0, -1.9, 0.5]}
            color={index % 2 === 0 ? '#8fc5ff' : '#c5a8ff'}
            intensity={0.32}
            distance={4.5}
          />
        </group>
      ))}
    </group>
  )
}

function Confetti({ active }: { active: boolean }) {
  const refs = useRef<Array<Mesh | null>>([])
  const started = useRef(performance.now() / 1000)
  const bits = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        x: (((index * 37) % 97) / 97) * 8 - 4,
        z: (((index * 53) % 89) / 89) * 5 - 2.5,
        delay: (index % 12) * 0.09,
        speed: 1.35 + (index % 7) * 0.12,
      })),
    [],
  )

  useEffect(() => {
    started.current = performance.now() / 1000
  }, [active])

  useFrame(() => {
    const elapsed = performance.now() / 1000 - started.current
    refs.current.forEach((mesh, index) => {
      if (!mesh) return
      const bit = bits[index]!
      const t = Math.max(0, elapsed - bit.delay)
      mesh.visible = active && t > 0
      const fall = (t * bit.speed) % 5.8
      mesh.position.set(bit.x + Math.sin(t * 2 + index) * 0.25, 5.3 - fall, bit.z)
      mesh.rotation.set(t * (2 + (index % 3)), t * 3.1, t * 1.7)
    })
  })

  return (
    <group>
      {bits.map((_, index) => (
        <mesh
          key={index}
          ref={(node) => {
            refs.current[index] = node
          }}
          visible={false}
          scale={[0.075, 0.12, 0.018]}
        >
          <boxGeometry />
          <meshBasicMaterial color={CONFETTI_COLORS[index % CONFETTI_COLORS.length]} />
        </mesh>
      ))}
    </group>
  )
}

/** 등록 장면과 PC 재생 화면이 공유하는 실제 3D 명예의 전당 무대. */
export function HallOfFameStage() {
  const mode = useHallOfFameStageStore((state) => state.mode)
  const phase = useHallOfFameStageStore((state) => state.phase)
  const mons = useHallOfFameStageStore((state) => state.mons)
  const selected = useHallOfFameStageStore((state) => state.selected)
  const gender = useHallOfFameStageStore((state) => state.gender)

  useEffect(() => {
    cinematicStage.active = true
    cinematicStage.position.set(
      CINEMATIC_ORIGIN.x,
      CINEMATIC_ORIGIN.y + 4.1,
      CINEMATIC_ORIGIN.z + 10.5,
    )
    cinematicStage.target.set(CINEMATIC_ORIGIN.x, CINEMATIC_ORIGIN.y + 1.15, CINEMATIC_ORIGIN.z)
    cinematicStage.fov = 38
    return () => {
      cinematicStage.active = false
    }
  }, [])

  const solo = mode === 'ceremony' && phase === 'solo'
  const showParty = mode === 'archive' || phase === 'party' || phase === 'confetti'
  const showPlayer = mode === 'ceremony' && (phase === 'player' || showParty)

  return (
    <group position={CINEMATIC_ORIGIN}>
      <mesh position={[0, 3.4, -5.2]} scale={[19, 10, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#030712" fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 72]} />
        <meshStandardMaterial color="#101a32" roughness={0.88} metalness={0.08} fog={false} />
      </mesh>
      <hemisphereLight args={['#a9cfff', '#161022', 1.25]} />
      <directionalLight position={[-5, 8, 6]} intensity={1.5} color="#e2eeff" castShadow />
      <SpotBeams />

      {PARTY_POSITIONS.map(([x, , z], index) => (
        <mesh key={index} position={[x, 0.035, z]} receiveShadow>
          <cylinderGeometry args={[0.78, 0.9, 0.12, 40]} />
          <meshStandardMaterial
            color={index === selected ? '#436a9c' : '#202f4c'}
            roughness={0.55}
            metalness={0.22}
          />
        </mesh>
      ))}

      {mons.slice(0, 6).map((mon, index) => (
        <HallMon
          key={`${String(index)}-${String(mon.species)}-${String(mon.form)}`}
          species={mon.species}
          form={mon.form}
          gender={mon.gender}
          shiny={mon.shiny}
          position={solo && index === selected ? [0, 0, 0] : PARTY_POSITIONS[index]!}
          visible={(solo && index === selected) || showParty}
          selected={mode === 'archive' ? index === selected : solo && index === selected}
          phase={phase}
        />
      ))}
      <HallPlayer gender={gender} visible={showPlayer} />
      <Confetti active={mode === 'ceremony' && phase === 'confetti'} />
    </group>
  )
}
