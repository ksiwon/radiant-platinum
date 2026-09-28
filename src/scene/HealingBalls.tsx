// 회복기 위에 놓이는 미니 몬스터볼 (PARITY §8.11 · `scene/healingMachine`)
//
// 원작은 볼을 **맵 소품으로** 새로 싣는다(`MapPropManager_LoadOne`) — 그래서 여기서도 소품 517을 소품
// 그리는 길(`AnimatedProp`)로 세운다. 다 놓이면 그 길이 원작 BTP0 클립(31 · 68프레임)을 한 번 돌린다.
//
// ⚠️ **목록을 프레임마다 묻는다.** 볼은 스크립트가 틱마다 하나씩 늘린다 — React 상태가 아니다 (`FeatureProps`와 같다)
import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Material } from 'three'
import { loadPropMesh, loadPropSheet, type ChunkMesh, type TexSheet } from './chunkMesh'
import { materialsFor } from './ChunkModels'
import { AnimatedProp, usePropAnimSet } from './AnimatedProp'
import { loadPropAnimSet } from './propAnim'
import { healBalls } from './healingMachine'
import { HEALING_BALL_MODEL } from '../engine/world/healingMachine'

function Ball({ mesh, sheet, x, y, z }: { mesh: ChunkMesh, sheet: TexSheet | null, x: number, y: number, z: number }) {
  const set = usePropAnimSet(loadPropAnimSet)
  // ⚠️ 재질은 **볼마다** 새것이다 — 클립이 재질의 그림을 갈아 끼운다 (`materialsFor`의 보관함)
  const materials = useMemo(() => {
    const own = new Map<string, Material>()
    return materialsFor(mesh, sheet, own, mesh.materials.map(() => true))
  }, [mesh, sheet])
  useEffect(() => () => { for (const m of materials) m.dispose() }, [materials])
  return (
    <group position={[x, y, z]}>
      {set === null ? (
        <mesh geometry={mesh.geometry} material={materials} />
      ) : (
        <AnimatedProp
          model={HEALING_BALL_MODEL} tile={[Math.floor(x), Math.floor(z)]}
          mesh={mesh} sheet={sheet} materials={materials} set={set}
          whole={mesh.geometry} fill={null}
        />
      )}
    </group>
  )
}

export function HealingBalls() {
  const [keys, setKeys] = useState('')
  const [model, setModel] = useState<{ mesh: ChunkMesh, sheet: TexSheet | null } | null>(null)
  const balls = healBalls()

  // 모델은 처음 볼이 놓일 때 받는다 — 센터 방은 늘 그 자리에 있으니 한 번 받으면 된다
  useEffect(() => {
    if (keys === '' || model !== null) return
    let alive = true
    void Promise.all([loadPropMesh(HEALING_BALL_MODEL), loadPropSheet(HEALING_BALL_MODEL)])
      .then(([mesh, sheet]) => { if (alive) setModel({ mesh, sheet }) })
      .catch(() => { /* 볼만 안 선다 */ })
    return () => { alive = false }
  }, [keys, model])

  useFrame(() => {
    const now = healBalls().map((b) => b.key).join('|')
    if (now !== keys) setKeys(now)
  })

  if (model === null) return null
  return (
    <group name="회복기 볼">
      {balls.map((b) => <Ball key={b.key} mesh={model.mesh} sheet={model.sheet} x={b.x} y={b.y} z={b.z} />)}
    </group>
  )
}
