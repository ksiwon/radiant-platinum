// 창기둥의 붉은 사슬 (`demo_kusari` · `ov6_02240260`) — 아카기 자리에 서서 BCA0 201프레임을 한 번 돈다
//
// 움직임은 `engine/world/spearPillarFx`가 세고(`spearPillarLive`), 여기는 그 프레임으로 노드를 옮겨 그리기만 한다.
// ⚠️ **BMA0(5번 · 재질 애니)는 아직 안 읽는다** — 사슬 색이 한 가지로 선다
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { BufferGeometry, Group, Material } from 'three'
import { loadDemoAnims, loadDemoMesh, loadDemoSheet, type ChunkMesh } from './chunkMesh'
import { propMaterials } from './propMeshes'
import { nodeMatrixAt, splitByNode, type PropClip } from './propAnim'
import { spearPillarLive } from './spearPillarFx'

interface Loaded {
  mesh: ChunkMesh
  materials: Material[]
  clip: PropClip | null
  info: NonNullable<Awaited<ReturnType<typeof loadDemoAnims>>>['info']
}

export function SpearPillarChain() {
  const [on, setOn] = useState(false)
  useFrame(() => {
    const now = spearPillarLive.chain?.visible === true && spearPillarLive.at !== null
    if (now !== on) setOn(now)
  })
  return on ? <Chain /> : null
}

function Chain() {
  const [got, setGot] = useState<Loaded | null>(null)
  useEffect(() => {
    let alive = true
    void Promise.all([loadDemoMesh('redChain'), loadDemoSheet('redChain'), loadDemoAnims('redChain')])
      .then(([mesh, sheet, anims]) => {
        if (!alive || anims === null) return
        setGot({ mesh, materials: propMaterials(mesh, sheet), clip: anims.clips[0] ?? null, info: anims.info })
      })
      .catch(() => { /* 사슬만 안 보인다 — 맥동과 길이는 그대로 흐른다 */ })
    return () => { alive = false }
  }, [])
  const parts = useMemo(() => (got ? splitByNode(got.mesh, got.info.submeshNodes) : null), [got])
  const root = useRef<Group>(null)
  const joints = useRef(new Map<number, Group>())

  useFrame(() => {
    const at = spearPillarLive.at
    const c = spearPillarLive.chain
    if (!root.current || !at || !c) return
    root.current.position.set(at[0], at[1], at[2])
    if (got?.clip?.kind !== 'BCA0') return
    for (const [node, group] of joints.current) {
      const base = got.info.nodes[node]
      if (!base) continue
      group.matrixAutoUpdate = false
      group.matrix.copy(nodeMatrixAt(base, got.clip.anim, node, c.frame))
      group.matrixWorldNeedsUpdate = true
    }
  })

  if (!got || !parts) return null
  return (
    <group ref={root} name="붉은 사슬">
      {[...parts].map(([node, geometry]: [number, BufferGeometry]) => (
        <group key={node} ref={(g) => { if (g) joints.current.set(node, g) }}>
          <mesh geometry={geometry} material={got.materials} />
        </group>
      ))}
    </group>
  )
}
