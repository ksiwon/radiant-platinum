import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Material, Mesh, Vector3 } from 'three'
import { usePreviewStore } from '../state/previewStore'
import { loadMonModel, makeBody, play, type MonBody } from './battle/monModel'
import { previewModelScale, previewNdcY } from './pokemonPreview3d'

function cloneOverlayMaterials(root: Group): Material[] {
  const made: Material[] = []
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const clone = (material: Material): Material => {
      const next = material.clone()
      next.depthTest = false
      next.depthWrite = false
      made.push(next)
      return next
    }
    object.material = Array.isArray(object.material)
      ? object.material.map(clone)
      : clone(object.material)
    object.renderOrder = 950
  })
  return made
}

/** `DrawPokemonPreview`를 같은 Canvas 안의 실제 포켓몬 모델로 표시한다. */
export function PokemonPreviewStage() {
  const species = usePreviewStore((s) => s.species)
  const gender = usePreviewStore((s) => s.gender)
  const [body, setBody] = useState<MonBody | null>(null)
  const root = useRef<Group>(null)
  const aura = useRef<Mesh>(null)
  const ray = useMemo(() => new Vector3(), [])
  const direction = useMemo(() => new Vector3(), [])

  useEffect(() => {
    let alive = true
    let made: MonBody | null = null
    let materials: Material[] = []
    setBody(null)
    if (species === null) return
    const modelGender = gender === 1 ? 'female' : gender === 0 ? 'male' : 'genderless'
    void loadMonModel(species, 0, { gender: modelGender })
      .then((loaded) => {
        if (!alive || !loaded) return
        made = makeBody(loaded)
        materials = cloneOverlayMaterials(made.root)
        play(made, 'wait')
        setBody(made)
      })
      .catch(() => {
        /* 아래 절차형 몸이 대신 선다 */
      })
    return () => {
      alive = false
      made?.mixer.stopAllAction()
      materials.forEach((material) => {
        material.dispose()
      })
    }
  }, [species, gender])

  useFrame(({ camera, size, clock }, delta) => {
    body?.mixer.update(delta)
    const group = root.current
    if (!group || species === null) return
    ray.set(0, previewNdcY(size.height), 0).unproject(camera)
    direction.copy(ray).sub(camera.position).normalize()
    group.position.copy(camera.position).addScaledVector(direction, 4)
    group.rotation.y = Math.atan2(
      camera.position.x - group.position.x,
      camera.position.z - group.position.z,
    )
    group.position.y += Math.sin(clock.elapsedTime * 2.4) * 0.025
    const halo = aura.current
    if (halo) {
      halo.rotation.z = clock.elapsedTime * 0.45
      halo.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.1) * 0.05)
    }
  })

  if (species === null) return null
  const scale = body ? previewModelScale(body.tall) : 0.5
  return (
    <group ref={root} renderOrder={900}>
      <group position={[0, -0.26, 0]} scale={scale}>
        {body ? <primitive object={body.root} /> : <PreviewFallback species={species} />}
      </group>
      <mesh ref={aura} position={[0, 0, -0.08]} renderOrder={900}>
        <ringGeometry args={[0.31, 0.34, 48]} />
        <meshBasicMaterial
          color="#c9ddff"
          transparent
          opacity={0.46}
          depthTest={false}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <pointLight position={[0.4, 0.55, 0.8]} intensity={1.7} distance={2.5} color="#e8f1ff" />
    </group>
  )
}

function PreviewFallback({ species }: { species: number }) {
  const hue = (species * 47) % 360
  return (
    <group position={[0, 0.52, 0]}>
      <mesh renderOrder={950}>
        <capsuleGeometry args={[0.38, 0.58, 8, 16]} />
        <meshBasicMaterial
          color={`hsl(${String(hue)} 52% 62%)`}
          depthTest={false}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  )
}
