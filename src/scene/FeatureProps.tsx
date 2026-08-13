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
import {
  loadDistortionPropMesh, loadDistortionPropSheet, loadPropMesh, loadPropSheet,
  type ChunkMesh,
} from './chunkMesh'
import { materialsFor } from './ChunkModels'
import { featureProps } from './movingProps'

interface Loaded {
  key: string
  mesh: ChunkMesh
  materials: Material[]
}

/** 어느 아카이브의 몇 번인가. 두 아카이브의 번호가 겹치므로 열쇠를 합쳐 쓴다 */
const modelKey = (from: 'prop' | 'fldeff', model: number): string =>
  `${from}/${String(model)}`

const loading = new Set<string>()

export function FeatureProps() {
  /** 지금 세워야 할 것들의 열쇠 목록. 바뀔 때만 다시 그린다 */
  const [keys, setKeys] = useState<string>('')
  const [meshes, setMeshes] = useState<Map<string, Loaded>>(new Map())
  const groups = useRef(new Map<string, Group>())

  const wanted = featureProps()

  useEffect(() => {
    let alive = true
    for (const prop of featureProps()) {
      const from = prop.from ?? 'prop'
      const key = modelKey(from, prop.model)
      if (loading.has(key)) continue
      loading.add(key)
      const load = from === 'fldeff'
        ? Promise.all([loadDistortionPropMesh(prop.model), loadDistortionPropSheet(prop.model)])
        : Promise.all([loadPropMesh(prop.model), loadPropSheet(prop.model)])
      void load
        .then(([mesh, sheet]) => {
          if (!alive) return
          // 소품은 전부 양면으로 그린다 — 청크 쪽과 같은 규칙이다
          const own = new Map<string, Material>()
          const made: Loaded = {
            key, mesh,
            materials: materialsFor(mesh, sheet, own, mesh.materials.map(() => true)),
          }
          setMeshes((old) => new Map(old).set(key, made))
        })
        .catch(() => { loading.delete(key) })
    }
    return () => { alive = false }
  }, [keys])

  useFrame(() => {
    const now = featureProps()
    const key = now.map((p) => `${p.key}:${modelKey(p.from ?? 'prop', p.model)}`).join('|')
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
        const got = meshes.get(modelKey(p.from ?? 'prop', p.model))
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
