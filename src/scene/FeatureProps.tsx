// 장치가 움직이는 소품을 그린다 (PARITY §7.12)
//
// 청크가 그리는 소품 목록에서 빼고 여기서 따로 세운다 (`featureProps.ts` 머리말).
//
// ⚠️ **목록을 프레임마다 묻는다.** 장치를 세우는 것은 맵에 들어설 때 도는
// **스크립트**라 React 상태가 아니다 — 렌더 중에 읽으면 처음 한 프레임에는
// 아직 없다
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, type Material } from 'three'
import { loadPropMesh, loadPropSheet, type ChunkMesh } from './chunkMesh'
import { materialsFor } from './ChunkModels'
import { featureProps } from './movingProps'

interface Loaded {
  model: number
  mesh: ChunkMesh
  materials: Material[]
}

/** 모델 번호 → 실린 메시. 맵마다 몇 개 안 되므로 그대로 들고 있는다 */
const loading = new Set<number>()

export function FeatureProps() {
  /** 지금 세워야 할 것들의 열쇠 목록. 바뀔 때만 다시 그린다 */
  const [keys, setKeys] = useState<string>('')
  const [meshes, setMeshes] = useState<Map<number, Loaded>>(new Map())
  const groups = useRef(new Map<string, Group>())

  const wanted = featureProps()

  useEffect(() => {
    let alive = true
    for (const prop of featureProps()) {
      if (loading.has(prop.model)) continue
      loading.add(prop.model)
      void Promise.all([loadPropMesh(prop.model), loadPropSheet(prop.model)])
        .then(([mesh, sheet]) => {
          if (!alive) return
          // 소품은 전부 양면으로 그린다 — 청크 쪽과 같은 규칙이다
          const own = new Map<string, Material>()
          const made: Loaded = {
            model: prop.model, mesh,
            materials: materialsFor(mesh, sheet, own, mesh.materials.map(() => true)),
          }
          setMeshes((old) => new Map(old).set(prop.model, made))
        })
        .catch(() => { loading.delete(prop.model) })
    }
    return () => { alive = false }
  }, [keys])

  useFrame(() => {
    const now = featureProps()
    const key = now.map((p) => `${p.key}:${String(p.model)}`).join('|')
    if (key !== keys) setKeys(key)
    for (const p of now) {
      const g = groups.current.get(p.key)
      if (g === undefined) continue
      g.position.set(p.x, p.y, p.z)
      g.rotation.set(p.rotX ?? 0, p.rotY ?? 0, 0)
    }
  })

  return (
    <group>
      {wanted.map((p) => {
        const got = meshes.get(p.model)
        if (got === undefined) return null
        return (
          <group
            key={p.key}
            ref={(g) => {
              if (g === null) groups.current.delete(p.key)
              else groups.current.set(p.key, g)
            }}
            position={[p.x, p.y, p.z]}
            rotation={[p.rotX ?? 0, p.rotY ?? 0, 0]}
          >
            <mesh name={p.key} geometry={got.mesh.geometry} material={got.materials} castShadow receiveShadow />
          </group>
        )
      })}
    </group>
  )
}
