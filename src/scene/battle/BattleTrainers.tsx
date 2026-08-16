import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { WebGPURenderer } from 'three/webgpu'
import { warmBeforeShow } from '../warmPipelines'
import { assets, type AssetPath } from '../../data/providers/assetProvider'
import { normalizeModel, PLAYER_HEIGHT } from '../../engine/model/normalize'
import type { BattleView } from '../../engine/battle/view'
import { useBattleStore } from '../../state/battleStore'
import { useSaveStore } from '../../state/saveStore'
import { playerModelPath } from '../playerModelPath'
import { trainerThrowOrigin } from './battleBallMotion'
import { trainerFallbackPalette } from './battleTrainerVisual'
import { trainerModelBundle } from '../../engine/actor/npcModels'

const loader = new GLTFLoader()
const SECONDARY_OUTFIT = ['hair2', 'shoes2']

function throwKey(view: BattleView | null, mine: boolean): string {
  if (!view) return ''
  const side = mine ? 'p1' : 'p2'
  return [view.active[`${side}a`]?.key ?? '', view.active[`${side}b`]?.key ?? ''].join('/')
}

function ProceduralTrainer({ trainerClass }: { trainerClass: number | null }) {
  const palette = trainerFallbackPalette(trainerClass)
  const arm = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (arm.current) arm.current.rotation.x = Math.sin(clock.elapsedTime * 1.4) * 0.035
  })
  return (
    <group>
      <mesh position={[0, 1.03, 0]} castShadow>
        <capsuleGeometry args={[0.21, 0.52, 6, 12]} />
        <meshStandardMaterial color={palette.cloth} roughness={0.82} />
      </mesh>
      <mesh position={[0, 1.63, 0]} castShadow>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial color="#ddb99a" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.73, -0.04]} scale={[1.04, 0.72, 1]} castShadow>
        <sphereGeometry args={[0.255, 16, 10]} />
        <meshStandardMaterial color={palette.hair} roughness={0.9} />
      </mesh>
      <group ref={arm} position={[0.28, 1.3, 0]} rotation={[0, 0, -0.18]}>
        <mesh position={[0, -0.23, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.36, 4, 8]} />
          <meshStandardMaterial color={palette.accent} roughness={0.82} />
        </mesh>
      </group>
      <group position={[-0.28, 1.3, 0]} rotation={[0, 0, 0.18]}>
        <mesh position={[0, -0.23, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.36, 4, 8]} />
          <meshStandardMaterial color={palette.accent} roughness={0.82} />
        </mesh>
      </group>
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.49, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.5, 4, 8]} />
          <meshStandardMaterial color="#293142" roughness={0.88} />
        </mesh>
      ))}
    </group>
  )
}

function TrainerActor({
  path,
  trainerClass,
  mine,
  view,
}: {
  path: AssetPath | null
  trainerClass: number | null
  mine: boolean
  view: BattleView | null
}) {
  const host = useRef<Group>(null)
  const wrapper = useRef<Group>(null)
  const [model, setModel] = useState<Group | null>(null)
  const seen = useRef('')
  const gestureStarted = useRef(-100)
  const origin = trainerThrowOrigin(mine ? 'p1a' : 'p2a')
  const facing = Math.atan2(-origin[0], -origin[2])
  const key = throwKey(view, mine)

  useEffect(() => {
    if (!key || key === seen.current) return
    seen.current = key
    gestureStarted.current = performance.now() / 1000
  }, [key])

  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer
  const r3fScene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    let alive = true
    setModel(null)
    if (!path)
      return () => {
        alive = false
      }
    const provider = assets()
    void provider
      .objectUrl(path)
      .then(async (url) => {
        try {
          const gltf = await loader.loadAsync(url)
          if (!alive) return
          const root = cloneSkinned(gltf.scene) as Group
          root.traverse((object: Object3D) => {
            if (SECONDARY_OUTFIT.some((part) => object.name.includes(part))) object.visible = false
            if (object instanceof Mesh) object.castShadow = true
          })
          // ⚠️ **굽고 나서 세운다.** 스킨 사람 하나에 정점 프로그램 하나고, 그
          // 링크 확인이 ANGLE에서 100ms 넘게 막는다 (`warmPipelines`). 트레이너전은
          // 둘이 한꺼번에 서므로 그대로 두면 두 배로 쌓인다
          await warmBeforeShow(gl, r3fScene, camera, root)
          if (!alive) return
          setModel(root)
        } finally {
          provider.releaseObjectUrl(path)
        }
      })
      .catch(() => {
        /* The procedural trainer remains visible when an optional class model is absent. */
      })
    return () => {
      alive = false
    }
  }, [path, gl, r3fScene, camera])

  useLayoutEffect(() => {
    if (wrapper.current && model) normalizeModel(wrapper.current, model, PLAYER_HEIGHT)
  }, [model])

  useFrame(({ clock }) => {
    const node = host.current
    if (!node) return
    const elapsed = performance.now() / 1000 - gestureStarted.current
    const throwAmount = elapsed >= 0 && elapsed < 0.72 ? Math.sin((elapsed / 0.72) * Math.PI) : 0
    node.position.y = Math.sin(clock.elapsedTime * 1.2 + (mine ? 0 : 2.1)) * 0.012
    node.rotation.x = -throwAmount * 0.2
    node.rotation.z = (mine ? -1 : 1) * throwAmount * 0.14
  })

  return (
    <group position={[origin[0], 0, origin[2]]} rotation={[0, facing, 0]}>
      <group ref={host}>
        <group ref={wrapper}>
          {model ? <primitive object={model} /> : <ProceduralTrainer trainerClass={trainerClass} />}
        </group>
      </group>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.43, 36]} />
        <meshBasicMaterial color={mine ? '#75bfff' : '#ff8a91'} transparent opacity={0.32} />
      </mesh>
    </group>
  )
}

/** Player and opponent bodies placed behind their Pokémon on the 3D battle arena. */
export function BattleTrainers() {
  const kind = useBattleStore((state) => state.kind)
  const trainerClass = useBattleStore((state) => state.trainerClass)
  const view = useBattleStore((state) => state.view)
  const gender = useSaveStore((state) => state.trainer.gender)
  const opponentPath = useMemo<AssetPath | null>(() => {
    const bundle = trainerModelBundle(trainerClass)
    return bundle ? `models/npc/${bundle}.glb` : null
  }, [trainerClass])

  return (
    <>
      <TrainerActor path={playerModelPath(gender)} trainerClass={null} mine view={view} />
      {kind === 'trainer' && (
        <TrainerActor path={opponentPath} trainerClass={trainerClass} mine={false} view={view} />
      )}
    </>
  )
}
