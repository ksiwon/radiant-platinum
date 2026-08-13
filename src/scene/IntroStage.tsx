import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { assets, type AssetPath } from '../data/providers/assetProvider'
import { useIntroStageStore } from '../state/introStageStore'
import { loadMonModel, makeBody, play, type MonBody } from './battle/monModel'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { cinematicScale } from './cinematicMotion'
import { playerModelPath } from './playerModelPath'
import { NPC_BUNDLE } from '../engine/actor/npcModels'

const personLoader = new GLTFLoader()
const ALT_OUTFIT = ['hair2', 'shoes2']

function Person({
  path,
  position,
  selected = true,
}: {
  path: AssetPath
  position: readonly [number, number, number]
  selected?: boolean
}) {
  const wrapper = useRef<Group>(null)
  const host = useRef<Group>(null)
  const [model, setModel] = useState<Group | null>(null)

  useEffect(() => {
    let alive = true
    const provider = assets()
    void provider
      .objectUrl(path)
      .then(async (url) => {
        try {
          const gltf = await personLoader.loadAsync(url)
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
        /* fallback body remains */
      })
    return () => {
      alive = false
    }
  }, [path])

  useLayoutEffect(() => {
    if (wrapper.current && model) normalizeModel(wrapper.current, model, PLAYER_HEIGHT)
  }, [model])

  useFrame(({ clock }) => {
    if (!host.current) return
    host.current.position.y = Math.sin(clock.elapsedTime * 1.5 + position[0]) * 0.018
  })

  return (
    <group position={position} scale={selected ? 1 : 0.88}>
      <group ref={host}>
        <group ref={wrapper}>
          {model ? (
            <primitive object={model} />
          ) : (
            <group position={[0, 0.78, 0]}>
              <mesh castShadow>
                <capsuleGeometry args={[0.28, 0.82, 8, 18]} />
                <meshStandardMaterial color="#74849d" roughness={0.82} />
              </mesh>
              <mesh position={[0, 0.72, 0]} castShadow>
                <sphereGeometry args={[0.25, 16, 12]} />
                <meshStandardMaterial color="#e6c4a5" roughness={0.78} />
              </mesh>
            </group>
          )}
        </group>
      </group>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.49, 42]} />
        <meshBasicMaterial
          color={selected ? '#ffe8a6' : '#6f819e'}
          transparent
          opacity={selected ? 0.72 : 0.25}
        />
      </mesh>
    </group>
  )
}

function Buneary({ visible }: { visible: boolean }) {
  const host = useRef<Group>(null)
  const [body, setBody] = useState<MonBody | null>(null)
  const shown = useRef(0)

  useEffect(() => {
    let alive = true
    let made: MonBody | null = null
    void loadMonModel(427)
      .then((loaded) => {
        if (!alive || !loaded) return
        made = makeBody(loaded)
        play(made, 'wait')
        setBody(made)
      })
      .catch(() => {
        /* fallback remains */
      })
    return () => {
      alive = false
      made?.mixer.stopAllAction()
    }
  }, [])

  useFrame((_, delta) => {
    shown.current += ((visible ? 1 : 0) - shown.current) * Math.min(1, delta * 5.5)
    const node = host.current
    if (!node) return
    node.visible = shown.current > 0.01
    node.position.y = 0.34 + shown.current * 0.46
    node.scale.setScalar((body ? cinematicScale(body.tall) : 1) * shown.current)
    body?.mixer.update(delta)
  })

  return (
    <group ref={host} visible={false}>
      {body ? (
        <primitive object={body.root} />
      ) : (
        <group position={[0, 0.62, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.32, 0.62, 8, 16]} />
            <meshStandardMaterial color="#b88b62" roughness={0.82} />
          </mesh>
          <mesh position={[-0.18, 0.68, 0]} rotation={[0, 0, 0.22]} castShadow>
            <capsuleGeometry args={[0.11, 0.58, 6, 12]} />
            <meshStandardMaterial color="#d9b58e" roughness={0.8} />
          </mesh>
          <mesh position={[0.18, 0.68, 0]} rotation={[0, 0, -0.22]} castShadow>
            <capsuleGeometry args={[0.11, 0.58, 6, 12]} />
            <meshStandardMaterial color="#d9b58e" roughness={0.8} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function IntroBall({ opened }: { opened: boolean }) {
  const top = useRef<Group>(null)
  const bottom = useRef<Group>(null)
  useFrame((_, delta) => {
    const target = opened ? 1 : 0
    if (top.current)
      top.current.rotation.x += (target * -1.18 - top.current.rotation.x) * Math.min(1, delta * 7)
    if (bottom.current)
      bottom.current.rotation.x +=
        (target * 0.48 - bottom.current.rotation.x) * Math.min(1, delta * 7)
  })
  return (
    <group position={[0, 0.72, 0]} scale={0.72}>
      <group ref={top} position={[0, 0.02, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e54b50" roughness={0.34} />
        </mesh>
      </group>
      <group ref={bottom}>
        <mesh castShadow>
          <sphereGeometry args={[1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshStandardMaterial color="#f4f5f0" roughness={0.4} />
        </mesh>
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.93, 0.1, 8, 28]} />
        <meshStandardMaterial color="#16191d" roughness={0.5} />
      </mesh>
      <pointLight
        position={[0, 0.5, 1.2]}
        color="#fff2b2"
        intensity={opened ? 2.2 : 0.15}
        distance={5}
      />
    </group>
  )
}

/** Rowan intro rendered on the persistent 3D canvas after New Game is selected. */
export function IntroStage() {
  const scene = useIntroStageStore((state) => state.scene)
  const gender = useIntroStageStore((state) => state.gender)

  useEffect(() => {
    cinematicStage.active = true
    cinematicStage.position.set(
      CINEMATIC_ORIGIN.x,
      CINEMATIC_ORIGIN.y + 3.1,
      CINEMATIC_ORIGIN.z + 7.4,
    )
    cinematicStage.target.set(CINEMATIC_ORIGIN.x, CINEMATIC_ORIGIN.y + 1.05, CINEMATIC_ORIGIN.z)
    cinematicStage.fov = 38
    return () => {
      cinematicStage.active = false
    }
  }, [])

  const ball = scene === 'ball' || scene === 'buneary'
  return (
    <group position={CINEMATIC_ORIGIN}>
      <mesh position={[0, 3, -3.5]} scale={[17, 10, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#050914" fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6.8, 64]} />
        <meshStandardMaterial color="#101a31" roughness={0.9} fog={false} />
      </mesh>
      <hemisphereLight args={['#b8d4ff', '#21182e', 1.3]} />
      <directionalLight position={[-4, 7, 5]} intensity={1.85} color="#eaf2ff" castShadow />
      <pointLight position={[0, 2.4, 2.5]} intensity={0.65} color="#8cbcff" distance={8} />

      {scene === 'rowan' && <Person path={`models/npc/${NPC_BUNDLE.gentleman}.glb`} position={[0, 0, 0]} />}
      {scene === 'rival' && <Person path={`models/npc/${NPC_BUNDLE.rival}.glb`} position={[0, 0, 0]} />}
      {scene === 'player' && <Person path={playerModelPath(gender)} position={[0, 0, 0]} />}
      {scene === 'gender' && (
        <>
          <Person
            path={playerModelPath('boy')}
            position={[-1.15, 0, 0]}
            selected={gender === 'boy'}
          />
          <Person
            path={playerModelPath('girl')}
            position={[1.15, 0, 0]}
            selected={gender === 'girl'}
          />
        </>
      )}
      {ball && <IntroBall opened={scene === 'buneary'} />}
      <Buneary visible={scene === 'buneary'} />
    </group>
  )
}
