// 창기둥의 붉은 사슬 (`demo_kusari` · `ov6_02240260`) — 아카기 자리에 서서 BCA0 201프레임을 한 번 돈다
//
// 움직임은 `engine/world/spearPillarFx`가 세고(`spearPillarLive`), 여기는 그 프레임으로 노드를 옮겨 그리기만 한다.
// BCA0(4번)와 BMA0(5번 · 세 겹의 폴리곤 알파)는 `DemoInstance`가 건다 — 둘 다 같은 틱 프레임이다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { BufferGeometry, Group, Material } from 'three'
import { loadDemoAnims, loadDemoMesh, loadDemoSheet, type ChunkMesh } from './chunkMesh'
import { propMaterials } from './propMeshes'
import { nodeMatricesAt, splitByNode, submeshesOf, type PropClip } from './propAnim'
import { DemoInstance, loadDemoModel, type DemoLoaded, type DemoPose } from './demoInstance'
import { spearPillarLive } from './spearPillarFx'
import { ORB_ORDER, orbTiles } from '../engine/world/lakeOrbs'

interface Loaded {
  mesh: ChunkMesh
  materials: Material[]
  clip: PropClip | null
  info: NonNullable<Awaited<ReturnType<typeof loadDemoAnims>>>['info']
}

export function SpearPillarChain() {
  const [on, setOn] = useState(false)
  const [orb, setOrb] = useState(-1)
  useFrame(() => {
    const now = spearPillarLive.chain?.visible === true && spearPillarLive.at !== null
    if (now !== on) setOn(now)
    const o = spearPillarLive.orbs
    const which = o !== null && o.orb < 3 ? o.orb : -1
    if (which !== orb) setOrb(which)
  })
  return (
    <>
      {on && <Chain />}
      {orb >= 0 && <Orb key={orb} name={ORB_ORDER[orb]!} />}
    </>
  )
}

/**
 * 호수의 구슬 하나 (`demo_tama_*` · `ov6_0223EA98`) — 자리와 보임은 `lakeOrbs`가 정하고, BCA0(12프레임)는 한 틱에
 * 하나씩 돈다. 원작은 판 하나(XY 평면 · 한 칸)를 그대로 그린다 — 늘 카메라를 보게 돌리지 않는다
 */
function Orb({ name }: { name: string }) {
  const [got, setGot] = useState<Loaded | null>(null)
  useEffect(() => {
    let alive = true
    void Promise.all([loadDemoMesh(name), loadDemoSheet(name), loadDemoAnims(name)])
      .then(([mesh, sheet, anims]) => {
        if (!alive || anims === null) return
        const materials = propMaterials(mesh, sheet)
        for (const i of anims.blend.flatMap((rom) => submeshesOf(mesh, rom))) {
          const m = materials[i]
          if (!m) continue
          m.transparent = true
          m.depthWrite = false
          m.alphaTest = 0.01
          m.needsUpdate = true
        }
        setGot({ mesh, materials, clip: anims.clips[0] ?? null, info: anims.info })
      })
      .catch(() => { /* 구슬만 안 보인다 */ })
    return () => { alive = false }
  }, [name])
  const parts = useMemo(() => (got ? splitByNode(got.mesh, got.info.submeshNodes) : null), [got])
  const root = useRef<Group>(null)
  const joints = useRef(new Map<number, Group>())
  useFrame(() => {
    const o = spearPillarLive.orbs
    if (!root.current || !o) return
    root.current.visible = o.visible && o.state !== 0
    root.current.position.set(orbTiles(o.x), orbTiles(o.y), orbTiles(o.z))
    if (got?.clip?.kind !== 'BCA0') return
    const frame = o.anim % Math.max(1, got.clip.frames)
    const mats = nodeMatricesAt(got.info, got.clip.anim, joints.current.keys(), frame)
    for (const [node, group] of joints.current) {
      const mat = mats.get(node)
      if (!mat) continue
      group.matrixAutoUpdate = false
      group.matrix.copy(mat)
      group.matrixWorldNeedsUpdate = true
    }
  })
  if (!got || !parts) return null
  return (
    <group ref={root} name="호수의 구슬" visible={false}>
      {[...parts].map(([node, geometry]: [number, BufferGeometry]) => (
        <group key={node} ref={(g) => { if (g) joints.current.set(node, g) }}>
          <mesh geometry={geometry} material={got.materials} />
        </group>
      ))}
    </group>
  )
}

/** 서는 자리와 두 애니(BCA0 · BMA0)의 프레임은 같은 틱이 센다 — 둘 다 201프레임이다 */
const ONE: readonly [number, number, number] = [1, 1, 1]

function Chain() {
  const [got, setGot] = useState<DemoLoaded | null>(null)
  useEffect(() => {
    let alive = true
    void loadDemoModel('redChain').then((d) => { if (alive) setGot(d) })
    return () => { alive = false }
  }, [])
  // BMA0(5번)가 세 겹(lambert21~23)의 폴리곤 알파를 건다 — 한 틱 프레임으로 BCA0와 함께 (`ov6_02240260`)
  const pose = useCallback((): DemoPose | null => {
    const at = spearPillarLive.at
    const c = spearPillarLive.chain
    if (!at || !c) return null
    return { pos: at, scale: ONE, frames: [c.frame, c.frame] }
  }, [])
  if (!got) return null
  return <DemoInstance name="붉은 사슬" data={got} pose={pose} />
}
